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
    limit: Optional[int] = None,  # No limit by default
    _=Depends(get_current_user)
):
    where = {}
    if accountId:
        where["accountId"] = accountId
    if connectionStatus:
        where["connectionStatus"] = connectionStatus
    if dmStatus:
        where["dmStatus"] = dmStatus

    # Build query params - only include take if limit is specified
    query_params = {
        "where": where,
        "include": {"account": True, "post": True},
        "order": {"createdAt": "desc"},
    }
    if limit is not None:
        query_params["take"] = limit

    leads = await prisma.lead.find_many(**query_params)
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


def parse_connection_from_headline(headline: str) -> str:
    """
    Parse connection degree from LinkedIn headline.

    LinkedIn headlines often contain connection indicators like:
    - "1st" or "· 1st" for 1st degree connections
    - "2nd" or "· 2nd" for 2nd degree connections
    - "3rd" or "· 3rd" for 3rd degree connections

    Returns: "connected", "notConnected", or "unknown"
    """
    import re
    if not headline:
        return "unknown"

    # Normalize the headline (remove extra whitespace and control chars)
    headline = ' '.join(headline.split())

    # Check for 1st degree connection (connected)
    if re.search(r'\b1st\b', headline, re.IGNORECASE):
        return "connected"

    # Check for 2nd or 3rd degree (not directly connected)
    if re.search(r'\b2nd\b', headline, re.IGNORECASE) or re.search(r'\b3rd\b', headline, re.IGNORECASE):
        return "notConnected"

    # Check for "Out of network" or similar
    if re.search(r'out of network', headline, re.IGNORECASE):
        return "notConnected"

    return "unknown"


@router.post("/{lead_id}/check-connection")
async def check_lead_connection(lead_id: str, _=Depends(get_current_user)):
    """Manually check and update connection status for a single lead"""
    from datetime import datetime
    from app.services.linkedin.client import LinkedInDirectClient, LinkedInAPIError, LinkedInAuthError
    import logging
    logger = logging.getLogger(__name__)

    lead = await prisma.lead.find_unique(
        where={"id": lead_id},
        include={"account": {"include": {"cookies": True}}, "post": True}
    )
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    if not lead.account:
        raise HTTPException(status_code=400, detail="Account not found")

    # FIRST: Check headline for connection degree (most reliable)
    headline_status = parse_connection_from_headline(lead.headline)
    logger.info(f"Headline parsing for {lead.name}: '{lead.headline}' -> {headline_status}")

    if headline_status != "unknown":
        # We found connection status from headline - use it!
        status = headline_status
        logger.info(f"Using headline-based connection status: {status}")
    else:
        # Fallback to API check
        # Check for cookies
        if not lead.account.cookies or not lead.account.cookies.isValid:
            raise HTTPException(
                status_code=400,
                detail="LinkedIn cookies not synced or expired. Please sync from Chrome extension."
            )

        # Validate LinkedIn URL
        if not lead.linkedInUrl or not lead.linkedInUrl.strip():
            raise HTTPException(
                status_code=400,
                detail="Lead has no LinkedIn URL. Cannot check connection status."
            )

        try:
            client = await LinkedInDirectClient.create(lead.account.id)
            status = await client.check_connection(lead.linkedInUrl)
            logger.info(f"API-based connection status for {lead.name}: {status}")
        except LinkedInAuthError as e:
            raise HTTPException(status_code=401, detail=f"LinkedIn auth error: {str(e)}")
        except Exception as e:
            logger.warning(f"API check failed, using unknown: {e}")
            status = "unknown"

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


