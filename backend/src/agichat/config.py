from typing import Annotated

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    groq_api_key: SecretStr = SecretStr("")
    llm_base_url: str = "https://api.groq.com/openai/v1"
    agent_model: str = "openai/gpt-oss-120b"
    guard_model: str = "openai/gpt-oss-safeguard-20b"

    tmdb_read_access_token: SecretStr = SecretStr("")
    tmdb_language: str = "es-MX"
    tmdb_daily_limit: int = 1000

    google_books_api_key: SecretStr = SecretStr("")
    books_daily_limit: int = 1000

    redis_url: str | None = None

    mcp_host: str = "127.0.0.1"
    tmdb_mcp_port: int = 8101
    books_mcp_port: int = 8102
    references_mcp_port: int = 8103
    tmdb_mcp_url: str = "http://127.0.0.1:8101/mcp"
    books_mcp_url: str = "http://127.0.0.1:8102/mcp"
    references_mcp_url: str = "http://127.0.0.1:8103/mcp"

    gateway_port: int = 8000
    allowed_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:8080",
        "http://localhost:5173",
        "http://localhost:4173",
    ]

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value
