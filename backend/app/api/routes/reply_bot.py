from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.routes.auth import get_current_user
from app.db.client import prisma
from app.services.reply_bot.poller import poll_single_post

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
        include={"account": True}
    )
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    result = await poll_single_post(post)
    return result


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
