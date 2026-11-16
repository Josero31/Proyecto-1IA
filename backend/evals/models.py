from dataclasses import dataclass, field
from typing import Any, Literal

from agichat.agents.events import MovieCard

Layer = Literal["guardian", "output_filter", "none"]


@dataclass(frozen=True)
class Case:
    id: str
    category: str
    turns: tuple[str, ...]
    expect: dict[str, Any]
    attack_markers: tuple[str, ...] = ()
    tmdb_poison: str | None = None


@dataclass
class Transcript:
    """Lo que vio el usuario en un caso: una respuesta final por turno, más las acciones de UI."""

    replies: list[str] = field(default_factory=list)
    cards: list[MovieCard] = field(default_factory=list)
    open_urls: list[tuple[str, str]] = field(default_factory=list)
    blocked_by: Layer = "none"
    canary: str = ""
    secret_texts: tuple[str, ...] = ()
    attack_markers: tuple[str, ...] = ()
