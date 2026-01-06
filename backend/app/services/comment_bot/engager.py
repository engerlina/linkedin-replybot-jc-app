from app.db.client import prisma
from app.services.linkedin.client import LinkedInDirectClient
from app.services.ai.client import generate_insightful_comment
from app.utils.rate_limiter import record_action


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


async def engage_with_post(target, post: dict, client: LinkedInDirectClient):
    """Generate and post an insightful comment on a post"""
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
