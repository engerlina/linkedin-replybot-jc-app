from typing import List, Optional
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import httpx

from app.api.routes.auth import get_current_user
from app.db.client import prisma
from app.config import settings
from app.services.reply_bot.poller import poll_single_post
from app.services.linkedapi.client import LinkedAPIError

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
    # Check if LINKEDAPI_API_KEY is configured (env var or database)
    api_key_configured = settings.LINKEDAPI_API_KEY
    if not api_key_configured:
        # Check database settings
        db_settings = await prisma.settings.find_first(where={"id": "global"})
        api_key_configured = db_settings and db_settings.linkedApiKey

    if not api_key_configured:
        raise HTTPException(
            status_code=503,
            detail="LinkedAPI API key not configured. Please set it in Settings."
        )

    post = await prisma.monitoredpost.find_unique(
        where={"id": post_id},
        include={"account": True}
    )
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    if not post.account.identificationToken:
        raise HTTPException(
            status_code=400,
            detail="Account missing identification token. Please update the account settings."
        )

    try:
        result = await poll_single_post(post)
        return result
    except httpx.HTTPStatusError as e:
        logger.error(f"LinkedAPI error for post {post_id}: {e}")
        if e.response.status_code == 401:
            raise HTTPException(
                status_code=401,
                detail="LinkedAPI authentication failed. Check your API key and identification token."
            )
        raise HTTPException(
            status_code=502,
            detail=f"LinkedAPI error: {e.response.status_code}"
        )
    except LinkedAPIError as e:
        logger.error(f"LinkedAPI workflow error for post {post_id}: {e}")
        raise HTTPException(status_code=502, detail=str(e))
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
    from app.services.linkedapi.client import LinkedAPIClient

    reply = await prisma.pendingreply.find_unique(
        where={"id": reply_id},
        include={"post": {"include": {"account": True}}}
    )
    if not reply:
        raise HTTPException(status_code=404, detail="Pending reply not found")

    if reply.status != "pending":
        raise HTTPException(status_code=400, detail=f"Reply already {reply.status}")

    # Get the text to send (edited or original)
    reply_text = reply.editedText or reply.generatedReply

    try:
        # Create LinkedAPI client and send the reply
        client = await LinkedAPIClient.create(reply.post.account.identificationToken)
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
            raise HTTPException(status_code=500, detail="Failed to send reply via LinkedAPI")

    except LinkedAPIError as e:
        logger.error(f"LinkedAPI error approving reply {reply_id}: {e}")
        raise HTTPException(status_code=502, detail=str(e))
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error approving reply {reply_id}: {e}")
        raise HTTPException(status_code=502, detail=f"LinkedAPI error: {e.response.status_code}")


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
