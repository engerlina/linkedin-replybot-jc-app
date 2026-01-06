from datetime import datetime, date, timezone
from fastapi import APIRouter, Depends

from app.api.routes.auth import get_current_user
from app.db.client import prisma

router = APIRouter()


@router.get("")
async def get_dashboard_stats(_=Depends(get_current_user)):
    today = date.today()
    today_start = datetime.combine(today, datetime.min.time())
    # Convert date to datetime for Prisma compatibility
    today_datetime = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc)

    # Total leads
    total_leads = await prisma.lead.count()

    # Leads today
    leads_today = await prisma.lead.count(
        where={"createdAt": {"gte": today_start}}
    )

    # Comments today (from rate limit records)
    comment_records = await prisma.ratelimit.find_many(
        where={
            "actionType": "comment",
            "date": today_datetime
        }
    )
    comments_today = sum(r.count for r in comment_records)

    # Connections today
    connection_records = await prisma.ratelimit.find_many(
        where={
            "actionType": "connection_request",
            "date": today_datetime
        }
    )
    connections_today = sum(r.count for r in connection_records)

    # DMs today
    dm_records = await prisma.ratelimit.find_many(
        where={
            "actionType": "message",
            "date": today_datetime
        }
    )
    dms_today = sum(r.count for r in dm_records)

    # Active monitored posts
    active_monitored_posts = await prisma.monitoredpost.count(
        where={"isActive": True}
    )

    # Active watched accounts
    active_watched_accounts = await prisma.watchedaccount.count(
        where={"isActive": True}
    )

    return {
        "totalLeads": total_leads,
        "leadsToday": leads_today,
        "commentsToday": comments_today,
        "connectionsToday": connections_today,
        "dmsSentToday": dms_today,
        "activeMonitoredPosts": active_monitored_posts,
        "activeWatchedAccounts": active_watched_accounts
    }


@router.get("/settings")
async def get_settings(_=Depends(get_current_user)):
    settings = await prisma.settings.find_first(where={"id": "global"})
    if not settings:
        # Create default settings
        settings = await prisma.settings.create(
            data={"id": "global"}
        )
    return settings


@router.patch("/settings")
async def update_settings(data: dict, _=Depends(get_current_user)):
    settings = await prisma.settings.upsert(
        where={"id": "global"},
        create={"id": "global", **data},
        update=data
    )
    return settings
