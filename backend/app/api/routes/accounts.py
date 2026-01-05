from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.routes.auth import get_current_user
from app.db.client import prisma

router = APIRouter()


class CreateAccountRequest(BaseModel):
    name: str
    profileUrl: str
    linkedApiToken: str
    voiceTone: str = "professional"
    voiceTopics: List[str] = []
    sampleComments: List[str] = []


class UpdateAccountRequest(BaseModel):
    name: Optional[str] = None
    linkedApiToken: Optional[str] = None
    isActive: Optional[bool] = None
    voiceTone: Optional[str] = None
    voiceTopics: Optional[List[str]] = None
    sampleComments: Optional[List[str]] = None


@router.get("")
async def list_accounts(_=Depends(get_current_user)):
    accounts = await prisma.linkedinaccount.find_many(
        order={"createdAt": "desc"}
    )
    return accounts


@router.get("/{account_id}")
async def get_account(account_id: str, _=Depends(get_current_user)):
    account = await prisma.linkedinaccount.find_unique(
        where={"id": account_id}
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


@router.post("")
async def create_account(req: CreateAccountRequest, _=Depends(get_current_user)):
    # Check if profile URL already exists
    existing = await prisma.linkedinaccount.find_first(
        where={"profileUrl": req.profileUrl}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Account with this profile URL already exists")

    account = await prisma.linkedinaccount.create(
        data={
            "name": req.name,
            "profileUrl": req.profileUrl,
            "linkedApiToken": req.linkedApiToken,
            "voiceTone": req.voiceTone,
            "voiceTopics": req.voiceTopics,
            "sampleComments": req.sampleComments
        }
    )
    return account


@router.patch("/{account_id}")
async def update_account(account_id: str, req: UpdateAccountRequest, _=Depends(get_current_user)):
    data = req.model_dump(exclude_none=True)
    account = await prisma.linkedinaccount.update(
        where={"id": account_id},
        data=data
    )
    return account


@router.delete("/{account_id}")
async def delete_account(account_id: str, _=Depends(get_current_user)):
    await prisma.linkedinaccount.delete(where={"id": account_id})
    return {"success": True}
