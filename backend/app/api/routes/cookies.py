"""
Cookie Sync API Routes

Handles syncing LinkedIn browser cookies from the Chrome extension to the backend.
"""

from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.routes.auth import get_current_user
from app.db.client import prisma

router = APIRouter()


class SyncCookiesRequest(BaseModel):
    """Request to sync LinkedIn cookies from Chrome extension"""
    liAt: str  # li_at session cookie
    jsessionId: str  # JSESSIONID cookie
    userAgent: Optional[str] = None
    accountId: Optional[str] = None  # If not provided, uses first active account


class CookieStatusResponse(BaseModel):
    """Response with cookie status info"""
    accountId: str
    accountName: str
    hasCookies: bool
    isValid: bool
    lastSyncedAt: Optional[datetime]
    lastUsedAt: Optional[datetime]
    lastError: Optional[str]


@router.post("/sync")
async def sync_cookies(req: SyncCookiesRequest, _=Depends(get_current_user)):
    """
    Sync LinkedIn cookies from Chrome extension.

    Called automatically by extension when cookies change,
    or manually via "Sync Now" button.
    """
    # Extract CSRF token from JSESSIONID (strip quotes)
    csrf_token = req.jsessionId.replace('"', '').replace("'", "")

    # Find target account
    account = None
    if req.accountId:
        account = await prisma.linkedinaccount.find_unique(
            where={"id": req.accountId}
        )
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")
    else:
        # Use first active account
        account = await prisma.linkedinaccount.find_first(
            where={"isActive": True},
            order={"createdAt": "asc"}
        )

    if not account:
        raise HTTPException(
            status_code=400,
            detail="No active account found. Please create an account first."
        )

    # Upsert cookies for this account
    await prisma.linkedincookie.upsert(
        where={"accountId": account.id},
        data={
            "create": {
                "accountId": account.id,
                "liAt": req.liAt,
                "jsessionId": req.jsessionId,
                "csrfToken": csrf_token,
                "userAgent": req.userAgent,
                "capturedAt": datetime.utcnow(),
                "isValid": True
            },
            "update": {
                "liAt": req.liAt,
                "jsessionId": req.jsessionId,
                "csrfToken": csrf_token,
                "userAgent": req.userAgent,
                "capturedAt": datetime.utcnow(),
                "isValid": True,
                "lastError": None  # Clear any previous error
            }
        }
    )

    return {
        "success": True,
        "message": f"Cookies synced for account '{account.name}'",
        "accountId": account.id,
        "accountName": account.name
    }


@router.get("/status")
async def get_cookie_status(
    accountId: Optional[str] = None,
    _=Depends(get_current_user)
):
    """
    Get cookie status for one or all accounts.

    Returns sync status, validity, and any errors.
    """
    if accountId:
        # Get status for specific account
        account = await prisma.linkedinaccount.find_unique(
            where={"id": accountId},
            include={"cookies": True}
        )
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")

        cookie = account.cookies
        return {
            "accountId": account.id,
            "accountName": account.name,
            "hasCookies": cookie is not None,
            "isValid": cookie.isValid if cookie else False,
            "lastSyncedAt": cookie.capturedAt if cookie else None,
            "lastUsedAt": cookie.lastUsedAt if cookie else None,
            "lastError": cookie.lastError if cookie else None
        }

    # Get status for all accounts
    accounts = await prisma.linkedinaccount.find_many(
        include={"cookies": True},
        order={"createdAt": "asc"}
    )

    return [
        {
            "accountId": a.id,
            "accountName": a.name,
            "hasCookies": a.cookies is not None,
            "isValid": a.cookies.isValid if a.cookies else False,
            "lastSyncedAt": a.cookies.capturedAt if a.cookies else None,
            "lastUsedAt": a.cookies.lastUsedAt if a.cookies else None,
            "lastError": a.cookies.lastError if a.cookies else None
        }
        for a in accounts
    ]


@router.post("/validate/{account_id}")
async def validate_cookies(account_id: str, _=Depends(get_current_user)):
    """
    Test if stored cookies are still valid.

    Makes a test API call to LinkedIn to verify cookies work.
    """
    from app.services.linkedin.client import LinkedInDirectClient, LinkedInAuthError

    cookie = await prisma.linkedincookie.find_unique(
        where={"accountId": account_id}
    )
    if not cookie:
        raise HTTPException(
            status_code=404,
            detail="No cookies found for this account. Sync from Chrome extension first."
        )

    try:
        client = LinkedInDirectClient(
            li_at=cookie.liAt,
            jsession_id=cookie.jsessionId,
            user_agent=cookie.userAgent
        )
        client.account_id = account_id

        # Try to get own profile as validation
        profile = await client.get_own_profile()

        # Update validity
        await prisma.linkedincookie.update(
            where={"accountId": account_id},
            data={
                "isValid": True,
                "lastUsedAt": datetime.utcnow(),
                "lastError": None
            }
        )

        return {
            "valid": True,
            "profile": profile,
            "message": "Cookies are valid!"
        }

    except LinkedInAuthError as e:
        await prisma.linkedincookie.update(
            where={"accountId": account_id},
            data={
                "isValid": False,
                "lastError": str(e)
            }
        )
        raise HTTPException(
            status_code=401,
            detail=f"Cookies are invalid or expired: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Validation failed: {str(e)}"
        )


@router.delete("/{account_id}")
async def delete_cookies(account_id: str, _=Depends(get_current_user)):
    """Delete stored cookies for an account"""
    cookie = await prisma.linkedincookie.find_unique(
        where={"accountId": account_id}
    )
    if not cookie:
        raise HTTPException(status_code=404, detail="No cookies found")

    await prisma.linkedincookie.delete(where={"accountId": account_id})

    return {"success": True, "message": "Cookies deleted"}
