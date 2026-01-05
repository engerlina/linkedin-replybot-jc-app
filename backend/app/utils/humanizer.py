import asyncio
import random


async def random_delay(min_seconds: int = 30, max_seconds: int = 180):
    """Add a random delay to appear more human-like"""
    delay = random.randint(min_seconds, max_seconds)
    await asyncio.sleep(delay)
