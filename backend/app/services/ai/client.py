from anthropic import AsyncAnthropic
from app.config import settings

# Lazy initialization - only create client when needed
_client = None


def get_client() -> AsyncAnthropic:
    """Get the Anthropic client, creating it lazily"""
    global _client
    if _client is None:
        if not settings.ANTHROPIC_API_KEY:
            raise ValueError("ANTHROPIC_API_KEY environment variable is not set")
        _client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _client


async def generate_reply_comment(
    original_comment: str,
    commenter_name: str,
    post_topic: str,
    cta_hint: str,
    voice_tone: str = "professional",
    custom_instructions: str = None
) -> str:
    """Generate a reply to a comment that matched a keyword"""

    first_name = commenter_name.split()[0] if commenter_name else "there"

    # If custom instructions are provided, use them as the primary guide
    if custom_instructions:
        prompt = f"""{custom_instructions}

---
CURRENT CONTEXT:
- Commenter name: {commenter_name} (first name: {first_name})
- Their comment: "{original_comment}"
- Post topic: {post_topic}
- Your tone: {voice_tone}

Now generate the public comment reply (under 15 words) following the instructions above.
Write only the reply text, nothing else."""
    else:
        # Default behavior if no custom instructions
        prompt = f"""You are replying to a LinkedIn comment on your post about {post_topic}.

The commenter ({commenter_name}) wrote: "{original_comment}"

Write a friendly, engaging reply that:
1. Acknowledges their interest (they triggered a keyword)
2. Is warm and personal (use their first name: {first_name})
3. Hints at the value you'll provide: {cta_hint}
4. Is 1-2 sentences max (under 15 words ideal)
5. Tone: {voice_tone}

Do NOT be salesy or pushy. Be genuine and helpful.
Write only the reply text, nothing else."""

    response = await get_client().messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=200,
        messages=[{"role": "user", "content": prompt}]
    )

    return response.content[0].text.strip()


async def generate_sales_dm(
    lead_name: str,
    lead_headline: str,
    post_topic: str,
    cta_type: str,
    cta_value: str,
    cta_message: str = None,
    custom_instructions: str = None
) -> str:
    """Generate a personalized DM for a lead"""

    first_name = lead_name.split()[0] if lead_name else "there"

    # If custom instructions are provided, use them as the primary guide
    if custom_instructions:
        prompt = f"""{custom_instructions}

---
CURRENT CONTEXT:
- Lead name: {lead_name} (first name: {first_name})
- Lead headline: {lead_headline}
- Post topic they engaged with: {post_topic}
- CTA type: {cta_type}
- CTA value: {cta_value}
{f"- CTA message hint: {cta_message}" if cta_message else ""}

Now generate the DM following the instructions above.
Write only the message text, nothing else."""
    else:
        # Default behavior if no custom instructions
        cta_instruction = cta_message or f"Include this CTA naturally: {cta_value}"

        prompt = f"""Write a LinkedIn DM to {lead_name} ({lead_headline}).

Context: They commented on your post about {post_topic} and showed interest.

Your goal: Send a helpful, non-pushy message that:
1. Thanks them for engaging
2. Provides immediate value
3. {cta_instruction}
4. Is conversational, not salesy
5. 3-5 sentences max

CTA type: {cta_type}
CTA: {cta_value}

Write only the message text, nothing else."""

    response = await get_client().messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}]
    )

    return response.content[0].text.strip()


async def analyze_comments_for_matches(
    comments: list[dict],
    keywords: list[str],
    post_context: str = None
) -> list[dict]:
    """
    Use AI to analyze comments and determine which ones show genuine interest.
    Returns comments with match info - much better than exact keyword matching.

    Each comment dict should have: commenterUrl, commenterName, text
    Returns list of dicts with: commenterUrl, matchedKeyword, confidence
    """
    if not comments:
        return []

    # Format comments for analysis
    comments_text = "\n".join([
        f'{i+1}. "{c.get("text", "")}" - by {c.get("commenterName", "Unknown")}'
        for i, c in enumerate(comments)
    ])

    prompt = f"""Analyze these LinkedIn comments to identify people showing genuine interest in participating or engaging.

KEYWORDS TO LOOK FOR (case-insensitive, intent-based matching):
{', '.join(keywords)}

IMPORTANT: Match based on INTENT, not just exact words. For example:
- "build" keyword should match: "BUILD", "Let's build!", "I want to build this", "Count me in!", "I'm interested", "Sign me up", "Yes please", etc.
- Any expression of interest, enthusiasm, or desire to participate should be considered a match

COMMENTS TO ANALYZE:
{comments_text}

{f"POST CONTEXT: {post_context}" if post_context else ""}

For each comment that shows genuine interest (matches the intent of any keyword), respond with this format:
MATCH: [comment_number] | KEYWORD: [matched_keyword] | CONFIDENCE: [high/medium]

Only include matches - skip comments that don't show interest.
If no comments match, respond with: NO_MATCHES"""

    try:
        response = await get_client().messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}]
        )

        result_text = response.content[0].text.strip()

        if "NO_MATCHES" in result_text:
            return []

        matches = []
        for line in result_text.split("\n"):
            if line.startswith("MATCH:"):
                try:
                    parts = line.split("|")
                    comment_num = int(parts[0].replace("MATCH:", "").strip()) - 1
                    keyword = parts[1].replace("KEYWORD:", "").strip()
                    confidence = parts[2].replace("CONFIDENCE:", "").strip().lower()

                    if 0 <= comment_num < len(comments):
                        matches.append({
                            "comment": comments[comment_num],
                            "matchedKeyword": keyword,
                            "confidence": confidence
                        })
                except (ValueError, IndexError):
                    continue

        return matches
    except Exception as e:
        # Fall back to exact matching if AI fails
        import logging
        logging.getLogger(__name__).warning(f"AI matching failed, using exact match: {e}")
        return []


async def generate_insightful_comment(
    post_content: str,
    author_name: str,
    author_headline: str,
    your_expertise: list[str],
    your_tone: str,
    comment_style: str = None,
    sample_comments: list[str] = None
) -> str:
    """Generate an insightful comment for the comment bot"""

    samples = ""
    if sample_comments:
        samples = f"\n\nExamples of your commenting style:\n" + "\n".join(f"- {c}" for c in sample_comments[-3:])

    prompt = f"""You're commenting on a LinkedIn post as an expert in: {', '.join(your_expertise)}.

Post by {author_name} ({author_headline}):
"{post_content}"

Write a thoughtful comment that:
1. Adds genuine value or insight
2. Shows expertise without being preachy
3. Is 2-4 sentences max
4. Sounds human, not AI-generated
5. Tone: {your_tone}
{f"6. Style notes: {comment_style}" if comment_style else ""}

NEVER use generic phrases like "Great post!" or "Thanks for sharing!"
{samples}

Write only the comment text, nothing else."""

    response = await get_client().messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=250,
        messages=[{"role": "user", "content": prompt}]
    )

    return response.content[0].text.strip()
