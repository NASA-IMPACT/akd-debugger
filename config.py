from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = (
        "postgresql+asyncpg://postgres:postgres@localhost:5432/benchmark"
    )
    DATABASE_URL_SYNC: str = "postgresql://postgres:postgres@localhost:5432/benchmark"
    APP_TITLE: str = "Benchmark App"
    DEBUG: bool = False
    OPENAI_API_KEY: str = ""
    OUTPUT_BASE_DIR: str = "~/axiom_data"
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000,*"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
