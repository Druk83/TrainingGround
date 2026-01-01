"""
Application-wide configuration utilities.

The service relies heavily on environment variables because it is deployed via docker-compose
alongside the Rust API.  We use Pydantic BaseSettings to parse values once and cache them so the
same object can be reused across the ASGI lifespan.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal, cast

from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration parsed from environment variables."""

    model_config = SettingsConfigDict(
        env_prefix="",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="allow",
    )

    app_env: Literal["dev", "test", "stage", "prod"] = "dev"
    log_level: str = "INFO"

    mongodb_uri: str = Field(default="mongodb://localhost:27017")
    mongodb_db: str = Field(default="trainingground")

    redis_host: str = Field(default="localhost")
    redis_port: int = Field(default=6379)
    redis_password: str | None = Field(default=None)
    redis_db: int = Field(default=0)

    @property
    def redis_url(self) -> str:
        """Construct Redis URL from components."""
        if self.redis_password:
            return f"redis://:{self.redis_password}@{self.redis_host}:{self.redis_port}/{self.redis_db}"
        return f"redis://{self.redis_host}:{self.redis_port}/{self.redis_db}"

    qdrant_url: AnyHttpUrl = Field(
        default_factory=lambda: cast(AnyHttpUrl, "http://localhost:6333")
    )
    qdrant_api_key: str | None = None
    qdrant_rules_collection: str = Field(default="rules_embeddings")

    redis_stream_name: str = Field(default="content:changes")
    redis_stream_group: str = Field(default="explanation-workers")
    redis_stream_consumer: str = Field(default="generator-1")

    explanation_cache_ttl_seconds: int = Field(default=300)
    feature_flag_cache_ttl_seconds: int = Field(default=300)

    yandexgpt_api_key: str | None = None
    yandexgpt_folder_id: str | None = None
    yandexgpt_model: str = Field(default="yandexgpt-lite")
    yandexgpt_timeout_seconds: float = Field(default=2.0)
    yandexgpt_api_url: str = Field(
        default="https://llm.api.cloud.yandex.net/foundationModels/v1/completion"
    )
    yandexgpt_temperature: float = Field(default=0.2)
    yandexgpt_max_tokens: int = Field(default=700)
    yandexgpt_system_prompt: str = Field(
        default=(
            "Ты — преподаватель русского языка. "
            "Объясняй ошибки кратко, с примерами и отсылками к правилам."
        )
    )
    explanation_yandexgpt_enabled: bool = Field(default=True)

    embedding_model_name: str = Field(
        default="sentence-transformers/paraphrase-multilingual-mpnet-base-v2"
    )
    fasttext_model_path: str | None = None
    qdrant_batch_size: int = Field(default=32)

    metrics_namespace: str = Field(default="explanation_service")
    cache_enabled: bool = Field(default=True)
    template_instance_cache_ttl_seconds: int = Field(
        default=600,
        description="TTL (seconds) for cached rendered task instance per template.",
    )
    template_seen_tasks_ttl_seconds: int = Field(
        default=86_400,
        description="TTL (seconds) to keep track of templates already shown to a user.",
    )
    template_generation_limit: int = Field(
        default=20,
        description="Maximum number of instances that can be requested in one call.",
    )

    snapshot_cron: str = Field(default="0 * * * *")  # hourly by default
    snapshot_retention: int = Field(default=24)

    language_default: str = Field(default="ru")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached settings instance."""

    return Settings()
