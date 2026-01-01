"""Template rendering engine that substitutes parameters with morphological data."""

from __future__ import annotations

import inspect
import random
import re
from dataclasses import dataclass
from types import ModuleType
from typing import Any, cast

from pymorphy2 import MorphAnalyzer
from pymorphy2.analyzer import Parse

from .repository import ExampleSentenceBank, WordBank


def _compat_getargspec(
    func: Any,
) -> tuple[list[str], str | None, str | None, tuple[Any, ...] | None]:
    spec = inspect.getfullargspec(func)
    return spec.args, spec.varargs, spec.varkw, spec.defaults


def _ensure_getargspec() -> None:
    inspect_module = cast(ModuleType, inspect)
    if not hasattr(inspect_module, "getargspec"):  # type: ignore[attr-defined]
        inspect_module.getargspec = _compat_getargspec  # type: ignore[attr-defined]


_ensure_getargspec()


CASE_ALIASES: dict[str, str] = {
    "nominative": "nomn",
    "nom": "nomn",
    "nomn": "nomn",
    "genitive": "gent",
    "gen": "gent",
    "gent": "gent",
    "dative": "datv",
    "dat": "datv",
    "datv": "datv",
    "accusative": "accs",
    "acc": "accs",
    "accs": "accs",
    "instrumental": "ablt",
    "ins": "ablt",
    "ablt": "ablt",
    "prepositional": "loct",
    "loc": "loct",
    "loct": "loct",
}

NUMBER_ALIASES: dict[str, str] = {
    "singular": "sing",
    "sg": "sing",
    "sing": "sing",
    "plural": "plur",
    "pl": "plur",
    "plur": "plur",
}


@dataclass(frozen=True)
class TemplateContext:
    template_id: str
    level_id: str
    params: dict[str, Any]
    metadata: dict[str, Any]


class TemplateEngine:
    _PLACEHOLDER_RE = re.compile(r"\{\{\s*([a-zA-Z_]+)(?::([^}]+))?\s*\}\}")

    def __init__(self, word_bank: WordBank, example_bank: ExampleSentenceBank) -> None:
        self._word_bank = word_bank
        self._example_bank = example_bank
        self._morph = MorphAnalyzer()

    def render(self, template: str, context: TemplateContext) -> str:
        def replacer(match: re.Match[str]) -> str:
            token = match.group(1).lower()
            payload = match.group(2) or ""
            args = [part.strip() for part in payload.split(":") if part.strip()]
            if token == "word":
                return self._render_word(args)
            if token == "example":
                return self._example_bank.sentence()
            if token == "number":
                return self._render_number(args)
            if token == "option":
                return self._render_option(context)
            return match.group(0)

        return self._PLACEHOLDER_RE.sub(replacer, template)

    def _render_word(self, args: list[str]) -> str:
        pos = args[0].lower() if args else "noun"
        grammemes = self._collect_grammemes(args[1:])
        lemma = self._word_bank.sample(pos)
        return self._inflect(lemma, grammemes)

    def _collect_grammemes(self, args: list[str]) -> set[str]:
        result: set[str] = set()
        for part in args:
            normalized = part.lower()
            if normalized in CASE_ALIASES:
                result.add(CASE_ALIASES[normalized])
                continue
            if normalized in NUMBER_ALIASES:
                result.add(NUMBER_ALIASES[normalized])
        return result

    def _inflect(self, lemma: str, grammemes: set[str]) -> str:
        if not grammemes:
            return lemma
        forms = self._morph.parse(lemma)  # type: ignore[attr-defined]
        if not forms:
            return lemma
        best = cast(Parse, forms[0])
        inflected = best.inflect(grammemes)
        if not inflected:
            return lemma
        return inflected.word

    def _render_number(self, args: list[str]) -> str:
        minimum = 1
        maximum = 20
        if args:
            try:
                minimum = int(args[0])
            except ValueError:
                pass
        if len(args) > 1:
            try:
                maximum = int(args[1])
            except ValueError:
                pass
        if minimum > maximum:
            minimum, maximum = maximum, minimum
        return str(random.randint(minimum, maximum))

    def _render_option(self, context: TemplateContext) -> str:
        options = context.params.get("options")
        if not options:
            return ""
        if not isinstance(options, list):
            return str(options)
        token = random.choice(options)
        return str(token)
