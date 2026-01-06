from datetime import datetime
from app.db.client import prisma
from app.services.linkedapi.client import LinkedAPIClient
from app.services.reply_bot.poller import poll_single_post
from app.services.reply_bot.messenger import send_dm_to_lead
from app.services.comment_bot.watcher import check_and_engage
from app.utils.rate_limiter import can_perform
from app.utils.humanizer import random_delay


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
            client = LinkedAPIClient(lead.account.identificationToken)
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
                client = LinkedAPIClient(lead.account.identificationToken)
                await send_dm_to_lead(lead, lead.post, client)
                await random_delay(120, 300)
            except Exception as e:
                await log_activity(lead.accountId, "dm_error", "failed", {"error": str(e)})
