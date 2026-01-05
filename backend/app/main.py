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
