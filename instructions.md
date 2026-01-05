# LinkedIn Automation Systems - Technical Architecture v2

## Overview

Two interconnected automation systems leveraging LinkedAPI.io for LinkedIn engagement:

1. **Reply Bot** - Keyword-triggered comment reply + DM sales funnel
2. **Comment Bot** - Intelligent engagement on watched accounts' posts

---

## Tech Stack Summary

| Layer | Technology | Purpose |
|-------|------------|---------|
| **API Backend** | FastAPI (Python) | Core automation logic, LinkedAPI orchestration, scheduling |
| **Admin Dashboard** | Next.js | Control panel, monitoring, configuration |
| **Database** | PostgreSQL | State management, lead tracking, job queue |
| **ORM** | Prisma | Type-safe database access (both Python + JS) |
| **AI/LLM** | Claude API (Anthropic) | Comment generation, sales message personalization |
| **Scheduler** | APScheduler | Built-in cron jobs (no Redis needed) |
| **Hosting** | Railway | FastAPI + Next.js + PostgreSQL |
| **Storage** | S3 / Railway Volume | Lead magnet files, logs |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              RAILWAY                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐    │
│  │   Next.js Admin  │────▶│   FastAPI        │────▶│   PostgreSQL     │    │
│  │   (Port 3000)    │     │   (Port 8000)    │     │   (Port 5432)    │    │
│  │                  │     │                  │     │                  │    │
│  │  • Dashboard     │     │  • REST API      │     │  • Leads         │    │
│  │  • Settings      │     │  • LinkedAPI     │     │  • Posts         │    │
│  │  • Lead Viewer   │     │  • AI Generation │     │  • Jobs Queue    │    │
│  │  • Logs          │     │  • APScheduler   │     │  • Engagements   │    │
│  └──────────────────┘     └────────┬─────────┘     └──────────────────┘    │
│                                    │                                        │
│                                    ▼                                        │
│                           ┌──────────────────┐                              │
│                           │   External APIs  │                              │
│                           │  • LinkedAPI.io  │                              │
│                           │  • Anthropic     │                              │
│                           └──────────────────┘                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
linkedin-automation/
├── backend/                        # FastAPI Backend
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                # FastAPI app + scheduler setup
│   │   ├── config.py              # Environment config
│   │   │
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── routes/
│   │   │   │   ├── auth.py        # Simple password auth
│   │   │   │   ├── accounts.py    # LinkedIn account management
│   │   │   │   ├── reply_bot.py   # Reply bot config + manual triggers
│   │   │   │   ├── comment_bot.py # Comment bot config + triggers
│   │   │   │   ├── leads.py       # Lead management
│   │   │   │   ├── logs.py        # Activity logs
│   │   │   │   └── stats.py       # Dashboard stats
│   │   │   └── deps.py            # Dependencies
│   │   │
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── linkedapi/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── client.py      # LinkedAPI HTTP client
│   │   │   │   └── actions.py     # Wrapped API actions
│   │   │   │
│   │   │   ├── reply_bot/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── poller.py      # Poll for new comments
│   │   │   │   ├── processor.py   # Process matching comments
│   │   │   │   └── messenger.py   # Connection + DM flow
│   │   │   │
│   │   │   ├── comment_bot/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── watcher.py     # Watch for new posts
│   │   │   │   └── engager.py     # Generate + post comments
│   │   │   │
│   │   │   ├── ai/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── client.py      # Anthropic client
│   │   │   │   └── prompts.py     # All prompt templates
│   │   │   │
│   │   │   └── scheduler/
│   │   │       ├── __init__.py
│   │   │       └── jobs.py        # APScheduler job definitions
│   │   │
│   │   ├── db/
│   │   │   ├── __init__.py
│   │   │   └── client.py          # Prisma client
│   │   │
│   │   └── utils/
│   │       ├── __init__.py
│   │       ├── rate_limiter.py    # Rate limiting logic
│   │       └── humanizer.py       # Random delays
│   │
│   ├── prisma/
│   │   └── schema.prisma
│   │
│   ├── requirements.txt
│   ├── Dockerfile
│   └── railway.toml
│
├── frontend/                       # Next.js Admin Dashboard
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx           # Login page
│   │   │   ├── dashboard/
│   │   │   │   ├── page.tsx       # Main dashboard
│   │   │   │   ├── reply-bot/
│   │   │   │   │   └── page.tsx   # Reply bot settings
│   │   │   │   ├── comment-bot/
│   │   │   │   │   └── page.tsx   # Comment bot settings
│   │   │   │   ├── leads/
│   │   │   │   │   └── page.tsx   # Lead management
│   │   │   │   └── logs/
│   │   │   │       └── page.tsx   # Activity logs
│   │   │   └── api/
│   │   │       └── [...proxy]/
│   │   │           └── route.ts   # Proxy to FastAPI
│   │   │
│   │   ├── components/
│   │   │   ├── ui/                # shadcn components
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   └── Header.tsx
│   │   │   ├── dashboard/
│   │   │   │   ├── StatsCards.tsx
│   │   │   │   └── ActivityFeed.tsx
│   │   │   ├── reply-bot/
│   │   │   │   ├── PostList.tsx
│   │   │   │   └── PostForm.tsx
│   │   │   ├── comment-bot/
│   │   │   │   ├── WatchList.tsx
│   │   │   │   └── WatchForm.tsx
│   │   │   └── leads/
│   │   │       ├── LeadTable.tsx
│   │   │       └── LeadDetail.tsx
│   │   │
│   │   ├── lib/
│   │   │   ├── api.ts             # API client
│   │   │   ├── auth.ts            # Auth helpers
│   │   │   └── utils.ts
│   │   │
│   │   └── hooks/
│   │       ├── useAuth.ts
│   │       └── useApi.ts
│   │
│   ├── package.json
│   ├── tailwind.config.ts
│   ├── Dockerfile
│   └── railway.toml
│
├── docker-compose.yml              # Local development
└── README.md
```

---

## Database Schema (Prisma)

```prisma
// backend/prisma/schema.prisma

