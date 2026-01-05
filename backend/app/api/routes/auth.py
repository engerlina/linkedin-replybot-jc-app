from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import secrets

from app.config import settings
from app.db.client import prisma

router = APIRouter()
security = HTTPBearer()


class LoginRequest(BaseModel):
    password: str


class TokenResponse(BaseModel):
    token: str
    expiresAt: datetime


def verify_password(password: str) -> bool:
    return password == settings.ADMIN_PASSWORD


def create_token() -> tuple[str, datetime]:
    token = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(days=7)
    return token, expires


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    session = await prisma.session.find_first(
        where={
            "token": token,
            "expiresAt": {"gt": datetime.utcnow()}
        }
    )
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return session


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest):
    if not verify_password(req.password):
        raise HTTPException(status_code=401, detail="Invalid password")

    token, expires = create_token()

    await prisma.session.create(
        data={
            "token": token,
            "userId": "admin",
            "expiresAt": expires
        }
    )

    return TokenResponse(token=token, expiresAt=expires)


@router.post("/logout")
async def logout(session=Depends(get_current_user)):
    await prisma.session.delete(where={"id": session.id})
    return {"success": True}


@router.get("/me")
async def me(session=Depends(get_current_user)):
    return {"authenticated": True}
