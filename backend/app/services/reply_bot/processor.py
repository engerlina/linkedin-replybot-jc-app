from datetime import datetime
from app.db.client import prisma
from app.services.linkedapi.client import LinkedAPIClient
from app.services.ai.client import generate_reply_comment
from app.services.reply_bot.messenger import send_dm_to_lead, send_connection_to_lead
from app.utils.rate_limiter import can_perform, record_action
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


async def process_keyword_match(post, comment, client: LinkedAPIClient):
    """Process a comment that matched a keyword"""
    account_id = post.accountId

    # Check rate limit for comments
    if not await can_perform(account_id, "comment"):
        return

    # 1. Generate and post reply using custom instructions if available
    reply_text = await generate_reply_comment(
        original_comment=comment.commentText,
        commenter_name=comment.commenterName,
        post_topic=post.postTitle or "this topic",
        cta_hint=post.ctaMessage or post.ctaValue,
        voice_tone=post.account.voiceTone,
        custom_instructions=post.replyStyle
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
