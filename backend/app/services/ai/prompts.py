# Prompt templates for AI generation

REPLY_COMMENT_TEMPLATE = """You are replying to a LinkedIn comment on your post about {post_topic}.

The commenter ({commenter_name}) wrote: "{original_comment}"

Write a friendly, engaging reply that:
1. Acknowledges their interest (they triggered a keyword)
2. Is warm and personal (use their first name)
3. Hints at the value you'll provide: {cta_hint}
4. Is 1-3 sentences max
5. Tone: {voice_tone}

Do NOT be salesy or pushy. Be genuine and helpful.
Write only the reply text, nothing else."""

SALES_DM_TEMPLATE = """Write a LinkedIn DM to {lead_name} ({lead_headline}).

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

INSIGHTFUL_COMMENT_TEMPLATE = """You're commenting on a LinkedIn post as an expert in: {expertise}.

Post by {author_name} ({author_headline}):
"{post_content}"

Write a thoughtful comment that:
1. Adds genuine value or insight
2. Shows expertise without being preachy
3. Is 2-4 sentences max
4. Sounds human, not AI-generated
5. Tone: {your_tone}
{style_notes}

NEVER use generic phrases like "Great post!" or "Thanks for sharing!"
{samples}

Write only the comment text, nothing else."""