generator client {
  provider             = "prisma-client-py"
  recursive_type_depth = 5
}

generator client_js {
  provider = "prisma-client-js"
  output   = "../../frontend/node_modules/.prisma/client"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================
// AUTHENTICATION
// ============================================

model AdminUser {
  id           String   @id @default(cuid())
  username     String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  lastLoginAt  DateTime?
}

model Session {
  id        String   @id @default(cuid())
  token     String   @unique
  userId    String
  expiresAt DateTime
  createdAt DateTime @default(now())
}

// ============================================
// LINKEDIN ACCOUNTS
// ============================================

model LinkedInAccount {
  id             String   @id @default(cuid())
  name           String
  profileUrl     String   @unique
  linkedApiToken String   // LinkedAPI account token
  isActive       Boolean  @default(true)
  
  // Voice/Style Settings
  voiceTone      String   @default("professional") // professional, casual, friendly
  voiceTopics    String[] // Areas of expertise
  sampleComments String[] // Example comments for style matching
  
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  // Relations
  monitoredPosts  MonitoredPost[]
  watchedAccounts WatchedAccount[]
  leads           Lead[]
  activityLogs    ActivityLog[]
}

// ============================================
// REPLY BOT
// ============================================

model MonitoredPost {
  id        String          @id @default(cuid())
  accountId String
  account   LinkedInAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  
  postUrl   String          @unique
  postTitle String?
  
  // Trigger Config
  keywords  String[]        // e.g., ["BUILD", "WANT", "YES"]
  isActive  Boolean         @default(true)
  
  // CTA Config
  ctaType   String          // link, lead_magnet, booking
  ctaValue  String          // URL or description
  ctaMessage String?        // Custom message template
  
  // Reply Config
  replyStyle String?        // Custom instructions for AI
  
  // Stats
  totalComments   Int       @default(0)
  totalMatches    Int       @default(0)
  totalLeads      Int       @default(0)
  
  lastPolledAt    DateTime?
  
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt
  
  processedComments ProcessedComment[]
  leads             Lead[]
}

model ProcessedComment {
  id            String        @id @default(cuid())
  postId        String
  post          MonitoredPost @relation(fields: [postId], references: [id], onDelete: Cascade)
  
  // Commenter Info
  commenterUrl  String
  commenterName String
  commenterHeadline String?
  commentText   String
  commentTime   String        // LinkedIn format: "3d", "1w"
  
  // Match Info
  matchedKeyword String?
  wasMatch       Boolean      @default(false)
  
  // Actions Taken
  repliedAt      DateTime?
  replyText      String?
  
  createdAt      DateTime     @default(now())
  
  @@unique([postId, commenterUrl, commentText])
  @@index([postId, wasMatch])
}

// ============================================
// COMMENT BOT
// ============================================

model WatchedAccount {
  id        String          @id @default(cuid())
  accountId String
  account   LinkedInAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  
  // Target Info
  targetUrl      String
  targetName     String
  targetHeadline String?
  
  // Config
  isActive       Boolean     @default(true)
  commentStyle   String?     // Custom style instructions
  topicsToEngage String[]    // Topics worth commenting on
  
  // Timing
  checkIntervalMins Int      @default(30)
  lastCheckedAt     DateTime?
  
  // Stats
  totalEngagements Int       @default(0)
  
  createdAt DateTime         @default(now())
  updatedAt DateTime         @updatedAt
  
  engagements Engagement[]
  
  @@unique([accountId, targetUrl])
}

model Engagement {
  id               String         @id @default(cuid())
  watchedAccountId String
  watchedAccount   WatchedAccount @relation(fields: [watchedAccountId], references: [id], onDelete: Cascade)
  
  // Post Info
  postUrl   String
  postText  String?
  postTime  DateTime?
  
  // Actions
  reacted      Boolean  @default(false)
  reactionType String?
  commented    Boolean  @default(false)
  commentText  String?
  
  engagedAt DateTime    @default(now())
  
  @@unique([watchedAccountId, postUrl])
}

// ============================================
// LEADS
// ============================================

model Lead {
  id        String          @id @default(cuid())
  accountId String
  account   LinkedInAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  postId    String?
  post      MonitoredPost?  @relation(fields: [postId], references: [id], onDelete: SetNull)
  
  // Lead Info
  linkedInUrl String
  name        String
  headline    String?
  
  // Source
  sourceKeyword String?
  sourcePostUrl String?
  
  // Connection Flow
  connectionStatus String   @default("unknown") // connected, pending, not_connected
  connectionSentAt DateTime?
  connectedAt      DateTime?
  
  // DM Flow
  dmStatus    String        @default("not_sent") // not_sent, queued, sent, replied
  dmSentAt    DateTime?
  dmText      String?
  
  // CTA
  ctaSent     Boolean       @default(false)
  ctaSentAt   DateTime?
  
  // Notes
  notes       String?
  
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  
  @@unique([accountId, linkedInUrl])
  @@index([connectionStatus])
  @@index([dmStatus])
}

// ============================================
// JOB QUEUE (PostgreSQL-based)
// ============================================

model ScheduledJob {
  id          String   @id @default(cuid())
  jobType     String   // poll_comments, check_posts, send_dm, check_connections
  status      String   @default("pending") // pending, running, completed, failed
  
  // Reference
  referenceId String?  // e.g., postId or watchedAccountId
  
  // Scheduling
  runAt       DateTime
  startedAt   DateTime?
  completedAt DateTime?
  
  // Payload
  payload     Json?
  
  // Error handling
  attempts    Int      @default(0)
  maxAttempts Int      @default(3)
  lastError   String?
  
  createdAt   DateTime @default(now())
  
  @@index([status, runAt])
  @@index([jobType, status])
}

// ============================================
// RATE LIMITING
// ============================================

model RateLimit {
  id         String   @id @default(cuid())
  accountId  String
  actionType String   // comment, message, connection_request
  date       DateTime @db.Date
  count      Int      @default(0)
  
  @@unique([accountId, actionType, date])
}

// ============================================
// ACTIVITY LOGS
// ============================================

model ActivityLog {
  id        String          @id @default(cuid())
  accountId String?
  account   LinkedInAccount? @relation(fields: [accountId], references: [id], onDelete: SetNull)
  
  action    String          // comment_posted, dm_sent, connection_sent, error
  status    String          // success, failed
  details   Json?
  
  createdAt DateTime        @default(now())
  
  @@index([accountId, createdAt])
  @@index([action, createdAt])
}

// ============================================
// SETTINGS
// ============================================

model Settings {
  id    String @id @default("global")
  
  // Rate Limits
  maxDailyComments    Int @default(50)
  maxDailyConnections Int @default(25)
  maxDailyMessages    Int @default(100)
  
  // Timing
  minDelaySeconds     Int @default(60)
  maxDelaySeconds     Int @default(300)
  
  // Scheduler
  replyBotIntervalMins   Int @default(10)
  commentBotIntervalMins Int @default(30)
  connectionCheckMins    Int @default(60)
  
  // Feature Flags
  replyBotEnabled    Boolean @default(true)
  commentBotEnabled  Boolean @default(true)
  
  updatedAt DateTime @updatedAt
}
```

---

## FastAPI Backend Implementation

### Main Application

```python
# backend/app/main.py

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.config import settings
from app.db.client import prisma
from app.api.routes import auth, accounts, reply_bot, comment_bot, leads, logs, stats
from app.services.scheduler.jobs import (
    run_reply_bot_poll,
    run_comment_bot_check,
    run_connection_checker,
    run_pending_dm_sender
)

scheduler = AsyncIOScheduler()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await prisma.connect()
    
    # Get settings from DB or use defaults
    db_settings = await prisma.settings.find_first(where={"id": "global"})
    
    # Schedule jobs
    scheduler.add_job(
        run_reply_bot_poll,
        IntervalTrigger(minutes=db_settings.replyBotIntervalMins if db_settings else 10),
        id="reply_bot_poll",
        replace_existing=True
    )
    
    scheduler.add_job(
        run_comment_bot_check,
        IntervalTrigger(minutes=db_settings.commentBotIntervalMins if db_settings else 30),
        id="comment_bot_check",
        replace_existing=True
    )
    
    scheduler.add_job(
        run_connection_checker,
        IntervalTrigger(minutes=db_settings.connectionCheckMins if db_settings else 60),
        id="connection_checker",
        replace_existing=True
    )
    
    scheduler.add_job(
        run_pending_dm_sender,
        IntervalTrigger(minutes=15),
        id="pending_dm_sender",
        replace_existing=True
    )
    
    scheduler.start()
    
    yield
    
    # Shutdown
    scheduler.shutdown()
    await prisma.disconnect()

app = FastAPI(
    title="LinkedIn Automation API",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(accounts.router, prefix="/api/accounts", tags=["accounts"])
app.include_router(reply_bot.router, prefix="/api/reply-bot", tags=["reply-bot"])
app.include_router(comment_bot.router, prefix="/api/comment-bot", tags=["comment-bot"])
app.include_router(leads.router, prefix="/api/leads", tags=["leads"])
app.include_router(logs.router, prefix="/api/logs", tags=["logs"])
app.include_router(stats.router, prefix="/api/stats", tags=["stats"])

@app.get("/health")
async def health():
    return {"status": "healthy"}
```

### Config

```python
# backend/app/config.py

from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str
    LINKEDAPI_API_KEY: str
    ANTHROPIC_API_KEY: str
    ADMIN_PASSWORD: str  # Simple password auth
    JWT_SECRET: str
    FRONTEND_URL: str = "http://localhost:3000"
    
    class Config:
        env_file = ".env"

settings = Settings()
```

### Auth Routes

```python
# backend/app/api/routes/auth.py

from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import hashlib
import secrets
import jwt

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
async def logout(session = Depends(get_current_user)):
    await prisma.session.delete(where={"id": session.id})
    return {"success": True}

@router.get("/me")
async def me(session = Depends(get_current_user)):
    return {"authenticated": True}
```

### Reply Bot Routes

```python
# backend/app/api/routes/reply_bot.py

from datetime import datetime
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
    _ = Depends(get_current_user)
):
    where = {}
    if accountId:
        where["accountId"] = accountId
    
    posts = await prisma.monitoredpost.find_many(
        where=where,
        include={"account": True, "_count": {"select": {"processedComments": True, "leads": True}}},
        order={"createdAt": "desc"}
    )
    return posts

@router.post("/posts")
async def create_post(req: CreatePostRequest, _ = Depends(get_current_user)):
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
async def update_post(post_id: str, req: UpdatePostRequest, _ = Depends(get_current_user)):
    data = req.model_dump(exclude_none=True)
    post = await prisma.monitoredpost.update(
        where={"id": post_id},
        data=data
    )
    return post

@router.delete("/posts/{post_id}")
async def delete_post(post_id: str, _ = Depends(get_current_user)):
    await prisma.monitoredpost.delete(where={"id": post_id})
    return {"success": True}

@router.post("/posts/{post_id}/poll")
async def trigger_poll(post_id: str, _ = Depends(get_current_user)):
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
    _ = Depends(get_current_user)
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
```

### LinkedAPI Client

```python
# backend/app/services/linkedapi/client.py

import asyncio
import httpx
from typing import Any, Optional
from app.config import settings

class LinkedAPIError(Exception):
    pass

class LinkedAPIClient:
    BASE_URL = "https://api.linkedapi.io"
    
    def __init__(self, account_token: str):
        self.account_token = account_token
        self.headers = {
            "Authorization": f"Bearer {settings.LINKEDAPI_API_KEY}",
            "Content-Type": "application/json"
        }
    
    async def execute(self, workflow: dict | list) -> dict:
        """Execute a LinkedAPI workflow and wait for completion"""
        async with httpx.AsyncClient(timeout=120.0) as client:
            # Start workflow
            response = await client.post(
                f"{self.BASE_URL}/workflows",
                headers=self.headers,
                json={
                    "accountToken": self.account_token,
                    "workflow": workflow
                }
            )
            response.raise_for_status()
            data = response.json()
            
            workflow_id = data["workflowId"]
            
            # Poll for completion
            for _ in range(60):  # Max 2 minutes
                await asyncio.sleep(2)
                
                status_response = await client.get(
                    f"{self.BASE_URL}/workflows/{workflow_id}",
                    headers=self.headers
                )
                status_data = status_response.json()
                
                if status_data["status"] == "completed":
                    return status_data.get("completion", {})
                elif status_data["status"] == "failed":
                    raise LinkedAPIError(status_data.get("error", "Workflow failed"))
            
            raise LinkedAPIError("Workflow timeout")
    
    # Convenience methods
    async def get_post_comments(self, post_url: str, limit: int = 50) -> list:
        result = await self.execute({
            "actionType": "st.retrievePostComments",
            "postUrl": post_url,
            "sort": "mostRecent",
            "limit": limit
        })
        return result.get("data", [])
    
    async def comment_on_post(self, post_url: str, text: str) -> bool:
        result = await self.execute({
            "actionType": "st.commentOnPost",
            "postUrl": post_url,
            "text": text
        })
        return result.get("success", False)
    
    async def check_connection(self, person_url: str) -> str:
        result = await self.execute({
            "actionType": "st.checkConnectionStatus",
            "personUrl": person_url
        })
        return result.get("data", {}).get("connectionStatus", "unknown")
    
    async def send_connection_request(self, person_url: str, note: str = None) -> bool:
        workflow = {
            "actionType": "st.sendConnectionRequest",
            "personUrl": person_url
        }
        if note:
            workflow["note"] = note[:300]  # LinkedIn limit
        
        result = await self.execute(workflow)
        return result.get("success", False)
    
    async def send_message(self, person_url: str, text: str) -> bool:
        result = await self.execute({
            "actionType": "st.sendMessage",
            "personUrl": person_url,
            "text": text
        })
        return result.get("success", False)
    
    async def get_person_posts(self, person_url: str, limit: int = 5, since: str = None) -> list:
        result = await self.execute({
            "actionType": "st.openPersonPage",
            "personUrl": person_url,
            "then": [{
                "actionType": "st.retrievePersonPosts",
                "limit": limit,
                **({"since": since} if since else {})
            }]
        })
        return result.get("data", {}).get("then", [{}])[0].get("data", [])
    
    async def react_and_comment(self, post_url: str, comment: str, reaction: str = "like") -> bool:
        result = await self.execute({
            "actionType": "st.openPost",
            "postUrl": post_url,
            "basicInfo": False,
            "then": [
                {"actionType": "st.reactToPost", "type": reaction},
                {"actionType": "st.commentOnPost", "text": comment}
            ]
        })
        return result.get("success", False)
```

### AI Service

```python
# backend/app/services/ai/client.py

from anthropic import AsyncAnthropic
from app.config import settings

client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

async def generate_reply_comment(
    original_comment: str,
    commenter_name: str,
    post_topic: str,
    cta_hint: str,
    voice_tone: str = "professional"
) -> str:
    """Generate a reply to a comment that matched a keyword"""
    
    prompt = f"""You are replying to a LinkedIn comment on your post about {post_topic}.

The commenter ({commenter_name}) wrote: "{original_comment}"

Write a friendly, engaging reply that:
1. Acknowledges their interest (they triggered a keyword)
2. Is warm and personal (use their first name)
3. Hints at the value you'll provide: {cta_hint}
4. Is 1-3 sentences max
5. Tone: {voice_tone}

Do NOT be salesy or pushy. Be genuine and helpful.
Write only the reply text, nothing else."""

    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=200,
        messages=[{"role": "user", "content": prompt}]
    )
    
    return response.content[0].text.strip()