@router.post("/{lead_id}/send-connection")
async def send_connection_request(lead_id: str, _=Depends(get_current_user)):
    """Manually send a connection request to a lead"""
    from datetime import datetime
    from app.services.linkedin.client import LinkedInDirectClient, LinkedInAuthError

    lead = await prisma.lead.find_unique(
        where={"id": lead_id},
        include={"account": {"include": {"cookies": True}}, "post": True}
    )
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    if not lead.account:
        raise HTTPException(status_code=400, detail="Account not found")

    # Check for cookies
    if not lead.account.cookies or not lead.account.cookies.isValid:
        raise HTTPException(
            status_code=400,
            detail="LinkedIn cookies not synced or expired. Please sync from Chrome extension."
        )

    if lead.connectionStatus == "connected":
        raise HTTPException(status_code=400, detail="Already connected to this lead")

    # Validate LinkedIn URL
    if not lead.linkedInUrl or not lead.linkedInUrl.strip():
        raise HTTPException(
            status_code=400,
            detail="Lead has no LinkedIn URL. Cannot send connection request."
        )

    try:
        from app.services.linkedin.client import LinkedInAPIError

        client = await LinkedInDirectClient.create(lead.account.id)

        # Generate connection note
        first_name = lead.name.split()[0] if lead.name else "there"
        note = f"Hi {first_name}! Saw your comment and would love to connect."

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
            raise HTTPException(status_code=500, detail="Failed to send connection request - unknown error")
    except LinkedInAuthError as e:
        raise HTTPException(status_code=401, detail=f"LinkedIn auth error: {str(e)}")
    except LinkedInAPIError as e:
        # Propagate the detailed error message from LinkedIn API
        raise HTTPException(status_code=502, detail=f"LinkedIn API error: {str(e)}")
    except HTTPException:
        raise  # Re-raise HTTPExceptions as-is
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@router.post("/{lead_id}/send-dm")
async def send_dm_to_lead_manual(lead_id: str, _=Depends(get_current_user)):
    """Manually send DM to a connected lead - uses AI to generate personalized message"""
    from datetime import datetime
    from app.services.linkedin.client import LinkedInDirectClient, LinkedInAuthError
    from app.services.ai.client import generate_dm_from_settings

    lead = await prisma.lead.find_unique(
        where={"id": lead_id},
        include={"account": {"include": {"cookies": True}}, "post": True}
    )
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    if not lead.account:
        raise HTTPException(status_code=400, detail="Account not found")

    # Check for cookies
    if not lead.account.cookies or not lead.account.cookies.isValid:
        raise HTTPException(
            status_code=400,
            detail="LinkedIn cookies not synced or expired. Please sync from Chrome extension."
        )

    if lead.connectionStatus != "connected":
        raise HTTPException(status_code=400, detail=f"Cannot DM - lead is {lead.connectionStatus}, not connected")

    # Validate LinkedIn URL
    if not lead.linkedInUrl or not lead.linkedInUrl.strip():
        raise HTTPException(
            status_code=400,
            detail="Lead has no LinkedIn URL. Cannot send DM."
        )

    # Get message from pending DM first
    pending_dm = await prisma.pendingdm.find_first(
        where={"leadId": lead_id, "status": "pending"}
    )

    message = None
    if pending_dm:
        # Use existing pending DM
        message = pending_dm.editedText or pending_dm.message
    else:
        # Generate AI message or use template
        settings = await prisma.settings.find_first(where={"id": "global"})

        if settings and (settings.dmAiPrompt or settings.dmUserContext):
            # Use AI to generate personalized DM
            try:
                message = await generate_dm_from_settings(
                    lead_name=lead.name,
                    lead_headline=lead.headline,
                    source_keyword=lead.sourceKeyword,
                    source_post_title=lead.post.postTitle if lead.post else None,
                    user_context=settings.dmUserContext,
                    ai_prompt=settings.dmAiPrompt
                )
            except Exception as e:
                # Fall back to template if AI fails
                import logging
                logging.getLogger(__name__).warning(f"AI DM generation failed: {e}")
                if settings.defaultDmTemplate:
                    message = settings.defaultDmTemplate
        elif settings and settings.defaultDmTemplate:
            # Fall back to static template
            message = settings.defaultDmTemplate
            # Replace {name} placeholder
            first_name = lead.name.split()[0] if lead.name else "there"
            message = message.replace("{name}", first_name)

    if not message:
        raise HTTPException(
            status_code=400,
            detail="No DM configuration found. Please set up AI DM settings in Settings > AI DM Generation."
        )

    try:
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"Sending DM to {lead.name} at {lead.linkedInUrl}")
        logger.info(f"Message: {message[:100]}...")

        client = await LinkedInDirectClient.create(lead.account.id)
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
            logger.info(f"DM sent successfully to {lead.name}")
            return {
                "success": True,
                "message": "DM sent successfully",
                "lead": updated_lead
            }
        else:
            logger.error(f"LinkedAPI returned failure for DM to {lead.name}")
            raise HTTPException(status_code=500, detail="Failed to send DM - LinkedAPI returned failure. Check if you're connected to the lead.")
    except HTTPException:
        raise
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"DM send error: {e}")
        raise HTTPException(status_code=502, detail=f"Error: {str(e)}")


