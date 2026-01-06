from typing import List, Optional
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import httpx

from app.api.routes.auth import get_current_user
from app.db.client import prisma
from app.config import settings
from app.services.reply_bot.poller import poll_single_post
from app.services.linkedin.client import LinkedInAPIError, LinkedInAuthError

logger = logging.getLogger(__name__)

router = APIRouter()


class CreatePostRequest(BaseModel):
    accountId: str
    postUrl: str
    postTitle: Optional[str] = None
    keywords: List[str]
    ctaType: str
    ctaValue: str
    ctaMessage: Optional[str] = None
    replyStyle: Optional[str] = None


class UpdatePostRequest(BaseModel):
    postTitle: Optional[str] = None
    keywords: Optional[List[str]] = None
    ctaType: Optional[str] = None
    ctaValue: Optional[str] = None
    ctaMessage: Optional[str] = None
    replyStyle: Optional[str] = None
    isActive: Optional[bool] = None
    autoReply: Optional[bool] = None


class UpdatePendingReplyRequest(BaseModel):
    editedText: Optional[str] = None


@router.get("/posts")
async def list_posts(
    accountId: Optional[str] = None,
    _=Depends(get_current_user)
):
    where = {}
    if accountId:
        where["accountId"] = accountId

    posts = await prisma.monitoredpost.find_many(
        where=where,
        include={"account": True},
        order={"createdAt": "desc"}
    )
    return posts


@router.post("/posts")
async def create_post(req: CreatePostRequest, _=Depends(get_current_user)):
    # Check if post URL already exists
    existing = await prisma.monitoredpost.find_first(where={"postUrl": req.postUrl})
    if existing:
        raise HTTPException(status_code=400, detail="Post already being monitored")

    post = await prisma.monitoredpost.create(
        data={
            "accountId": req.accountId,
            "postUrl": req.postUrl,
            "postTitle": req.postTitle,
            "keywords": req.keywords,
            "ctaType": req.ctaType,
            "ctaValue": req.ctaValue,
            "ctaMessage": req.ctaMessage,
            "replyStyle": req.replyStyle
        }
    )
    return post


@router.patch("/posts/{post_id}")
async def update_post(post_id: str, req: UpdatePostRequest, _=Depends(get_current_user)):
    data = req.model_dump(exclude_none=True)
    post = await prisma.monitoredpost.update(
        where={"id": post_id},
        data=data
    )
    return post


@router.delete("/posts/{post_id}")
async def delete_post(post_id: str, _=Depends(get_current_user)):
    await prisma.monitoredpost.delete(where={"id": post_id})
    return {"success": True}


@router.post("/posts/{post_id}/poll")
async def trigger_poll(post_id: str, _=Depends(get_current_user)):
    """Manually trigger polling for a specific post"""
    post = await prisma.monitoredpost.find_unique(
        where={"id": post_id},
        include={"account": {"include": {"cookies": True}}}
    )
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    # Check for cookies
    if not post.account.cookies or not post.account.cookies.isValid:
        raise HTTPException(
            status_code=400,
            detail="LinkedIn cookies not synced or expired. Please sync from Chrome extension."
        )

    try:
        result = await poll_single_post(post)
        return result
    except LinkedInAuthError as e:
        logger.error(f"LinkedIn auth error for post {post_id}: {e}")
        raise HTTPException(
            status_code=401,
            detail="LinkedIn authentication failed. Cookies may be expired. Please re-sync from Chrome extension."
        )
    except LinkedInAPIError as e:
        logger.error(f"LinkedIn API error for post {post_id}: {e}")
        raise HTTPException(status_code=502, detail=str(e))
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error for post {post_id}: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"LinkedIn API error: {e.response.status_code}"
        )
    except Exception as e:
        logger.error(f"Unexpected error polling post {post_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Poll failed: {str(e)}")


@router.get("/posts/{post_id}/comments")
async def get_post_comments(
    post_id: str,
    matchesOnly: bool = False,
    _=Depends(get_current_user)
):
    where = {"postId": post_id}
    if matchesOnly:
        where["wasMatch"] = True

    comments = await prisma.processedcomment.find_many(
        where=where,
        order={"createdAt": "desc"},
        take=100
    )
    return comments


# ============================================
# REVIEW QUEUE ENDPOINTS
# ============================================

@router.get("/pending")
async def list_pending_replies(
    status: Optional[str] = "pending",
    postId: Optional[str] = None,
    _=Depends(get_current_user)
):
    """List pending replies for review"""
    where = {}
    if status:
        where["status"] = status
    if postId:
        where["postId"] = postId

    pending = await prisma.pendingreply.find_many(
        where=where,
        include={"post": {"include": {"account": True}}},
        order={"createdAt": "desc"},
        take=100
    )
    return pending