async def generate_sales_dm(
    lead_name: str,
    lead_headline: str,
    post_topic: str,
    cta_type: str,
    cta_value: str,
    cta_message: str = None
) -> str:
    """Generate a personalized DM for a lead"""
    
    cta_instruction = cta_message or f"Include this CTA naturally: {cta_value}"
    
    prompt = f"""Write a LinkedIn DM to {lead_name} ({lead_headline}).

Context: They commented on your post about {post_topic} and showed interest.

Your goal: Send a helpful, non-pushy message that:
1. Thanks them for engaging
2. Provides immediate value
3. {cta_instruction}
4. Is conversational, not salesy
5. 3-5 sentences max

CTA type: {cta_type}
CTA: {cta_value}

Write only the message text, nothing else."""

    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}]
    )
    
    return response.content[0].text.strip()


async def generate_insightful_comment(
    post_content: str,
    author_name: str,
    author_headline: str,
    your_expertise: list[str],
    your_tone: str,
    comment_style: str = None,
    sample_comments: list[str] = None
) -> str:
    """Generate an insightful comment for the comment bot"""
    
    samples = ""
    if sample_comments:
        samples = f"\n\nExamples of your commenting style:\n" + "\n".join(f"- {c}" for c in sample_comments[-3:])
    
    prompt = f"""You're commenting on a LinkedIn post as an expert in: {', '.join(your_expertise)}.

Post by {author_name} ({author_headline}):
"{post_content}"

Write a thoughtful comment that:
1. Adds genuine value or insight
2. Shows expertise without being preachy
3. Is 2-4 sentences max
4. Sounds human, not AI-generated
5. Tone: {your_tone}
{f"6. Style notes: {comment_style}" if comment_style else ""}

NEVER use generic phrases like "Great post!" or "Thanks for sharing!"
{samples}

Write only the comment text, nothing else."""

    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=250,
        messages=[{"role": "user", "content": prompt}]
    )
    
    return response.content[0].text.strip()
