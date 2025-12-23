#!/usr/bin/env python3
"""CLI utility to rebuild Qdrant embeddings from scratch."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import List

import typer
from motor.motor_asyncio import AsyncIOMotorClient
from qdrant_client import QdrantClient
from qdrant_client.http import models as rest

ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT / "src"))

from explanation_service.config import get_settings  # noqa: E402
from explanation_service.services.embedding import EmbeddingGenerator  # noqa: E402

cli = typer.Typer(add_completion=False)


@cli.command()
def rebuild() -> None:
    """Recreate the rules_embeddings collection contents."""

    asyncio.run(_rebuild_impl())


async def _rebuild_impl() -> None:
    settings = get_settings()
    client = AsyncIOMotorClient(settings.mongodb_uri)
    db = client[settings.mongodb_db]
    qdrant = QdrantClient(url=str(settings.qdrant_url), api_key=settings.qdrant_api_key)
    embedder = EmbeddingGenerator(settings.embedding_model_name, settings.fasttext_model_path)

    cursor = db["rules"].find({})
    batch: List[rest.PointStruct] = []
    async for rule in cursor:
        text = f"{rule.get('name', '')}\n{rule.get('description', '')}"
        vector = await embedder.embed(text)
        batch.append(
            rest.PointStruct(
                id=rule["_id"],
                vector=vector,
                payload={
                    "rule_id": rule["_id"],
                    "name": rule.get("name"),
                    "description": rule.get("description"),
                    "slug": rule.get("slug"),
                    "difficulty": rule.get("metadata", {}).get("difficulty"),
                },
            )
        )
        if len(batch) >= settings.qdrant_batch_size:
            await _flush(qdrant, settings.qdrant_rules_collection, batch)
            batch = []

    if batch:
        await _flush(qdrant, settings.qdrant_rules_collection, batch)

    typer.echo("Embeddings rebuild finished.")
    client.close()


async def _flush(client: QdrantClient, collection: str, points: List[rest.PointStruct]) -> None:
    await asyncio.to_thread(client.upsert, collection_name=collection, points=points)


if __name__ == "__main__":
    cli()
