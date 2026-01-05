from typing import Optional
from fastapi import APIRouter, Depends

from app.api.routes.auth import get_current_user
from app.db.client import prisma

router = APIRouter()


@router.get("")
async def list_logs(
    accountId: Optional[str] = None,
    action: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    _=Depends(get_current_user)
):
    where = {}
    if accountId:
        where["accountId"] = accountId
    if action:
        where["action"] = action
    if status:
        where["status"] = status

    logs = await prisma.activitylog.find_many(
        where=where,
        include={"account": True},
        order={"createdAt": "desc"},
        take=limit
    )
    return logs