```

### Scheduler Jobs

```python
# backend/app/services/scheduler/jobs.py

import asyncio
import random
from datetime import datetime, timedelta
from app.db.client import prisma
from app.services.linkedapi.client import LinkedAPIClient
from app.services.ai.client import generate_reply_comment, generate_sales_dm, generate_insightful_comment
from app.utils.rate_limiter import can_perform, record_action
from app.utils.humanizer import random_delay

async def run_reply_bot_poll():
    """Poll all active monitored posts for new comments"""
    settings = await prisma.settings.find_first(where={"id": "global"})
    if settings and not settings.replyBotEnabled:
        return
    
    posts = await prisma.monitoredpost.find_many(
        where={"isActive": True},
        include={"account": True}
    )
    
    for post in posts:
        try:
            await poll_single_post(post)
            await random_delay(30, 120)  # Wait between posts
        except Exception as e:
            await log_activity(post.accountId, "poll_error", "failed", {"error": str(e), "postId": post.id})


async def poll_single_post(post) -> dict:
    """Poll a single post for matching comments"""
    client = LinkedAPIClient(post.account.linkedApiToken)
    
    # Get recent comments
    comments = await client.get_post_comments(post.postUrl, limit=50)
    
    matches = []
    for comment in comments:
        # Skip if already processed
        existing = await prisma.processedcomment.find_first(
            where={
                "postId": post.id,
                "commenterUrl": comment["commenterUrl"],
                "commentText": comment.get("text") or ""
            }
        )
        if existing:
            continue
        
        # Check for keyword match
        comment_text = (comment.get("text") or "").lower()
        matched_keyword = None
        for keyword in post.keywords:
            if keyword.lower() in comment_text:
                matched_keyword = keyword
                break
        
        # Record the comment
        processed = await prisma.processedcomment.create(
            data={
                "postId": post.id,
                "commenterUrl": comment["commenterUrl"],
                "commenterName": comment["commenterName"],
                "commenterHeadline": comment.get("commenterHeadline"),
                "commentText": comment.get("text") or "",
                "commentTime": comment.get("time", ""),
                "matchedKeyword": matched_keyword,
                "wasMatch": matched_keyword is not None
            }
        )
        
        if matched_keyword:
            matches.append(processed)
    
    # Process matches
    for match in matches:
        await process_keyword_match(post, match, client)
    
    # Update last polled
    await prisma.monitoredpost.update(
        where={"id": post.id},
        data={
            "lastPolledAt": datetime.utcnow(),
            "totalComments": {"increment": len(comments)},
            "totalMatches": {"increment": len(matches)}
        }
    )
    
    return {"commentsFound": len(comments), "matchesFound": len(matches)}


