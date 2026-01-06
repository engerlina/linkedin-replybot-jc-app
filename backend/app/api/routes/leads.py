from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.routes.auth import get_current_user
from app.db.client import prisma

router = APIRouter()


class UpdateLeadRequest(BaseModel):
    notes: Optional[str] = None
    connectionStatus: Optional[str] = None
    dmStatus: Optional[str] = None


@router.get("")
async def list_leads(
    accountId: Optional[str] = None,
    connectionStatus: Optional[str] = None,
    dmStatus: Optional[str] = None,
    limit: int = 100,
    _=Depends(get_current_user)
):
    where = {}
    if accountId:
        where["accountId"] = accountId
    if connectionStatus:
        where["connectionStatus"] = connectionStatus
    if dmStatus:
        where["dmStatus"] = dmStatus

    leads = await prisma.lead.find_many(
        where=where,
        include={"account": True, "post": True},
        order={"createdAt": "desc"},
        take=limit
    )
    return leads


@router.get("/{lead_id}")
async def get_lead(lead_id: str, _=Depends(get_current_user)):
    lead = await prisma.lead.find_unique(
        where={"id": lead_id},
        include={"account": True, "post": True}
    )
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


@router.patch("/{lead_id}")
async def update_lead(lead_id: str, req: UpdateLeadRequest, _=Depends(get_current_user)):
    data = req.model_dump(exclude_none=True)
    lead = await prisma.lead.update(
        where={"id": lead_id},
        data=data
    )
    return lead


@router.delete("/{lead_id}")
async def delete_lead(lead_id: str, _=Depends(get_current_user)):
    await prisma.lead.delete(where={"id": lead_id})
    return {"success": True}


