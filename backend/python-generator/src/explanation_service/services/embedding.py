"""Sentence embedding utilities."""

from __future__ import annotations

import asyncio
import hashlib
import importlib
import logging

LOGGER = logging.getLogger(__name__)


class EmbeddingGenerator:
    """Wraps sentence-transformers with fastText fallback."""

    def __init__(self, model_name: str, fasttext_path: str | None = None) -> None:
        self._model_name = model_name
        self._fasttext_path = fasttext_path
        self._transformer = None
        self._fasttext_model = None

    async def embed(self, text: str) -> list[float]:
        try:
            transformer = self._ensure_transformer()
            vector = await asyncio.to_thread(transformer.encode, text)
            return self._resize(vector.tolist())
        except Exception as exc:  # pragma: no cover - depends on external model
            LOGGER.warning("Transformer embedding failed, falling back to fastText: %s", exc)
            return await asyncio.to_thread(self._fasttext_embed, text)

    def _ensure_transformer(self):
        if self._transformer is None:
            from sentence_transformers import SentenceTransformer

            LOGGER.info("Loading SentenceTransformer model %s", self._model_name)
            self._transformer = SentenceTransformer(self._model_name)
        return self._transformer

    def _fasttext_embed(self, text: str) -> list[float]:
        if self._fasttext_model is None:
            try:
                fasttext_module_local = importlib.import_module("fasttext")
            except ModuleNotFoundError as exc:
                LOGGER.error("fasttext package missing: %s", exc)
                return self._hash_vector(text)

            if not self._fasttext_path:
                LOGGER.warning("FASTTEXT model path not provided, using hash fallback")
                return self._hash_vector(text)

            LOGGER.info("Loading fastText model from %s", self._fasttext_path)
            self._fasttext_model = fasttext_module_local.load_model(self._fasttext_path)

        if self._fasttext_model:
            vector = self._fasttext_model.get_sentence_vector(text).tolist()
            return self._resize(vector)

        return self._hash_vector(text)

    @staticmethod
    def _hash_vector(text: str, dim: int = 768) -> list[float]:
        digest = hashlib.sha256(text.encode("utf-8")).digest()
        chunk = [int.from_bytes(digest[i : i + 4], "little") / 1e9 for i in range(0, 32, 4)]
        return EmbeddingGenerator._resize(chunk, dim)

    @staticmethod
    def _resize(vector: list[float], dim: int = 768) -> list[float]:
        if len(vector) == dim:
            return vector
        if len(vector) > dim:
            return vector[:dim]
        return (vector * (dim // len(vector) + 1))[:dim]
