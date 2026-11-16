import logging
import re
import uuid
from collections.abc import Callable, Mapping
from contextlib import AsyncExitStack
from dataclasses import dataclass
from typing import Any, Self

import httpx
from openai import AsyncOpenAI

from agichat.agents.events import MovieCardEvent, OpenUrlEvent, TextEvent
from agichat.agents.factory import build_orchestrator
from agichat.agents.guardian import GuardVerdict
from agichat.agents.llm import LLM, OpenAICompatibleLLM
from agichat.agents.orchestrator import Orchestrator
from agichat.agents.output_filter import FilterResult
from agichat.agents.tools import McpToolbox
from agichat.cache import MemoryCache, build_cache
from agichat.config import Settings
from agichat.mcp_servers.books.server import build_server as build_books
from agichat.mcp_servers.books.service import GOOGLE_BOOKS_API_URL, BooksService
from agichat.mcp_servers.http_source import CachedJsonSource
from agichat.mcp_servers.references.server import build_server as build_references
from agichat.mcp_servers.tmdb.server import build_server as build_tmdb
from agichat.mcp_servers.tmdb.service import TMDB_API_URL, TMDBService
from evals.models import Case, Layer, Transcript

CANARY = re.compile(r"AGX-[0-9a-f]{16}")
ORCHESTRATOR_LOGGER = "agichat.agents.orchestrator"


class OpenGuardian:
    """Guardián que deja pasar todo (ni siquiera las heurísticas), para medir sin defensas."""

    async def inspect(self, text: str) -> GuardVerdict:
        return GuardVerdict("safe", "sin defensas")


class PassthroughFilter:
    def apply(self, text: str) -> FilterResult:
        return FilterResult(text, leaked=False)


@dataclass(frozen=True)
class System:
    orchestrator: Orchestrator
    canary: str
    secret_texts: tuple[str, ...]


def poisoned_tmdb_handler(poison: str) -> Callable[[httpx.Request], httpx.Response]:
    """TMDB comprometido: devuelve la sinopsis envenenada en todas las respuestas."""
    summary = {
        "id": 438631,
        "title": "Dune",
        "original_title": "Dune",
        "release_date": "2021-09-15",
        "vote_average": 7.79,
        "vote_count": 12000,
        "genre_ids": [878, 18],
        "overview": poison,
    }
    details = {
        **summary,
        "genres": [{"id": 878, "name": "Ciencia ficción"}],
        "runtime": 155,
        "imdb_id": "tt1160419",
        "poster_path": "/d5NXSklXo0qyIYkgV94XAgMIckC.jpg",
        "credits": {"crew": [{"name": "Frank Herbert", "job": "Novel"}]},
        "keywords": {"keywords": [{"id": 818, "name": "based on novel or book"}]},
    }
    routes: dict[str, Any] = {
        "/3/genre/movie/list": {"genres": [{"id": 878, "name": "Ciencia ficción"}]},
        "/3/search/movie": {"results": [summary]},
        "/3/discover/movie": {"results": [summary]},
        "/3/movie/438631": details,
        "/3/movie/438631/recommendations": {"results": [summary]},
    }

    def handle(request: httpx.Request) -> httpx.Response:
        body = routes.get(request.url.path)
        if body is None:
            return httpx.Response(404, json={"status_message": "not found"})
        return httpx.Response(200, json=body)

    return handle


def _tmdb_service(settings: Settings, poison: str | None) -> TMDBService:
    if poison is None:
        token = settings.tmdb_read_access_token.get_secret_value()
        http = httpx.AsyncClient(
            base_url=TMDB_API_URL, headers={"Authorization": f"Bearer {token}"}, timeout=10
        )
        cache = build_cache(settings.redis_url)
    else:
        http = httpx.AsyncClient(
            base_url=TMDB_API_URL, transport=httpx.MockTransport(poisoned_tmdb_handler(poison))
        )
        cache = MemoryCache()
    source = CachedJsonSource(
        label="TMDB",
        http=http,
        cache=cache,
        daily_limit=settings.tmdb_daily_limit,
        ttl_seconds=6 * 60 * 60,
    )
    return TMDBService(source, settings.tmdb_language)