@router.post("/{lead_id}/check-connection")
async def check_lead_connection(lead_id: str, _=Depends(get_current_user)):
    """Manually check and update connection status for a single lead"""
    from datetime import datetime
    from app.services.linkedapi.client import LinkedAPIClient, LinkedAPIError

    lead = await prisma.lead.find_unique(
        where={"id": lead_id},
        include={"account": True, "post": True}
    )
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    if not lead.account or not lead.account.identificationToken:
        raise HTTPException(status_code=400, detail="Account missing identification token")

    try:
        client = await LinkedAPIClient.create(lead.account.identificationToken)
        status = await client.check_connection(lead.linkedInUrl)

        # Update lead with new status
        update_data = {"connectionStatus": status}
        if status == "connected":
            update_data["connectedAt"] = datetime.utcnow()

        updated_lead = await prisma.lead.update(
            where={"id": lead_id},
            data=update_data,
            include={"account": True, "post": True}
        )

        return {
            "success": True,
            "connectionStatus": status,
            "lead": updated_lead
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LinkedAPI error: {str(e)}")


@router.post("/{lead_id}/send-connection")
async def send_connection_request(lead_id: str, _=Depends(get_current_user)):
    """Manually send a connection request to a lead"""
    from datetime import datetime
    from app.services.linkedapi.client import LinkedAPIClient

    lead = await prisma.lead.find_unique(
        where={"id": lead_id},
        include={"account": True, "post": True}
    )
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    if not lead.account or not lead.account.identificationToken:
        raise HTTPException(status_code=400, detail="Account missing identification token")

    if lead.connectionStatus == "connected":
        raise HTTPException(status_code=400, detail="Already connected to this lead")

    try:
        client = await LinkedAPIClient.create(lead.account.identificationToken)

        # Generate connection note
        note = f"Hi {lead.name.split()[0]}! Saw your comment and would love to connect."

        success = await client.send_connection_request(lead.linkedInUrl, note)

        if success:
            updated_lead = await prisma.lead.update(
                where={"id": lead_id},
                data={
                    "connectionStatus": "pending",
                    "connectionSentAt": datetime.utcnow()
                },
                include={"account": True, "post": True}
            )
            return {
                "success": True,
                "message": "Connection request sent",
                "lead": updated_lead
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to send connection request")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LinkedAPI error: {str(e)}")


@router.post("/{lead_id}/send-dm")
async def send_dm_to_lead_manual(lead_id: str, _=Depends(get_current_user)):
    """Manually send DM to a connected lead"""
    from datetime import datetime
    from app.services.linkedapi.client import LinkedAPIClient

    lead = await prisma.lead.find_unique(
        where={"id": lead_id},
        include={"account": True, "post": True}
    )
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    if not lead.account or not lead.account.identificationToken:
        raise HTTPException(status_code=400, detail="Account missing identification token")

    if lead.connectionStatus != "connected":
        raise HTTPException(status_code=400, detail=f"Cannot DM - lead is {lead.connectionStatus}, not connected")

    # Get message from pending DM or post CTA
    pending_dm = await prisma.pendingdm.find_first(
        where={"leadId": lead_id, "status": "pending"}
    )

    message = None
    if pending_dm:
        message = pending_dm.editedText or pending_dm.message
    elif lead.post and lead.post.ctaMessage:
        message = lead.post.ctaMessage
    else:
        # Get default template
        settings = await prisma.settings.find_first(where={"id": "global"})
        if settings and settings.defaultDmTemplate:
            message = settings.defaultDmTemplate

    if not message:
        raise HTTPException(status_code=400, detail="No DM message configured")

    # Replace {name} placeholder with lead's first name
    first_name = lead.name.split()[0] if lead.name else "there"
    message = message.replace("{name}", first_name)

    try:
        client = await LinkedAPIClient.create(lead.account.identificationToken)
        success = await client.send_message(lead.linkedInUrl, message)

        if success:
            # Update pending DM if exists
            if pending_dm:
                await prisma.pendingdm.update(
                    where={"id": pending_dm.id},
                    data={"status": "sent", "sentAt": datetime.utcnow()}
                )

            updated_lead = await prisma.lead.update(
                where={"id": lead_id},
                data={
                    "dmStatus": "sent",
                    "dmSentAt": datetime.utcnow(),
                    "dmText": message
                },
                include={"account": True, "post": True}
            )
            return {
                "success": True,
                "message": "DM sent successfully",
                "lead": updated_lead
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to send DM")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LinkedAPI error: {str(e)}")


@router.post("/{lead_id}/mark-sent")
async def mark_dm_as_sent(lead_id: str, _=Depends(get_current_user)):
    """Manually mark DM as sent (for when you sent it manually on LinkedIn)"""
    from datetime import datetime

    lead = await prisma.lead.find_unique(where={"id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Update any pending DMs
    await prisma.pendingdm.update_many(
        where={"leadId": lead_id, "status": "pending"},
        data={"status": "sent", "sentAt": datetime.utcnow()}
    )

    updated_lead = await prisma.lead.update(
        where={"id": lead_id},
        data={
            "dmStatus": "sent",
            "dmSentAt": datetime.utcnow()
        },
        include={"account": True, "post": True}
    )

    return {
        "success": True,
        "message": "Marked as sent",
        "lead": updated_lead
    }


@router.get("/stats/summary")
async def get_lead_stats(accountId: Optional[str] = None, _=Depends(get_current_user)):
    where = {}
    if accountId:
        where["accountId"] = accountId

    total = await prisma.lead.count(where=where)
    connected = await prisma.lead.count(where={**where, "connectionStatus": "connected"})
    pending = await prisma.lead.count(where={**where, "connectionStatus": "pending"})
    dm_sent = await prisma.lead.count(where={**where, "dmStatus": "sent"})

    return {
        "total": total,
        "connected": connected,
        "pending": pending,
        "dmSent": dm_sent
    }


@router.post("/process")
async def process_leads(_=Depends(get_current_user)):
    """
    Manually trigger lead processing:
    - Check connection status of unknown leads
    - Send connection requests to not-connected leads
    - Check pending connections
    """
    import logging
    from app.services.scheduler.jobs import run_connection_checker, run_pending_dm_sender

    logger = logging.getLogger(__name__)
    logger.info("Manual lead processing triggered")

    results = {
        "connectionChecker": "started",
        "dmSender": "started"
    }

    try:
        await run_connection_checker()
        results["connectionChecker"] = "completed"
    except Exception as e:
        logger.error(f"Connection checker error: {e}")
        results["connectionChecker"] = f"error: {str(e)}"

    try:
        await run_pending_dm_sender()
        results["dmSender"] = "completed"
    except Exception as e:
        logger.error(f"DM sender error: {e}")
        results["dmSender"] = f"error: {str(e)}"

    return {
        "success": True,
        "message": "Lead processing completed",
        "results": results
    }
