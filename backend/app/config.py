from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    LINKEDAPI_API_KEY: str
    ANTHROPIC_API_KEY: str
    ADMIN_PASSWORD: str  # Simple password auth
    JWT_SECRET: str
    FRONTEND_URL: str = "http://localhost:3000"

    class Config:
        env_file = ".env"


settings = Settings()