@router.post("/{lead_id}/preview-dm")
async def preview_dm(lead_id: str, _=Depends(get_current_user)):
    """Preview the AI-generated DM without sending it"""
    from app.services.ai.client import generate_dm_from_settings

    lead = await prisma.lead.find_unique(
        where={"id": lead_id},
        include={"account": True, "post": True}
    )
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Check for existing pending DM
    pending_dm = await prisma.pendingdm.find_first(
        where={"leadId": lead_id, "status": "pending"}
    )

    if pending_dm:
        return {
            "message": pending_dm.editedText or pending_dm.message,
            "source": "pending_dm",
            "canEdit": True,
            "pendingDmId": pending_dm.id
        }

    # Generate new message using AI
    settings = await prisma.settings.find_first(where={"id": "global"})

    message = None
    source = "none"

    if settings and (settings.dmAiPrompt or settings.dmUserContext):
        try:
            message = await generate_dm_from_settings(
                lead_name=lead.name,
                lead_headline=lead.headline,
                source_keyword=lead.sourceKeyword,
                source_post_title=lead.post.postTitle if lead.post else None,
                user_context=settings.dmUserContext,
                ai_prompt=settings.dmAiPrompt
            )
            source = "ai_generated"
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"AI DM generation failed: {e}")
            if settings.defaultDmTemplate:
                first_name = lead.name.split()[0] if lead.name else "there"
                message = settings.defaultDmTemplate.replace("{name}", first_name)
                source = "template"

    elif settings and settings.defaultDmTemplate:
        first_name = lead.name.split()[0] if lead.name else "there"
        message = settings.defaultDmTemplate.replace("{name}", first_name)
        source = "template"

    if not message:
        raise HTTPException(
            status_code=400,
            detail="No DM configuration found. Please set up AI DM settings in Settings > AI DM Generation."
        )

    return {
        "message": message,
        "source": source,
        "canEdit": True,
        "leadName": lead.name,
        "leadHeadline": lead.headline
    }


class QueueDMRequest(BaseModel):
    message: Optional[str] = None


@router.post("/{lead_id}/queue-dm")
async def queue_dm(lead_id: str, req: QueueDMRequest = None, _=Depends(get_current_user)):
    """Create or update a pending DM for review before sending"""
    from app.services.ai.client import generate_dm_from_settings

    lead = await prisma.lead.find_unique(
        where={"id": lead_id},
        include={"account": True, "post": True}
    )
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    message = req.message if req else None

    # If no message provided, generate one
    if not message:
        settings = await prisma.settings.find_first(where={"id": "global"})
        if settings and (settings.dmAiPrompt or settings.dmUserContext):
            try:
                message = await generate_dm_from_settings(
                    lead_name=lead.name,
                    lead_headline=lead.headline,
                    source_keyword=lead.sourceKeyword,
                    source_post_title=lead.post.postTitle if lead.post else None,
                    user_context=settings.dmUserContext,
                    ai_prompt=settings.dmAiPrompt
                )
            except Exception:
                pass

    if not message:
        raise HTTPException(status_code=400, detail="No message provided or generated")

    # Create or update pending DM
    existing = await prisma.pendingdm.find_first(
        where={"leadId": lead_id, "status": "pending"}
    )

    if existing:
        pending_dm = await prisma.pendingdm.update(
            where={"id": existing.id},
            data={"message": message}
        )
    else:
        pending_dm = await prisma.pendingdm.create(
            data={
                "leadId": lead_id,
                "message": message,
                "status": "pending"
            }
        )

    return {
        "success": True,
        "pendingDm": pending_dm,
        "message": "DM queued for review"
    }


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