@router.get("/pending/{reply_id}")
async def get_pending_reply(reply_id: str, _=Depends(get_current_user)):
    """Get a single pending reply"""
    reply = await prisma.pendingreply.find_unique(
        where={"id": reply_id},
        include={"post": {"include": {"account": True}}}
    )
    if not reply:
        raise HTTPException(status_code=404, detail="Pending reply not found")
    return reply


@router.patch("/pending/{reply_id}")
async def update_pending_reply(
    reply_id: str,
    req: UpdatePendingReplyRequest,
    _=Depends(get_current_user)
):
    """Update a pending reply (edit the text)"""
    reply = await prisma.pendingreply.update(
        where={"id": reply_id},
        data={"editedText": req.editedText}
    )
    return reply


@router.post("/pending/{reply_id}/approve")
async def approve_pending_reply(reply_id: str, _=Depends(get_current_user)):
    """Approve and send a pending reply"""
    from datetime import datetime
    from app.services.linkedin.client import LinkedInDirectClient

    reply = await prisma.pendingreply.find_unique(
        where={"id": reply_id},
        include={"post": {"include": {"account": {"include": {"cookies": True}}}}}
    )
    if not reply:
        raise HTTPException(status_code=404, detail="Pending reply not found")

    if reply.status != "pending":
        raise HTTPException(status_code=400, detail=f"Reply already {reply.status}")

    # Check for cookies
    if not reply.post.account.cookies or not reply.post.account.cookies.isValid:
        raise HTTPException(
            status_code=400,
            detail="LinkedIn cookies not synced or expired. Please sync from Chrome extension."
        )

    # Get the text to send (edited or original)
    reply_text = reply.editedText or reply.generatedReply

    try:
        # Create LinkedIn client and send the reply
        client = await LinkedInDirectClient.create(reply.post.account.id)
        success = await client.comment_on_post(reply.post.postUrl, reply_text)

        if success:
            # Update pending reply status
            await prisma.pendingreply.update(
                where={"id": reply_id},
                data={
                    "status": "sent",
                    "reviewedAt": datetime.utcnow(),
                    "sentAt": datetime.utcnow()
                }
            )
            return {"success": True, "message": "Reply sent successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to send reply")

    except LinkedInAuthError as e:
        logger.error(f"LinkedIn auth error approving reply {reply_id}: {e}")
        raise HTTPException(status_code=401, detail=f"LinkedIn auth error: {str(e)}")
    except LinkedInAPIError as e:
        logger.error(f"LinkedIn API error approving reply {reply_id}: {e}")
        raise HTTPException(status_code=502, detail=str(e))
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error approving reply {reply_id}: {e}")
        raise HTTPException(status_code=502, detail=f"LinkedIn API error: {e.response.status_code}")


@router.post("/pending/{reply_id}/reject")
async def reject_pending_reply(reply_id: str, _=Depends(get_current_user)):
    """Reject a pending reply"""
    from datetime import datetime

    reply = await prisma.pendingreply.find_unique(where={"id": reply_id})
    if not reply:
        raise HTTPException(status_code=404, detail="Pending reply not found")

    if reply.status != "pending":
        raise HTTPException(status_code=400, detail=f"Reply already {reply.status}")

    await prisma.pendingreply.update(
        where={"id": reply_id},
        data={
            "status": "rejected",
            "reviewedAt": datetime.utcnow()
        }
    )
    return {"success": True, "message": "Reply rejected"}


@router.delete("/pending/{reply_id}")
async def delete_pending_reply(reply_id: str, _=Depends(get_current_user)):
    """Delete a pending reply"""
    await prisma.pendingreply.delete(where={"id": reply_id})
    return {"success": True}


# ============================================
# CHROME EXTENSION ENDPOINT
# ============================================

class AddLeadRequest(BaseModel):
    commenterUrl: str
    commenterName: str
    commenterHeadline: Optional[str] = None
    postUrl: str
    matchedKeyword: Optional[str] = "manual"
    replyText: Optional[str] = None


