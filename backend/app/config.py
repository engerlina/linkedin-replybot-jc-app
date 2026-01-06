import os
import sys
from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Required - app won't function without these, but we use defaults so it can start
    DATABASE_URL: str = ""
    ANTHROPIC_API_KEY: str = ""
    ADMIN_PASSWORD: str = ""
    JWT_SECRET: str = "dev-secret-change-me"
    FRONTEND_URL: str = "http://localhost:3000"

    # Legacy - no longer used, each account has its own API key
    LINKEDAPI_API_KEY: Optional[str] = None

    class Config:
        env_file = ".env"

    def validate_required(self) -> list[str]:
        """Check which required settings are missing"""
        missing = []
        if not self.DATABASE_URL:
            missing.append("DATABASE_URL")
        if not self.ANTHROPIC_API_KEY:
            missing.append("ANTHROPIC_API_KEY")
        if not self.ADMIN_PASSWORD:
            missing.append("ADMIN_PASSWORD")
        return missing


# Initialize settings - this will always succeed now
settings = Settings()

# Log missing settings but don't crash - let the app start for health checks
missing = settings.validate_required()
if missing:
    print(f"WARNING: Missing required environment variables: {', '.join(missing)}", file=sys.stderr)
    print("The application will start but some features will not work.", file=sys.stderr)
