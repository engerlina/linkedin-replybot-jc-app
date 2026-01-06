from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    ANTHROPIC_API_KEY: str
    ADMIN_PASSWORD: str  # Simple password auth
    JWT_SECRET: str
    FRONTEND_URL: str = "http://localhost:3000"

    # Legacy - no longer used, each account has its own API key
    LINKEDAPI_API_KEY: Optional[str] = None

    class Config:
        env_file = ".env"


settings = Settings()