@router.post("/add-lead")
async def add_lead_from_extension(req: AddLeadRequest, _=Depends(get_current_user)):
    """
    Add a lead from the Chrome extension after replying to a comment.
    This creates a lead, checks connection status, and sends DM if connected.
    """
    import logging
    from datetime import datetime
    from app.services.linkedin.client import LinkedInDirectClient, LinkedInAuthError
    from app.services.ai.client import generate_dm_from_settings

    logger = logging.getLogger(__name__)

    # Validate commenter URL - must contain a LinkedIn profile
    if not req.commenterUrl or not req.commenterUrl.strip():
        raise HTTPException(
            status_code=400,
            detail="Commenter URL is required. Could not extract LinkedIn profile URL from comment."
        )
    if "/in/" not in req.commenterUrl:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid LinkedIn profile URL: {req.commenterUrl}"
        )

    # Find the monitored post by URL
    post = await prisma.monitoredpost.find_first(
        where={"postUrl": req.postUrl},
        include={"account": {"include": {"cookies": True}}}
    )

    # If post not found, try to find any active account to use
    if not post:
        # Get the first active account with valid cookies
        account = await prisma.linkedinaccount.find_first(
            where={"isActive": True},
            include={"cookies": True}
        )
        if not account:
            raise HTTPException(status_code=400, detail="No active LinkedIn account found")
        account_id = account.id
        post_id = None
        has_valid_cookies = account.cookies and account.cookies.isValid
    else:
        account_id = post.accountId
        post_id = post.id
        account = post.account
        has_valid_cookies = account.cookies and account.cookies.isValid

    # Check if lead already exists
    existing_lead = await prisma.lead.find_first(
        where={
            "accountId": account_id,
            "linkedInUrl": req.commenterUrl
        }
    )

    if existing_lead:
        # Update existing lead
        lead = await prisma.lead.update(
            where={"id": existing_lead.id},
            data={
                "sourceKeyword": req.matchedKeyword,
                "sourcePostUrl": req.postUrl,
                "updatedAt": datetime.utcnow()
            }
        )
        message = "Lead updated"
        is_new = False
    else:
        # Create new lead
        lead_data = {
            "account": {"connect": {"id": account_id}},
            "linkedInUrl": req.commenterUrl,
            "name": req.commenterName,
            "headline": req.commenterHeadline,
            "sourceKeyword": req.matchedKeyword,
            "sourcePostUrl": req.postUrl,
            "connectionStatus": "unknown"
        }

        if post_id:
            lead_data["post"] = {"connect": {"id": post_id}}

        lead = await prisma.lead.create(data=lead_data)
        message = "Lead created"
        is_new = True

    # Track what actions were taken
    actions = {"leadCreated": is_new, "connectionChecked": False, "dmSent": False}

    # Parse connection status from headline first (most reliable)
    import re
    def parse_connection_from_headline(headline: str) -> str:
        if not headline:
            return "unknown"
        headline = ' '.join(headline.split())
        if re.search(r'\b1st\b', headline, re.IGNORECASE):
            return "connected"
        if re.search(r'\b2nd\b', headline, re.IGNORECASE) or re.search(r'\b3rd\b', headline, re.IGNORECASE):
            return "notConnected"
        if re.search(r'out of network', headline, re.IGNORECASE):
            return "notConnected"
        return "unknown"

    # First try to get connection status from headline
    headline_status = parse_connection_from_headline(req.commenterHeadline)
    logger.info(f"Headline parsing for {req.commenterName}: '{req.commenterHeadline}' -> {headline_status}")

    connection_status = "unknown"

    if headline_status != "unknown":
        # Use headline-based status
        connection_status = headline_status
        actions["connectionChecked"] = True
        logger.info(f"Using headline-based connection status for {req.commenterName}: {connection_status}")

    # Fall back to API check if headline didn't reveal connection status
    elif has_valid_cookies:
        try:
            client = await LinkedInDirectClient.create(account_id)
            connection_status = await client.check_connection(req.commenterUrl)
            actions["connectionChecked"] = True
            logger.info(f"API-based connection status for {req.commenterName}: {connection_status}")
        except LinkedInAuthError as e:
            logger.warning(f"LinkedIn auth error checking connection: {e}")
            message += " (cookies expired)"
        except Exception as e:
            logger.warning(f"Error checking connection: {e}")
    else:
        message += " (sync cookies to auto-check connection)"

    # Update lead with connection status if we determined it
    if connection_status != "unknown":
        update_data = {"connectionStatus": connection_status}
        if connection_status == "connected":
            update_data["connectedAt"] = datetime.utcnow()

        lead = await prisma.lead.update(
            where={"id": lead.id},
            data=update_data
        )

    # If connected, generate and send DM immediately
    if connection_status == "connected" and lead.dmStatus != "sent" and has_valid_cookies:
        # Generate DM using AI
        db_settings = await prisma.settings.find_first(where={"id": "global"})
        dm_message = None

        if db_settings and (db_settings.dmAiPrompt or db_settings.dmUserContext):
            try:
                dm_message = await generate_dm_from_settings(
                    lead_name=lead.name,
                    lead_headline=lead.headline,
                    source_keyword=lead.sourceKeyword,
                    source_post_title=post.postTitle if post else None,
                    user_context=db_settings.dmUserContext,
                    ai_prompt=db_settings.dmAiPrompt
                )
            except Exception as e:
                logger.warning(f"AI DM generation failed: {e}")

        if not dm_message and db_settings and db_settings.defaultDmTemplate:
            first_name = lead.name.split()[0] if lead.name else "there"
            dm_message = db_settings.defaultDmTemplate.replace("{name}", first_name)

        if dm_message:
            # Send the DM
            try:
                client = await LinkedInDirectClient.create(account_id)
                success = await client.send_message(req.commenterUrl, dm_message)
                if success:
                    await prisma.lead.update(
                        where={"id": lead.id},
                        data={
                            "dmStatus": "sent",
                            "dmSentAt": datetime.utcnow(),
                            "dmText": dm_message
                        }
                    )
                    actions["dmSent"] = True
                    message += " and DM sent!"
                    logger.info(f"DM sent to {lead.name}")
            except Exception as e:
                logger.error(f"Failed to send DM: {e}")
                message += " (DM failed)"
        else:
            message += " (no DM template configured)"
    elif connection_status == "connected" and not has_valid_cookies:
        message += " (connected but need cookies to send DM)"
    elif connection_status != "connected" and connection_status != "unknown":
        message += f" (status: {connection_status})"

    return {
        "success": True,
        "message": message,
        "leadId": lead.id,
        "name": lead.name,
        "connectionStatus": lead.connectionStatus,
        "dmSent": actions["dmSent"],
        "actions": actions
    }


