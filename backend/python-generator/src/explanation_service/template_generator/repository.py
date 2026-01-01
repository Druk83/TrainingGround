"""Repositories storing templates, word banks and helper data."""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from motor.motor_asyncio import AsyncIOMotorCollection

DEFAULT_WORDS: dict[str, list[str]] = {
    "noun": ["teacher", "student", "book", "word", "example", "lesson", "room"],
    "verb": ["write", "read", "speak", "think", "solve"],
    "adjective": ["warm", "fast", "important", "interesting", "new"],
}

DEFAULT_EXAMPLES = [
    "Petya read a new book and noticed an error.",
    "The teacher explained the rule and asked to repeat.",
    "In the lesson we analyze complex examples.",
    "Reviewers marked the right answers.",
]


@dataclass(frozen=True)
class TemplateDescriptor:
    template_id: str
    level_id: str
    content: str
    params: dict[str, Any]
    metadata: dict[str, Any]
    difficulty: str | None = None

    @classmethod
    def from_mongo(cls, doc: dict[str, Any]) -> TemplateDescriptor:
        template_id = str(doc.get("_id") or doc.get("id"))
        level_info = doc.get("level_id")
        if isinstance(level_info, ObjectId):
            level_id = str(level_info)
        else:
            level_id = str(level_info or "")

        return cls(
            template_id=template_id,
            level_id=level_id,
            content=str(doc.get("content", "")),
            params={**(doc.get("params") or {})},
            metadata={**(doc.get("metadata") or {})},
            difficulty=doc.get("difficulty"),
        )


class TemplateRepository:
    READY_STATUSES = {"ready", "published"}

    def __init__(self, collection: AsyncIOMotorCollection) -> None:
        self._collection = collection

    async def list_ready_templates(self, level_id: str) -> list[TemplateDescriptor]:
        object_id = self._parse_object_id(level_id)
        query: dict[str, Any] = {"level_id": object_id}
        if self.READY_STATUSES:
            query["status"] = {"$in": list(self.READY_STATUSES)}

        documents = await self._collection.find(query).to_list(length=None)
        return [TemplateDescriptor.from_mongo(doc) for doc in documents]

    def _parse_object_id(self, value: str) -> ObjectId | str:
        if not value:
            raise ValueError("Empty level_id")
        try:
            return ObjectId(value)
        except (InvalidId, TypeError):
            return value


class WordBank:
    def __init__(self, words: dict[str, list[str]] | None = None) -> None:
        self._words = words or DEFAULT_WORDS
        self._random = random.Random()

    def sample(self, pos: str) -> str:
        bucket = self._words.get(pos.lower()) or self._words.get("noun")
        if not bucket:
            return "word"
        return self._random.choice(bucket)


class ExampleSentenceBank:
    def __init__(self, sentences: list[str] | None = None) -> None:
        self._sentences = sentences or DEFAULT_EXAMPLES
        self._random = random.Random()

    def sentence(self) -> str:
        if not self._sentences:
            return "No example available."
        return self._random.choice(self._sentences)


class MongoWordBank(WordBank):
    """WordBank that loads words from MongoDB."""

    def __init__(self, collection: AsyncIOMotorCollection) -> None:
        super().__init__()
        self._collection = collection

    async def load_words(self) -> None:
        """Load words from MongoDB collection."""
        documents = await self._collection.find({}).to_list(length=None)
        words_by_pos: dict[str, list[str]] = {}
        for doc in documents:
            pos = doc.get("pos", "noun").lower()
            word = doc.get("word", "")
            if word:
                if pos not in words_by_pos:
                    words_by_pos[pos] = []
                words_by_pos[pos].append(word)
        if words_by_pos:
            self._words = words_by_pos

    async def sample_async(self, pos: str) -> str:
        """Async version of sample method."""
        return self.sample(pos)


class MongoExampleSentenceBank(ExampleSentenceBank):
    """ExampleSentenceBank that loads examples from MongoDB."""

    def __init__(self, collection: AsyncIOMotorCollection) -> None:
        super().__init__()
        self._collection = collection

    async def load_sentences(self) -> None:
        """Load example sentences from MongoDB collection."""
        documents = await self._collection.find({}).to_list(length=None)
        sentences = [doc.get("text", "") for doc in documents if doc.get("text")]
        if sentences:
            self._sentences = sentences

    async def sentence_async(self) -> str:
        """Async version of sentence method."""
        return self.sentence()