async def process_keyword_match(post, comment, client: LinkedAPIClient):
    """Process a comment that matched a keyword"""
    account_id = post.accountId
    
    # Check rate limit for comments
    if not await can_perform(account_id, "comment"):
        return
    
    # 1. Generate and post reply
    reply_text = await generate_reply_comment(
        original_comment=comment.commentText,
        commenter_name=comment.commenterName,
        post_topic=post.postTitle or "this topic",
        cta_hint=post.ctaMessage or post.ctaValue,
        voice_tone=post.account.voiceTone
    )
    
    await random_delay(60, 180)  # Human-like delay
    
    success = await client.comment_on_post(post.postUrl, reply_text)
    
    if success:
        await record_action(account_id, "comment")
        await prisma.processedcomment.update(
            where={"id": comment.id},
            data={"repliedAt": datetime.utcnow(), "replyText": reply_text}
        )
        await log_activity(account_id, "reply_posted", "success", {
            "postId": post.id,
            "commenterUrl": comment.commenterUrl
        })
    
    # 2. Check connection and handle lead
    await random_delay(30, 90)
    
    connection_status = await client.check_connection(comment.commenterUrl)
    
    # Create/update lead
    lead = await prisma.lead.upsert(
        where={
            "accountId_linkedInUrl": {
                "accountId": account_id,
                "linkedInUrl": comment.commenterUrl
            }
        },
        create={
            "accountId": account_id,
            "postId": post.id,
            "linkedInUrl": comment.commenterUrl,
            "name": comment.commenterName,
            "headline": comment.commenterHeadline,
            "sourceKeyword": comment.matchedKeyword,
            "sourcePostUrl": post.postUrl,
            "connectionStatus": connection_status
        },
        update={
            "connectionStatus": connection_status
        }
    )
    
    # 3. Take action based on connection status
    if connection_status == "connected":
        # Send DM immediately
        if await can_perform(account_id, "message"):
            await send_dm_to_lead(lead, post, client)
    elif connection_status == "notConnected":
        # Send connection request
        if await can_perform(account_id, "connection_request"):
            await send_connection_to_lead(lead, post, client)


async def send_dm_to_lead(lead, post, client: LinkedAPIClient):
    """Send a sales DM to a connected lead"""
    dm_text = await generate_sales_dm(
        lead_name=lead.name,
        lead_headline=lead.headline or "",
        post_topic=post.postTitle or "my recent post",
        cta_type=post.ctaType,
        cta_value=post.ctaValue,
        cta_message=post.ctaMessage
    )
    
    await random_delay(60, 180)
    
    success = await client.send_message(lead.linkedInUrl, dm_text)
    
    if success:
        await record_action(post.accountId, "message")
        await prisma.lead.update(
            where={"id": lead.id},
            data={
                "dmStatus": "sent",
                "dmSentAt": datetime.utcnow(),
                "dmText": dm_text,
                "ctaSent": True,
                "ctaSentAt": datetime.utcnow()
            }
        )
        await log_activity(post.accountId, "dm_sent", "success", {"leadId": lead.id})


