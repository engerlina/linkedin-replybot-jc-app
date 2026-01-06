import logging
from datetime import datetime, date
from app.db.client import prisma
from app.services.linkedapi.client import LinkedAPIClient
from app.services.reply_bot.processor import process_keyword_match
from app.services.ai.client import analyze_comments_for_matches
from app.utils.humanizer import random_delay

logger = logging.getLogger(__name__)


def safe_str(value) -> str:
    """Convert any value to string, handling dates/datetimes"""
    if value is None:
        return ""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value)


def exact_keyword_match(comment_text: str, keywords: list[str]) -> str | None:
    """Fallback exact keyword matching"""
    text_lower = (comment_text or "").lower()
    for keyword in keywords:
        if keyword.lower() in text_lower:
            return keyword
    return None


async def poll_single_post(post) -> dict:
    """Poll a single post for matching comments using AI-powered intent matching"""
    client = await LinkedAPIClient.create(post.account.identificationToken)

    # Get recent comments
    comments = await client.get_post_comments(post.postUrl, limit=50)

    # Filter to only new comments
    new_comments = []
    for comment in comments:
        existing = await prisma.processedcomment.find_first(
            where={
                "postId": post.id,
                "commenterUrl": safe_str(comment.get("commenterUrl", "")),
                "commentText": safe_str(comment.get("text")) or ""
            }
        )
        if not existing:
            new_comments.append(comment)

    if not new_comments:
        # Update last polled even if no new comments
        await prisma.monitoredpost.update(
            where={"id": post.id},
            data={"lastPolledAt": datetime.utcnow()}
        )
        return {"commentsFound": len(comments), "matchesFound": 0}

    # Use AI to analyze comments for matches (much better than exact matching!)
    ai_matches = await analyze_comments_for_matches(
        comments=new_comments,
        keywords=post.keywords,
        post_context=post.postTitle
    )

    # Build a lookup for AI matches
    ai_match_lookup = {}
    for match in ai_matches:
        comment_url = match["comment"].get("commenterUrl", "")
        ai_match_lookup[comment_url] = match["matchedKeyword"]

    matches = []
    for comment in new_comments:
        comment_url = safe_str(comment.get("commenterUrl", ""))

        # Check AI match first, then fallback to exact match
        matched_keyword = ai_match_lookup.get(comment_url)
        if not matched_keyword:
            # Fallback to exact matching
            matched_keyword = exact_keyword_match(comment.get("text", ""), post.keywords)

        # Record the comment
        processed = await prisma.processedcomment.create(
            data={
                "postId": post.id,
                "commenterUrl": comment_url,
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
            logger.info(f"Match found: '{comment.get('text')[:50]}...' matched '{matched_keyword}'")

    # Process matches
    for match in matches:
        await process_keyword_match(post, match, client)

    # Update last polled
    await prisma.monitoredpost.update(
        where={"id": post.id},
        data={
            "lastPolledAt": datetime.utcnow(),
            "totalComments": {"increment": len(new_comments)},
            "totalMatches": {"increment": len(matches)}
        }
    )

    return {"commentsFound": len(comments), "matchesFound": len(matches)}
