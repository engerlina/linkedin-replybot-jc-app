import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from prisma.errors import RecordNotFoundError, UniqueViolationError

from app.api.routes.auth import get_current_user
from app.db.client import prisma

logger = logging.getLogger(__name__)
router = APIRouter()


class CreateAccountRequest(BaseModel):
    name: str
    identificationToken: str  # LinkedAPI identification-token (per LinkedIn account)
    profileUrl: Optional[str] = None
    voiceTone: str = "professional"
    voiceTopics: List[str] = []
    sampleComments: List[str] = []


class UpdateAccountRequest(BaseModel):
    name: Optional[str] = None
    identificationToken: Optional[str] = None  # LinkedAPI identification-token
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
    # Check if identification token already exists
    existing = await prisma.linkedinaccount.find_first(
        where={"identificationToken": req.identificationToken}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Account with this identification token already exists")

    account = await prisma.linkedinaccount.create(
        data={
            "name": req.name,
            "identificationToken": req.identificationToken,
            "profileUrl": req.profileUrl,
            "voiceTone": req.voiceTone,
            "voiceTopics": req.voiceTopics,
            "sampleComments": req.sampleComments
        }
    )
    return account


@router.patch("/{account_id}")
async def update_account(account_id: str, req: UpdateAccountRequest, _=Depends(get_current_user)):
    data = req.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")

    try:
        account = await prisma.linkedinaccount.update(
            where={"id": account_id},
            data=data
        )
        return account
    except RecordNotFoundError:
        raise HTTPException(status_code=404, detail="Account not found")
    except UniqueViolationError:
        raise HTTPException(status_code=400, detail="This identification token is already used by another account")
    except Exception as e:
        logger.error(f"Failed to update account {account_id}: {e}")
        # Check for unique constraint in error message as fallback
        if "unique constraint" in str(e).lower() or "identificationtoken" in str(e).lower():
            raise HTTPException(status_code=400, detail="This identification token is already used by another account")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{account_id}")
async def delete_account(account_id: str, _=Depends(get_current_user)):
    await prisma.linkedinaccount.delete(where={"id": account_id})
    return {"success": True}
