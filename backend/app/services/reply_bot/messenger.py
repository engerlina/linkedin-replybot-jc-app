from datetime import datetime
from app.db.client import prisma
from app.services.linkedin.client import LinkedInDirectClient
from app.services.ai.client import generate_sales_dm
from app.utils.rate_limiter import record_action
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


async def send_dm_to_lead(lead, post, client: LinkedInDirectClient):
    """Send a sales DM to a connected lead using custom instructions if available"""
    dm_text = await generate_sales_dm(
        lead_name=lead.name,
        lead_headline=lead.headline or "",
        post_topic=post.postTitle or "my recent post",
        cta_type=post.ctaType,
        cta_value=post.ctaValue,
        cta_message=post.ctaMessage,
        custom_instructions=post.replyStyle
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


async def send_connection_to_lead(lead, post, client: LinkedInDirectClient):
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
