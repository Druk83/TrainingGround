"""Async client for YandexGPT completion endpoint."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from ..config import Settings

LOGGER = logging.getLogger(__name__)


class YandexGPTClient:
    """Thin wrapper around httpx to keep retries/timeouts consistent."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        headers = {"Content-Type": "application/json"}
        if settings.yandexgpt_api_key:
            headers["Authorization"] = f"Api-Key {settings.yandexgpt_api_key}"
        self._client = httpx.AsyncClient(
            timeout=settings.yandexgpt_timeout_seconds,
            headers=headers,
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def generate(
        self,
        prompt: str,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> str:
        """
        Call YandexGPT completion endpoint with configurable options.

        Args:
            prompt: User prompt text
            temperature: Override default temperature from config
            max_tokens: Override default max_tokens from config

        Raises:
            httpx.HTTPStatusError for non-2xx responses.
        """

        if (
            not self._settings.yandexgpt_api_key
            or not self._settings.yandexgpt_folder_id
        ):
            raise RuntimeError("YandexGPT credentials are not configured")

        body = {
            "modelUri": f"gpt://{self._settings.yandexgpt_folder_id}/{self._settings.yandexgpt_model}",
            "completionOptions": {
                "stream": False,
                "temperature": temperature or self._settings.yandexgpt_temperature,
                "maxTokens": max_tokens or self._settings.yandexgpt_max_tokens,
            },
            "messages": [
                {
                    "role": "system",
                    "text": self._settings.yandexgpt_system_prompt,
                },
                {"role": "user", "text": prompt},
            ],
        }

        LOGGER.debug("Sending prompt to YandexGPT (len=%s)", len(prompt))
        response = await self._client.post(self._settings.yandexgpt_api_url, json=body)
        response.raise_for_status()

        payload: dict[str, Any] = response.json()
        alternatives = payload.get("result", {}).get("alternatives", [])
        if not alternatives:
            raise RuntimeError("YandexGPT response has no alternatives")

        message = alternatives[0].get("message") or {}
        text = message.get("text")
        if not text:
            raise RuntimeError("YandexGPT response missing text field")

        return text.strip()
