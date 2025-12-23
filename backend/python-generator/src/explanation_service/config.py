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
    redis_url: str = Field(default="redis://localhost:6379/0")

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
    explanation_yandexgpt_enabled: bool = Field(default=True)

    embedding_model_name: str = Field(
        default="sentence-transformers/paraphrase-multilingual-mpnet-base-v2"
    )
    fasttext_model_path: str | None = None
    qdrant_batch_size: int = Field(default=32)

    metrics_namespace: str = Field(default="explanation_service")
    cache_enabled: bool = Field(default=True)

    snapshot_cron: str = Field(default="0 * * * *")  # hourly by default
    snapshot_retention: int = Field(default=24)

    language_default: str = Field(default="ru")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached settings instance."""

    return Settings()