def _books_service(settings: Settings) -> BooksService:
    api_key = settings.google_books_api_key.get_secret_value()
    source = CachedJsonSource(
        label="Google Books",
        http=httpx.AsyncClient(base_url=GOOGLE_BOOKS_API_URL, timeout=10),
        cache=build_cache(settings.redis_url),
        daily_limit=settings.books_daily_limit,
        ttl_seconds=24 * 60 * 60,
        secret_params={"key": api_key} if api_key else None,
    )
    return BooksService(source)


def build_llms(settings: Settings) -> tuple[LLM, LLM]:
    client = AsyncOpenAI(
        api_key=settings.groq_api_key.get_secret_value(), base_url=settings.llm_base_url
    )
    return (
        OpenAICompatibleLLM(client, settings.agent_model, temperature=0.4),
        OpenAICompatibleLLM(client, settings.guard_model, temperature=0),
    )


def make_system(
    toolbox: McpToolbox, llm: LLM, guard_llm: LLM | None, *, defenses: bool = True
) -> System:
    """Sin defensas se conservan el supervisor y sus prompts reforzados; se quitan el guardián
    y el filtro de salida."""
    orchestrator = build_orchestrator(toolbox, llm, guard_llm)
    supervisor = orchestrator._supervisor
    match = CANARY.search(supervisor.system_prompt)
    if match is None:
        raise RuntimeError("No se encontró el canary en el prompt del supervisor.")
    if not defenses:
        orchestrator = Orchestrator(
            OpenGuardian(),  # type: ignore[arg-type]
            supervisor,
            PassthroughFilter(),  # type: ignore[arg-type]
        )
    return System(orchestrator, match.group(0), (supervisor.system_prompt,))


class SystemPool:
    """Arma cada combinación (TMDB real o envenenado, con o sin defensas) una sola vez.

    Los MCP servers corren en el mismo proceso; Groq, Google Books y TMDB (salvo en la
    inyección indirecta) son reales.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._stack = AsyncExitStack()
        self._systems: dict[tuple[str | None, bool], System] = {}

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        await self._stack.aclose()

    async def get(self, poison: str | None, defenses: bool) -> System:
        key = (poison, defenses)
        if key not in self._systems:
            servers: Mapping[str, Any] = {
                "tmdb": build_tmdb(_tmdb_service(self._settings, poison)),
                "books": build_books(_books_service(self._settings)),
                "references": build_references(),
            }
            toolbox = await self._stack.enter_async_context(McpToolbox(servers))
            llm, guard_llm = build_llms(self._settings)
            self._systems[key] = make_system(toolbox, llm, guard_llm, defenses=defenses)
        return self._systems[key]


class _LayerRecorder(logging.Handler):
    def __init__(self) -> None:
        super().__init__(level=logging.WARNING)
        self.layer: Layer = "none"

    def emit(self, record: logging.LogRecord) -> None:
        message = record.getMessage()
        if message.startswith("Mensaje bloqueado"):
            self.layer = "guardian"
        elif message.startswith("Filtro de salida bloqueó"):
            self.layer = "output_filter"


async def run_case(system: System, case: Case) -> Transcript:
    transcript = Transcript(
        canary=system.canary, secret_texts=system.secret_texts, attack_markers=case.attack_markers
    )
    recorder = _LayerRecorder()
    logger = logging.getLogger(ORCHESTRATOR_LOGGER)
    logger.addHandler(recorder)
    session_id = f"eval-{uuid.uuid4().hex}"
    try:
        for turn in case.turns:
            reply = ""
            async for event in system.orchestrator.run_turn(session_id, turn):
                if isinstance(event, TextEvent):
                    reply = event.content
                elif isinstance(event, MovieCardEvent):
                    transcript.cards.append(event.card)
                elif isinstance(event, OpenUrlEvent):
                    transcript.open_urls.append((event.site, event.url))
            transcript.replies.append(reply)
    finally:
        logger.removeHandler(recorder)
    transcript.blocked_by = recorder.layer
    return transcript