async def send_connection_to_lead(lead, post, client: LinkedAPIClient):
    """Send a connection request to a lead"""
    first_name = lead.name.split()[0]
    note = f"Hi {first_name}, saw your comment on my post about {post.postTitle or 'a topic I shared'}. Would love to connect!"
    
    await random_delay(60, 180)
    
    success = await client.send_connection_request(lead.linkedInUrl, note)
    
    if success:
        await record_action(post.accountId, "connection_request")
        await prisma.lead.update(
            where={"id": lead.id},
            data={
                "connectionStatus": "pending",
                "connectionSentAt": datetime.utcnow()
            }
        )
        await log_activity(post.accountId, "connection_sent", "success", {"leadId": lead.id})


async def run_connection_checker():
    """Check pending connections and send DMs to newly connected leads"""
    pending_leads = await prisma.lead.find_many(
        where={
            "connectionStatus": "pending",
            "dmStatus": "not_sent"
        },
        include={"account": True, "post": True}
    )
    
    for lead in pending_leads:
        try:
            client = LinkedAPIClient(lead.account.linkedApiToken)
            status = await client.check_connection(lead.linkedInUrl)
            
            if status == "connected":
                await prisma.lead.update(
                    where={"id": lead.id},
                    data={
                        "connectionStatus": "connected",
                        "connectedAt": datetime.utcnow()
                    }
                )
                
                # Queue DM
                if lead.post and await can_perform(lead.accountId, "message"):
                    await send_dm_to_lead(lead, lead.post, client)
            
            await random_delay(30, 60)
        except Exception as e:
            await log_activity(lead.accountId, "connection_check_error", "failed", {"error": str(e)})


async def run_comment_bot_check():
    """Check watched accounts for new posts and comment"""
    settings = await prisma.settings.find_first(where={"id": "global"})
    if settings and not settings.commentBotEnabled:
        return
    
    watched = await prisma.watchedaccount.find_many(
        where={"isActive": True},
        include={"account": True}
    )
    
    for target in watched:
        try:
            await check_and_engage(target)
            await random_delay(120, 300)  # Longer delay between accounts
        except Exception as e:
            await log_activity(target.accountId, "comment_bot_error", "failed", {"error": str(e)})


async def check_and_engage(target):
    """Check a watched account for new posts and engage"""
    client = LinkedAPIClient(target.account.linkedApiToken)
    
    since = target.lastCheckedAt.isoformat() if target.lastCheckedAt else None
    posts = await client.get_person_posts(target.targetUrl, limit=5, since=since)
    
    for post in posts:
        # Skip if already engaged
        existing = await prisma.engagement.find_first(
            where={
                "watchedAccountId": target.id,
                "postUrl": post["url"]
            }
        )
        if existing:
            continue
        
        # Check rate limit
        if not await can_perform(target.accountId, "comment"):
            break
        
        # Generate comment
        comment_text = await generate_insightful_comment(
            post_content=post.get("text") or "",
            author_name=target.targetName,
            author_headline=target.targetHeadline or "",
            your_expertise=target.account.voiceTopics,
            your_tone=target.account.voiceTone,
            comment_style=target.commentStyle,
            sample_comments=target.account.sampleComments
        )
        
        await random_delay(60, 240)
        
        # React and comment
        success = await client.react_and_comment(post["url"], comment_text)
        
        if success:
            await record_action(target.accountId, "comment")
            await prisma.engagement.create(
                data={
                    "watchedAccountId": target.id,
                    "postUrl": post["url"],
                    "postText": post.get("text"),
                    "reacted": True,
                    "reactionType": "like",
                    "commented": True,
                    "commentText": comment_text
                }
            )
            await log_activity(target.accountId, "engagement_posted", "success", {
                "targetUrl": target.targetUrl,
                "postUrl": post["url"]
            })
    
    # Update last checked
    await prisma.watchedaccount.update(
        where={"id": target.id},
        data={"lastCheckedAt": datetime.utcnow()}
    )


async def run_pending_dm_sender():
    """Send DMs to connected leads that haven't been messaged yet"""
    leads = await prisma.lead.find_many(
        where={
            "connectionStatus": "connected",
            "dmStatus": "not_sent"
        },
        include={"account": True, "post": True},
        take=10
    )
    
    for lead in leads:
        if lead.post and await can_perform(lead.accountId, "message"):
            try:
                client = LinkedAPIClient(lead.account.linkedApiToken)
                await send_dm_to_lead(lead, lead.post, client)
                await random_delay(120, 300)
            except Exception as e:
                await log_activity(lead.accountId, "dm_error", "failed", {"error": str(e)})


async def log_activity(account_id: str, action: str, status: str, details: dict = None):
    """Log an activity"""
    await prisma.activitylog.create(
        data={
            "accountId": account_id,
            "action": action,
            "status": status,
            "details": details or {}
        }
    )
```

### Rate Limiter Utility

```python
# backend/app/utils/rate_limiter.py

from datetime import datetime, date
from app.db.client import prisma

# Default limits (can be overridden by settings)
DEFAULT_LIMITS = {
    "comment": 50,
    "connection_request": 25,
    "message": 100
}

async def can_perform(account_id: str, action_type: str) -> bool:
    """Check if an action can be performed within rate limits"""
    settings = await prisma.settings.find_first(where={"id": "global"})
    
    limits = {
        "comment": settings.maxDailyComments if settings else DEFAULT_LIMITS["comment"],
        "connection_request": settings.maxDailyConnections if settings else DEFAULT_LIMITS["connection_request"],
        "message": settings.maxDailyMessages if settings else DEFAULT_LIMITS["message"]
    }
    
    today = date.today()
    
    record = await prisma.ratelimit.find_first(
        where={
            "accountId": account_id,
            "actionType": action_type,
            "date": today
        }
    )
    
    current_count = record.count if record else 0
    max_allowed = limits.get(action_type, 50)
    
    return current_count < max_allowed


