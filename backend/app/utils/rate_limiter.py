from datetime import date
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
