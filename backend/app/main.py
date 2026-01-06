import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

# Track startup status for health checks
startup_status = {
    "database": False,
    "scheduler": False,
    "ready": False,
    "error": None
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting LinkedIn Automation API...")

    # Check for missing required config
    missing_config = settings.validate_required()
    if missing_config:
        logger.error(f"Missing required environment variables: {', '.join(missing_config)}")
        startup_status["error"] = f"Missing env vars: {', '.join(missing_config)}"
        # Don't try to connect if DATABASE_URL is missing
        if "DATABASE_URL" in missing_config:
            logger.error("Cannot connect to database - DATABASE_URL not set")
            startup_status["ready"] = True  # Mark as ready so health check responds
            yield
            return

    # Connect to database
    try:
        logger.info("Connecting to database...")
        await prisma.connect()
        startup_status["database"] = True
        logger.info("Database connected successfully")
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        startup_status["error"] = f"Database connection failed: {str(e)}"
        # Don't crash - let app respond to health checks with error status
        startup_status["ready"] = True
        yield
        return

    # Get settings from DB or use defaults
    try:
        db_settings = await prisma.settings.find_first(where={"id": "global"})
        logger.info(f"Loaded settings: {db_settings is not None}")
    except Exception as e:
        logger.warning(f"Failed to load settings, using defaults: {e}")
        db_settings = None

    # Schedule jobs
    try:
        logger.info("Setting up scheduled jobs...")
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
        startup_status["scheduler"] = True
        logger.info("Scheduler started with 4 jobs")
    except Exception as e:
        logger.error(f"Failed to start scheduler: {e}")
        startup_status["error"] = f"Scheduler failed: {str(e)}"
        # Continue without scheduler - app can still serve API requests

    startup_status["ready"] = True
    logger.info("LinkedIn Automation API started successfully!")

    yield

    # Shutdown
    logger.info("Shutting down LinkedIn Automation API...")
    try:
        scheduler.shutdown()
        logger.info("Scheduler shut down")
    except Exception as e:
        logger.warning(f"Error shutting down scheduler: {e}")

    try:
        await prisma.disconnect()
        logger.info("Database disconnected")
    except Exception as e:
        logger.warning(f"Error disconnecting database: {e}")

    logger.info("Shutdown complete")


app = FastAPI(
    title="LinkedIn Automation API",
    lifespan=lifespan
)

cors_origins = settings.get_cors_origins()
logger.info(f"CORS allowed origins: {cors_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
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


# Global exception handler to ensure CORS headers on errors
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
    )


@app.get("/health")
async def health():
    """Health check endpoint for Railway deployment monitoring"""
    # Basic health check - if we can respond, the app is running
    status = "healthy" if startup_status["ready"] else "starting"

    response = {
        "status": status,
        "database": startup_status["database"],
        "scheduler": startup_status["scheduler"],
    }

    if startup_status["error"]:
        response["error"] = startup_status["error"]

    return response


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "LinkedIn Automation API",
        "status": "running",
        "health": "/health"
    }