async def record_action(account_id: str, action_type: str):
    """Record an action for rate limiting"""
    today = date.today()
    
    await prisma.ratelimit.upsert(
        where={
            "accountId_actionType_date": {
                "accountId": account_id,
                "actionType": action_type,
                "date": today
            }
        },
        create={
            "accountId": account_id,
            "actionType": action_type,
            "date": today,
            "count": 1
        },
        update={
            "count": {"increment": 1}
        }
    )


async def get_usage(account_id: str) -> dict:
    """Get current usage for an account"""
    today = date.today()
    settings = await prisma.settings.find_first(where={"id": "global"})
    
    records = await prisma.ratelimit.find_many(
        where={
            "accountId": account_id,
            "date": today
        }
    )
    
    usage = {}
    for action_type in ["comment", "connection_request", "message"]:
        record = next((r for r in records if r.actionType == action_type), None)
        limit_key = {
            "comment": "maxDailyComments",
            "connection_request": "maxDailyConnections",
            "message": "maxDailyMessages"
        }[action_type]
        
        usage[action_type] = {
            "used": record.count if record else 0,
            "limit": getattr(settings, limit_key) if settings else DEFAULT_LIMITS[action_type]
        }
    
    return usage
```

### Humanizer Utility

```python
# backend/app/utils/humanizer.py

import asyncio
import random

async def random_delay(min_seconds: int = 30, max_seconds: int = 180):
    """Add a random delay to appear more human-like"""
    delay = random.randint(min_seconds, max_seconds)
    await asyncio.sleep(delay)
