from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.routes.auth import get_current_user
from app.db.client import prisma

router = APIRouter()


class CreateWatchedAccountRequest(BaseModel):
    accountId: str
    targetUrl: str
    targetName: str
    targetHeadline: Optional[str] = None
    commentStyle: Optional[str] = None
    topicsToEngage: List[str] = []
    checkIntervalMins: int = 30


class UpdateWatchedAccountRequest(BaseModel):
    isActive: Optional[bool] = None
    commentStyle: Optional[str] = None
    topicsToEngage: Optional[List[str]] = None
    checkIntervalMins: Optional[int] = None


@router.get("/watched")
async def list_watched_accounts(
    accountId: Optional[str] = None,
    _=Depends(get_current_user)
):
    where = {}
    if accountId:
        where["accountId"] = accountId

    watched = await prisma.watchedaccount.find_many(
        where=where,
        include={"account": True},
        order={"createdAt": "desc"}
    )
    return watched


@router.post("/watched")
async def create_watched_account(req: CreateWatchedAccountRequest, _=Depends(get_current_user)):
    # Check if already watching this account
    existing = await prisma.watchedaccount.find_first(
        where={
            "accountId": req.accountId,
            "targetUrl": req.targetUrl
        }
    )
    if existing:
        raise HTTPException(status_code=400, detail="Already watching this account")

    watched = await prisma.watchedaccount.create(
        data={
            "accountId": req.accountId,
            "targetUrl": req.targetUrl,
            "targetName": req.targetName,
            "targetHeadline": req.targetHeadline,
            "commentStyle": req.commentStyle,
            "topicsToEngage": req.topicsToEngage,
            "checkIntervalMins": req.checkIntervalMins
        }
    )
    return watched


@router.patch("/watched/{watched_id}")
async def update_watched_account(
    watched_id: str,
    req: UpdateWatchedAccountRequest,
    _=Depends(get_current_user)
):
    data = req.model_dump(exclude_none=True)
    watched = await prisma.watchedaccount.update(
        where={"id": watched_id},
        data=data
    )
    return watched


@router.delete("/watched/{watched_id}")
async def delete_watched_account(watched_id: str, _=Depends(get_current_user)):
    await prisma.watchedaccount.delete(where={"id": watched_id})
    return {"success": True}


@router.get("/watched/{watched_id}/engagements")
async def get_engagements(watched_id: str, _=Depends(get_current_user)):
    engagements = await prisma.engagement.find_many(
        where={"watchedAccountId": watched_id},
        order={"engagedAt": "desc"},
        take=50
    )
    return engagements
