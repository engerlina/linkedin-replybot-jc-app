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