```

---

## Next.js Frontend

### API Client

```typescript
// frontend/src/lib/api.ts

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
    }
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== 'undefined') {
      return localStorage.getItem('auth_token');
    }
    return null;
  }

  clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken();
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      this.clearToken();
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Request failed');
    }

    return response.json();
  }

  // Auth
  async login(password: string) {
    const data = await this.request<{ token: string; expiresAt: string }>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify({ password }) }
    );
    this.setToken(data.token);
    return data;
  }

  async logout() {
    await this.request('/api/auth/logout', { method: 'POST' });
    this.clearToken();
  }

  async checkAuth() {
    return this.request<{ authenticated: boolean }>('/api/auth/me');
  }

  // Stats
  async getStats() {
    return this.request<DashboardStats>('/api/stats');
  }

  // Accounts
  async getAccounts() {
    return this.request<LinkedInAccount[]>('/api/accounts');
  }

  async createAccount(data: CreateAccountRequest) {
    return this.request<LinkedInAccount>('/api/accounts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Reply Bot
  async getMonitoredPosts(accountId?: string) {
    const query = accountId ? `?accountId=${accountId}` : '';
    return this.request<MonitoredPost[]>(`/api/reply-bot/posts${query}`);
  }

  async createMonitoredPost(data: CreatePostRequest) {
    return this.request<MonitoredPost>('/api/reply-bot/posts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateMonitoredPost(id: string, data: UpdatePostRequest) {
    return this.request<MonitoredPost>(`/api/reply-bot/posts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteMonitoredPost(id: string) {
    return this.request(`/api/reply-bot/posts/${id}`, { method: 'DELETE' });
  }

  async triggerPoll(postId: string) {
    return this.request<PollResult>(`/api/reply-bot/posts/${postId}/poll`, {
      method: 'POST',
    });
  }

  // Comment Bot
  async getWatchedAccounts(accountId?: string) {
    const query = accountId ? `?accountId=${accountId}` : '';
    return this.request<WatchedAccount[]>(`/api/comment-bot/watched${query}`);
  }

  async createWatchedAccount(data: CreateWatchedRequest) {
    return this.request<WatchedAccount>('/api/comment-bot/watched', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteWatchedAccount(id: string) {
    return this.request(`/api/comment-bot/watched/${id}`, { method: 'DELETE' });
  }

  // Leads
  async getLeads(filters?: LeadFilters) {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.accountId) params.set('accountId', filters.accountId);
    const query = params.toString() ? `?${params}` : '';
    return this.request<Lead[]>(`/api/leads${query}`);
  }

  async updateLead(id: string, data: UpdateLeadRequest) {
    return this.request<Lead>(`/api/leads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Logs
  async getLogs(limit = 50) {
    return this.request<ActivityLog[]>(`/api/logs?limit=${limit}`);
  }

  // Settings
  async getSettings() {
    return this.request<Settings>('/api/settings');
  }

  async updateSettings(data: Partial<Settings>) {
    return this.request<Settings>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }
}

export const api = new ApiClient();

// Types
export interface DashboardStats {
  totalLeads: number;
  leadsToday: number;
  commentsToday: number;
  connectionsToday: number;
  dmsSentToday: number;
  activeMonitoredPosts: number;
  activeWatchedAccounts: number;
}

export interface LinkedInAccount {
  id: string;
  name: string;
  profileUrl: string;
  isActive: boolean;
  voiceTone: string;
  voiceTopics: string[];
}

export interface MonitoredPost {
  id: string;
  accountId: string;
  postUrl: string;
  postTitle: string | null;
  keywords: string[];
  ctaType: string;
  ctaValue: string;
  isActive: boolean;
  totalMatches: number;
  totalLeads: number;
  lastPolledAt: string | null;
}

export interface WatchedAccount {
  id: string;
  accountId: string;
  targetUrl: string;
  targetName: string;
  isActive: boolean;
  totalEngagements: number;
  lastCheckedAt: string | null;
}

export interface Lead {
  id: string;
  name: string;
  linkedInUrl: string;
  headline: string | null;
  connectionStatus: string;
  dmStatus: string;
  sourceKeyword: string | null;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  action: string;
  status: string;
  details: Record<string, any>;
  createdAt: string;
}

export interface Settings {
  maxDailyComments: number;
  maxDailyConnections: number;
  maxDailyMessages: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  replyBotIntervalMins: number;
  commentBotIntervalMins: number;
  replyBotEnabled: boolean;
  commentBotEnabled: boolean;
}
```

### Login Page

```tsx
// frontend/src/app/page.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await api.login(password);
      router.push('/dashboard');
    } catch (err) {
      setError('Invalid password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-md">
        <h1 className="text-2xl font-bold text-white mb-6 text-center">
          LinkedIn Automation
        </h1>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-gray-300 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
              placeholder="Enter password"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

### Dashboard Page

```tsx
// frontend/src/app/dashboard/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { api, DashboardStats, ActivityLog } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

export default function DashboardPage() {
  useAuth(); // Redirect if not authenticated
  
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [statsData, logsData] = await Promise.all([
        api.getStats(),
        api.getLogs(20),
      ]);
      setStats(statsData);
      setLogs(logsData);
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-white">Loading...</div>;
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Leads Today" value={stats?.leadsToday || 0} />
        <StatCard title="Comments Today" value={stats?.commentsToday || 0} />
        <StatCard title="Connections Sent" value={stats?.connectionsToday || 0} />
        <StatCard title="DMs Sent" value={stats?.dmsSentToday || 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Automations */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Active Automations</h2>
          <div className="space-y-3">
            <div className="flex justify-between text-gray-300">
              <span>Monitored Posts (Reply Bot)</span>
              <span className="font-medium">{stats?.activeMonitoredPosts || 0}</span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>Watched Accounts (Comment Bot)</span>
              <span className="font-medium">{stats?.activeWatchedAccounts || 0}</span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>Total Leads</span>
              <span className="font-medium">{stats?.totalLeads || 0}</span>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Recent Activity</h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between text-sm py-2 border-b border-gray-700"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      log.status === 'success' ? 'bg-green-500' : 'bg-red-500'
                    }`}
                  />
                  <span className="text-gray-300">{formatAction(log.action)}</span>
                </div>
                <span className="text-gray-500 text-xs">
                  {formatTime(log.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <p className="text-gray-400 text-sm">{title}</p>
      <p className="text-3xl font-bold text-white mt-1">{value}</p>
    </div>
  );
}

function formatAction(action: string): string {
  return action.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}
```

### Auth Hook

```tsx
// frontend/src/hooks/useAuth.ts

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export function useAuth() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = api.getToken();
    if (!token) {
      router.push('/');
      return;
    }

    try {
      await api.checkAuth();
      setIsAuthenticated(true);
    } catch {
      api.clearToken();
      router.push('/');
    }
  };

  return { isAuthenticated };
}
```

### Dashboard Layout

```tsx
// frontend/src/app/dashboard/layout.tsx

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: '📊' },
  { href: '/dashboard/reply-bot', label: 'Reply Bot', icon: '💬' },
  { href: '/dashboard/comment-bot', label: 'Comment Bot', icon: '✍️' },
  { href: '/dashboard/leads', label: 'Leads', icon: '👥' },
  { href: '/dashboard/logs', label: 'Logs', icon: '📋' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙️' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {}
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-gray-900 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-800 border-r border-gray-700">
        <div className="p-6">
          <h1 className="text-xl font-bold text-white">LinkedIn Bot</h1>
        </div>
        
        <nav className="mt-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-6 py-3 text-sm ${
                pathname === item.href
                  ? 'bg-gray-700 text-white border-r-2 border-blue-500'
                  : 'text-gray-400 hover:bg-gray-700 hover:text-white'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="absolute bottom-0 w-64 p-4 border-t border-gray-700">
          <button
            onClick={handleLogout}
            className="w-full py-2 text-gray-400 hover:text-white text-sm"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
```

---

## Docker Compose (Local Development)

```yaml
# docker-compose.yml

version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: linkedin
      POSTGRES_PASSWORD: linkedin123
      POSTGRES_DB: linkedin_automation
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql://linkedin:linkedin123@postgres:5432/linkedin_automation
      LINKEDAPI_API_KEY: ${LINKEDAPI_API_KEY}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD:-admin123}
      JWT_SECRET: ${JWT_SECRET:-dev-secret-change-me}
      FRONTEND_URL: http://localhost:3000
    depends_on:
      - postgres
    volumes:
      - ./backend:/app
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8000
    volumes:
      - ./frontend:/app
      - /app/node_modules
    command: npm run dev

volumes:
  postgres_data:
```

---

## Railway Deployment

### Backend railway.toml

```toml
# backend/railway.toml

[build]
builder = "dockerfile"

[deploy]
startCommand = "prisma migrate deploy && uvicorn app.main:app --host 0.0.0.0 --port $PORT"
healthcheckPath = "/health"
healthcheckTimeout = 300
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

### Frontend railway.toml

```toml
# frontend/railway.toml

[build]
builder = "dockerfile"

[deploy]
startCommand = "npm start"
```

---

## Environment Variables

```env
# Backend (.env)
DATABASE_URL=postgresql://user:pass@host:5432/linkedin_automation
LINKEDAPI_API_KEY=your_linkedapi_key
ANTHROPIC_API_KEY=your_anthropic_key
ADMIN_PASSWORD=your_secure_password
JWT_SECRET=your_jwt_secret
FRONTEND_URL=https://your-frontend.railway.app

# Frontend (.env.local)
NEXT_PUBLIC_API_URL=https://your-backend.railway.app
```

---

## Quick Start

```bash
# 1. Clone and setup
git clone <repo>
cd linkedin-automation

# 2. Set environment variables
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
# Edit both files with your keys

# 3. Start with Docker Compose
docker-compose up -d

# 4. Run migrations
docker-compose exec backend prisma migrate dev

# 5. Open browser
# Frontend: http://localhost:3000
# Backend API: http://localhost:8000/docs
```