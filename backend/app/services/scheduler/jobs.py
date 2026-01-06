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
    from prisma import Json

    data = {
        "action": action,
        "status": status,
        "details": Json(details) if details else None
    }

    if account_id:
        data["account"] = {"connect": {"id": account_id}}

    await prisma.activitylog.create(data=data)


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
    """
    Check leads and handle connection flow:
    1. Unknown leads -> check status -> send connection request or DM
    2. Pending leads -> check if now connected -> send DM
    3. NotConnected leads -> send connection request
    """
    import logging
    logger = logging.getLogger(__name__)

    # First: Process leads with "unknown" status (new leads from extension)
    unknown_leads = await prisma.lead.find_many(
        where={"connectionStatus": "unknown"},
        include={"account": True, "post": True},
        take=10
    )

    for lead in unknown_leads:
        try:
            if not lead.account.identificationToken:
                logger.warning(f"Lead {lead.id} has no identification token, skipping")
                continue

            client = await LinkedAPIClient.create(lead.account.identificationToken)
            status = await client.check_connection(lead.linkedInUrl)
            logger.info(f"Lead {lead.name}: connection status = {status}")

            if status == "connected":
                # Already connected - update and queue DM
                await prisma.lead.update(
                    where={"id": lead.id},
                    data={
                        "connectionStatus": "connected",
                        "connectedAt": datetime.utcnow()
                    }
                )
                logger.info(f"Lead {lead.name} is already connected, will queue DM")

            elif status == "pending":
                # Connection request already sent
                await prisma.lead.update(
                    where={"id": lead.id},
                    data={"connectionStatus": "pending"}
                )
                logger.info(f"Lead {lead.name} has pending connection request")

            else:
                # Not connected - send connection request
                await prisma.lead.update(
                    where={"id": lead.id},
                    data={"connectionStatus": "notConnected"}
                )

                if await can_perform(lead.accountId, "connection_request"):
                    # Get connection note from post or default
                    note = None
                    if lead.post and lead.post.ctaMessage:
                        note = f"Hi {lead.name.split()[0]}! Saw your comment and would love to connect."

                    success = await client.send_connection_request(lead.linkedInUrl, note)
                    if success:
                        await prisma.lead.update(
                            where={"id": lead.id},
                            data={
                                "connectionStatus": "pending",
                                "connectionSentAt": datetime.utcnow()
                            }
                        )
                        await log_activity(lead.accountId, "connection_sent", "success", {
                            "leadId": lead.id,
                            "name": lead.name
                        })
                        logger.info(f"Sent connection request to {lead.name}")

            await random_delay(30, 60)
        except Exception as e:
            logger.error(f"Error processing unknown lead {lead.id}: {e}")
            await log_activity(lead.accountId if lead.account else None, "connection_check_error", "failed", {
                "error": str(e),
                "leadId": lead.id
            })

    # Second: Check pending connections
    pending_leads = await prisma.lead.find_many(
        where={
            "connectionStatus": "pending",
            "dmStatus": "not_sent"
        },
        include={"account": True, "post": True},
        take=10
    )

    for lead in pending_leads:
        try:
            if not lead.account.identificationToken:
                continue

            client = await LinkedAPIClient.create(lead.account.identificationToken)
            status = await client.check_connection(lead.linkedInUrl)

            if status == "connected":
                await prisma.lead.update(
                    where={"id": lead.id},
                    data={
                        "connectionStatus": "connected",
                        "connectedAt": datetime.utcnow()
                    }
                )
                logger.info(f"Lead {lead.name} is now connected!")

            await random_delay(30, 60)
        except Exception as e:
            logger.error(f"Error checking pending lead {lead.id}: {e}")
            await log_activity(lead.accountId, "connection_check_error", "failed", {"error": str(e)})


async def run_pending_dm_sender():
    """Send DMs to connected leads from the PendingDm queue"""
    import logging
    logger = logging.getLogger(__name__)

    # Process pending DMs
    pending_dms = await prisma.pendingdm.find_many(
        where={"status": "pending"},
        include={
            "lead": {
                "include": {"account": True, "post": True}
            }
        },
        take=10
    )

    for dm in pending_dms:
        lead = dm.lead
        if not lead or not lead.account:
            continue

        # Only send DMs to connected leads
        if lead.connectionStatus != "connected":
            logger.info(f"Skipping DM for {lead.name} - not connected yet ({lead.connectionStatus})")
            continue

        if not await can_perform(lead.accountId, "message"):
            logger.info(f"Rate limit reached for messages on account {lead.accountId}")
            continue

        try:
            if not lead.account.identificationToken:
                logger.warning(f"Lead {lead.id} account has no identification token")
                continue

            client = await LinkedAPIClient.create(lead.account.identificationToken)

            # Use edited text if available, otherwise original message
            message = dm.editedText or dm.message

            success = await client.send_message(lead.linkedInUrl, message)

            if success:
                await prisma.pendingdm.update(
                    where={"id": dm.id},
                    data={
                        "status": "sent",
                        "sentAt": datetime.utcnow()
                    }
                )
                await prisma.lead.update(
                    where={"id": lead.id},
                    data={
                        "dmStatus": "sent",
                        "dmSentAt": datetime.utcnow(),
                        "dmText": message
                    }
                )
                await log_activity(lead.accountId, "dm_sent", "success", {
                    "leadId": lead.id,
                    "name": lead.name
                })
                logger.info(f"Sent DM to {lead.name}")
            else:
                await prisma.pendingdm.update(
                    where={"id": dm.id},
                    data={"status": "failed"}
                )
                logger.error(f"Failed to send DM to {lead.name}")

            await random_delay(120, 300)
        except Exception as e:
            logger.error(f"Error sending DM to {lead.name}: {e}")
            await log_activity(lead.accountId, "dm_error", "failed", {
                "error": str(e),
                "leadId": lead.id
            })

    # Also process leads without PendingDm but with connected status and a post CTA
    leads = await prisma.lead.find_many(
        where={
            "connectionStatus": "connected",
            "dmStatus": "not_sent"
        },
        include={"account": True, "post": True},
        take=10
    )

    for lead in leads:
        # Check if there's already a pending DM for this lead
        existing_dm = await prisma.pendingdm.find_first(
            where={"leadId": lead.id}
        )
        if existing_dm:
            continue  # Already has a DM record

        if lead.post and lead.post.ctaMessage and await can_perform(lead.accountId, "message"):
            try:
                client = await LinkedAPIClient.create(lead.account.identificationToken)
                await send_dm_to_lead(lead, lead.post, client)
                await random_delay(120, 300)
            except Exception as e:
                await log_activity(lead.accountId, "dm_error", "failed", {"error": str(e)})
