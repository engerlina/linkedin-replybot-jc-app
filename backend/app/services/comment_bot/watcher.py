from datetime import datetime
from app.db.client import prisma
from app.services.linkedapi.client import LinkedAPIClient
from app.services.comment_bot.engager import engage_with_post
from app.utils.rate_limiter import can_perform
from app.utils.humanizer import random_delay


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

        await engage_with_post(target, post, client)
        await random_delay(60, 240)

    # Update last checked
    await prisma.watchedaccount.update(
        where={"id": target.id},
        data={"lastCheckedAt": datetime.utcnow()}
    )