@router.post("/{lead_id}/debug-connection")
async def debug_connection_request(lead_id: str, _=Depends(get_current_user)):
    """Debug connection request - shows detailed API responses"""
    import logging
    import json
    from app.services.linkedin.client import LinkedInDirectClient, LinkedInAuthError, LinkedInAPIError

    logger = logging.getLogger(__name__)
    debug_log = []

    lead = await prisma.lead.find_unique(
        where={"id": lead_id},
        include={"account": {"include": {"cookies": True}}, "post": True}
    )
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    if not lead.account or not lead.account.cookies or not lead.account.cookies.isValid:
        raise HTTPException(status_code=400, detail="No valid cookies")

    # Get profile URL
    profile_url = lead.linkedInUrl
    debug_log.append(f"Testing connection to: {profile_url}")

    try:
        client = await LinkedInDirectClient.create(lead.account.id)

        # Extract public ID
        public_id = client._extract_public_id(profile_url)
        debug_log.append(f"Extracted public ID: {public_id}")

        # Get member URN
        debug_log.append("Fetching member URN...")
        member_urn = await client._get_member_urn(public_id)
        debug_log.append(f"Member URN: {member_urn}")

        if not member_urn:
            return {
                "success": False,
                "error": "Could not get member URN",
                "debug_log": debug_log
            }

        # Now test each connection method individually and capture responses
        import uuid
        import httpx

        member_id = member_urn.split(":")[-1] if ":" in member_urn else member_urn
        tracking_id = str(uuid.uuid4())
        first_name = lead.name.split()[0] if lead.name else "there"
        note = f"Hi {first_name}! Saw your comment and would love to connect."

        method_results = []

        # Method 1: verifyQuotaAndConnect
        try:
            debug_log.append("\n--- Method 1: verifyQuotaAndConnect ---")
            payload = {
                "inviteeProfileUrn": member_urn,
                "trackingId": tracking_id,
                "customMessage": note[:300]
            }
            debug_log.append(f"Payload: {json.dumps(payload)}")

            response = await client._request(
                "POST",
                "/voyagerRelationshipsDashMemberRelationships?action=verifyQuotaAndConnect",
                json_data=payload
            )
            debug_log.append(f"SUCCESS! Response: {json.dumps(response, default=str)[:500]}")
            method_results.append({"method": "verifyQuotaAndConnect", "status": "success", "response": response})
        except LinkedInAPIError as e:
            debug_log.append(f"FAILED: {str(e)}")
            method_results.append({"method": "verifyQuotaAndConnect", "status": "failed", "error": str(e)})

        # Method 2: normInvitations with InviteeProfile
        try:
            debug_log.append("\n--- Method 2: normInvitations (InviteeProfile) ---")
            payload = {
                "invitee": {
                    "com.linkedin.voyager.growth.invitation.InviteeProfile": {
                        "profileUrn": member_urn
                    }
                },
                "trackingId": str(uuid.uuid4()),
                "message": note[:300]
            }
            debug_log.append(f"Payload: {json.dumps(payload)}")

            response = await client._request(
                "POST",
                "/growth/normInvitations",
                json_data=payload
            )
            debug_log.append(f"SUCCESS! Response: {json.dumps(response, default=str)[:500]}")
            method_results.append({"method": "normInvitations_InviteeProfile", "status": "success", "response": response})
        except LinkedInAPIError as e:
            debug_log.append(f"FAILED: {str(e)}")
            method_results.append({"method": "normInvitations_InviteeProfile", "status": "failed", "error": str(e)})

        # Check if any method succeeded
        any_success = any(r["status"] == "success" for r in method_results)

        return {
            "success": any_success,
            "lead_name": lead.name,
            "profile_url": profile_url,
            "member_urn": member_urn,
            "method_results": method_results,
            "debug_log": debug_log
        }

    except Exception as e:
        debug_log.append(f"ERROR: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "debug_log": debug_log
        }


@router.get("/debug/sent-invitations")
async def get_sent_invitations(accountId: Optional[str] = None, _=Depends(get_current_user)):
    """Fetch actual sent invitations from LinkedIn to verify requests were sent"""
    import logging
    from app.services.linkedin.client import LinkedInDirectClient, LinkedInAuthError, LinkedInAPIError

    logger = logging.getLogger(__name__)

    # Get account with cookies
    if accountId:
        account = await prisma.linkedinaccount.find_unique(
            where={"id": accountId},
            include={"cookies": True}
        )
    else:
        # Get first account with valid cookies
        account = await prisma.linkedinaccount.find_first(
            where={"cookies": {"isValid": True}},
            include={"cookies": True}
        )

    if not account:
        raise HTTPException(status_code=404, detail="No account found")

    if not account.cookies or not account.cookies.isValid:
        raise HTTPException(status_code=400, detail="No valid cookies for account")

    try:
        client = await LinkedInDirectClient.create(account.id)
        invitations = await client.get_sent_invitations(limit=50)

        # Check which of our leads are in the sent invitations
        leads = await prisma.lead.find_many(
            where={"accountId": account.id, "connectionStatus": "pending"}
        )

        lead_urls = {lead.linkedInUrl.rstrip('/').lower() for lead in leads}

        matched = []
        for invite in invitations:
            invite_url = invite.get("linkedInUrl", "").rstrip('/').lower()
            if invite_url and invite_url in lead_urls:
                matched.append(invite)

        return {
            "success": True,
            "account": account.name,
            "total_sent_invitations": len(invitations),
            "invitations": invitations[:20],  # First 20
            "matched_with_pending_leads": len(matched),
            "matched_leads": matched
        }

    except LinkedInAuthError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except LinkedInAPIError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        logger.error(f"Error fetching invitations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