@router.get("/check-lead")
async def check_if_lead_exists(commenterUrl: str, _=Depends(get_current_user)):
    """
    Check if a lead already exists by their LinkedIn URL.
    Used by the Chrome extension to show "Already in flow" message.
    """
    if not commenterUrl or not commenterUrl.strip():
        return {"exists": False}

    # Normalize URL
    commenter_url = commenterUrl.strip()

    # Try to find the lead by LinkedIn URL
    lead = await prisma.lead.find_first(
        where={"linkedInUrl": commenter_url},
        include={"account": True}
    )

    if lead:
        return {
            "exists": True,
            "lead": {
                "id": lead.id,
                "name": lead.name,
                "connectionStatus": lead.connectionStatus,
                "dmStatus": lead.dmStatus
            }
        }
    else:
        return {"exists": False}


class BatchCheckLeadsRequest(BaseModel):
    commenterUrls: List[str]


@router.post("/batch-check-leads")
async def batch_check_leads(req: BatchCheckLeadsRequest, _=Depends(get_current_user)):
    """
    Check if multiple leads already exist by their LinkedIn URLs.
    Returns a dict mapping URL to lead info (or null if not found).
    Used by Chrome extension to pre-check which commenters are already leads.
    """
    if not req.commenterUrls:
        return {"leads": {}}

    # Normalize URLs
    urls = [url.strip().rstrip('/') for url in req.commenterUrls if url and url.strip()]

    if not urls:
        return {"leads": {}}

    # Find all leads matching any of the URLs
    leads = await prisma.lead.find_many(
        where={"linkedInUrl": {"in": urls}}
    )

    # Build response dict
    result = {}
    for lead in leads:
        result[lead.linkedInUrl] = {
            "id": lead.id,
            "name": lead.name,
            "connectionStatus": lead.connectionStatus,
            "dmStatus": lead.dmStatus,
            "sourcePostUrl": lead.sourcePostUrl
        }

    return {"leads": result}


class BulkTagLeadsRequest(BaseModel):
    postUrl: str
    leadIds: Optional[List[str]] = None  # If None, tag all leads without a sourcePostUrl


@router.post("/bulk-tag-leads")
async def bulk_tag_leads(req: BulkTagLeadsRequest, _=Depends(get_current_user)):
    """
    Bulk update leads with a source post URL (tag them to a specific post).
    If leadIds is provided, only those leads are updated.
    If leadIds is None, all leads without a sourcePostUrl are updated.
    """
    if not req.postUrl or not req.postUrl.strip():
        raise HTTPException(status_code=400, detail="Post URL is required")

    post_url = req.postUrl.strip()

    if req.leadIds:
        # Update specific leads
        result = await prisma.lead.update_many(
            where={"id": {"in": req.leadIds}},
            data={"sourcePostUrl": post_url}
        )
        return {"success": True, "updated": result, "message": f"Tagged {result} leads with post URL"}
    else:
        # Update all leads without a sourcePostUrl
        result = await prisma.lead.update_many(
            where={"sourcePostUrl": None},
            data={"sourcePostUrl": post_url}
        )
        return {"success": True, "updated": result, "message": f"Tagged {result} leads (those without existing post URL)"}
