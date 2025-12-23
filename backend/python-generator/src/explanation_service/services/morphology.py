"""Morphology helper built on pymorphy2 and Natasha."""

from __future__ import annotations

import asyncio
from collections.abc import Iterable
from typing import cast

from natasha import Doc, MorphVocab, NewsEmbedding, NewsMorphTagger, Segmenter
from pymorphy2 import MorphAnalyzer
from pymorphy2.analyzer import Parse


class MorphologyAnalyzer:
    """Preprocesses user errors to normalize cases and extract lemmas."""

    def __init__(self) -> None:
        self._morph = MorphAnalyzer()
        self._segmenter = Segmenter()
        self._emb = NewsEmbedding()
        self._morph_tagger = NewsMorphTagger(self._emb)
        self._vocab = MorphVocab()

    async def normalize_errors(self, errors: Iterable[str]) -> list[str]:
        normalized: list[str] = []

        for error in errors:
            if not error:
                continue
            lemma = await asyncio.to_thread(self._lemmatize, error)
            normalized.append(lemma)

        return normalized

    def _lemmatize(self, text: str) -> str:
        doc = Doc(text)
        doc.segment(self._segmenter)
        doc.tag_morph(self._morph_tagger)
        if not doc.tokens:
            return text.lower()
        for token in doc.tokens:
            token.lemmatize(self._vocab)
        lemmas = [token.lemma for token in doc.tokens if token.lemma]
        if lemmas:
            return " ".join(lemmas)

        parsed_candidates = cast(list[Parse], list(self._morph.parse(text) or []))
        if not parsed_candidates:
            return text.lower()
        parsed = parsed_candidates[0]
        if hasattr(parsed, "normal_form") and parsed.normal_form:
            return parsed.normal_form
        return text.lower()
