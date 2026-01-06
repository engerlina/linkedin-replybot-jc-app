from datetime import datetime, date
from app.db.client import prisma
from app.services.linkedapi.client import LinkedAPIClient
from app.services.reply_bot.processor import process_keyword_match
from app.utils.humanizer import random_delay


def safe_str(value) -> str:
    """Convert any value to string, handling dates/datetimes"""
    if value is None:
        return ""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value)


async def poll_single_post(post) -> dict:
    """Poll a single post for matching comments"""
    client = await LinkedAPIClient.create(post.account.identificationToken)

    # Get recent comments
    comments = await client.get_post_comments(post.postUrl, limit=50)

    matches = []
    for comment in comments:
        # Skip if already processed
        existing = await prisma.processedcomment.find_first(
            where={
                "postId": post.id,
                "commenterUrl": safe_str(comment.get("commenterUrl", "")),
                "commentText": safe_str(comment.get("text")) or ""
            }
        )
        if existing:
            continue

        # Check for keyword match
        comment_text = (comment.get("text") or "").lower()
        matched_keyword = None
        for keyword in post.keywords:
            if keyword.lower() in comment_text:
                matched_keyword = keyword
                break

        # Record the comment
        processed = await prisma.processedcomment.create(
            data={
                "postId": post.id,
                "commenterUrl": safe_str(comment.get("commenterUrl", "")),
                "commenterName": safe_str(comment.get("commenterName", "")),
                "commenterHeadline": safe_str(comment.get("commenterHeadline")) or None,
                "commentText": safe_str(comment.get("text")) or "",
                "commentTime": safe_str(comment.get("time")) or "",
                "matchedKeyword": matched_keyword,
                "wasMatch": matched_keyword is not None
            }
        )

        if matched_keyword:
            matches.append(processed)

    # Process matches
    for match in matches:
        await process_keyword_match(post, match, client)

    # Update last polled
    await prisma.monitoredpost.update(
        where={"id": post.id},
        data={
            "lastPolledAt": datetime.utcnow(),
            "totalComments": {"increment": len(comments)},
            "totalMatches": {"increment": len(matches)}
        }
    )

    return {"commentsFound": len(comments), "matchesFound": len(matches)}
