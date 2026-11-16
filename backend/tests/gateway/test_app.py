from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from typing import Any

import pytest
from fakeredis import FakeAsyncRedis
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from agichat.agents.events import AgentEvent, MovieCard, MovieCardEvent, OpenUrlEvent, TextEvent
from agichat.config import Settings
from agichat.gateway.app import create_app
from agichat.gateway.sessions import RedisSessionStore

ORIGIN = "http://localhost:8080"
HEADERS = {"origin": ORIGIN}

CARD = MovieCard(
    tmdbId=438631,
    title="Dune",
    year=2021,
    posterUrl="https://image.tmdb.org/t/p/w500/dune.jpg",
    overview="Paul Atreides llega a Arrakis.",
    rating=7.8,
    imdbUrl="https://www.imdb.com/title/tt1160419/",
    tmdbUrl="https://www.themoviedb.org/movie/438631",
)
EVENTS: list[AgentEvent] = [
    OpenUrlEvent(url="https://www.imdb.com/title/tt1160419/", site="imdb"),
    TextEvent(id="agent-1", content="Te recomiendo", status="streaming"),
    TextEvent(id="agent-1", content="Te recomiendo Dune", status="complete"),
    MovieCardEvent(messageId="agent-1", card=CARD),
]


class FakeOrchestrator:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    async def run_turn(self, session_id: str, text: str) -> AsyncIterator[AgentEvent]:
        self.calls.append((session_id, text))
        for event in EVENTS:
            yield event


@pytest.fixture
def orchestrator() -> FakeOrchestrator:
    return FakeOrchestrator()


@pytest.fixture
def client(orchestrator: FakeOrchestrator) -> Iterator[TestClient]:
    settings = Settings(_env_file=None, allowed_origins=[ORIGIN])  # type: ignore[call-arg]
    app = create_app(settings, redis=FakeAsyncRedis(), orchestrator=orchestrator)  # type: ignore[arg-type]
    with TestClient(app) as test_client:
        yield test_client


def send(ws: Any, text: str) -> None:
    ws.send_json({"type": "user_message", "text": text})


def test_health(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}


def test_reenvia_los_eventos_en_orden_y_sin_cambios(
    client: TestClient, orchestrator: FakeOrchestrator
) -> None:
    with client.websocket_connect("/ws?session=sesion-valida-1", headers=HEADERS) as ws:
        send(ws, "Recomiéndame algo")
        received = [ws.receive_json() for _ in EVENTS]
    assert received == [event.model_dump() for event in EVENTS]
    assert orchestrator.calls == [("sesion-valida-1", "Recomiéndame algo")]


def test_un_origin_no_permitido_se_rechaza(client: TestClient) -> None:
    with (
        pytest.raises(WebSocketDisconnect),
        client.websocket_connect("/ws", headers={"origin": "https://evil.example"}),
    ):
        pass


def test_sin_origin_se_rechaza(client: TestClient) -> None:
    with pytest.raises(WebSocketDisconnect), client.websocket_connect("/ws"):
        pass


def test_mensaje_de_mas_de_4000_caracteres_no_llama_al_orquestador(
    client: TestClient, orchestrator: FakeOrchestrator
) -> None:
    with client.websocket_connect("/ws", headers=HEADERS) as ws:
        send(ws, "a" * 4001)
        reply = ws.receive_json()
    assert reply["type"] == "text"
    assert reply["status"] == "error"
    assert orchestrator.calls == []


def test_mensaje_mal_formado_devuelve_error_y_la_conexion_sigue_abierta(
    client: TestClient, orchestrator: FakeOrchestrator
) -> None:
    with client.websocket_connect("/ws", headers=HEADERS) as ws:
        ws.send_text("esto no es json")
        assert ws.receive_json()["status"] == "error"
        ws.send_json({"type": "otro_tipo", "text": "hola"})
        assert ws.receive_json()["status"] == "error"
        send(ws, "Hola")
        assert ws.receive_json() == EVENTS[0].model_dump()
    assert len(orchestrator.calls) == 1


def test_aplica_el_limite_de_velocidad(client: TestClient, orchestrator: FakeOrchestrator) -> None:
    with client.websocket_connect("/ws?session=sesion-rapida", headers=HEADERS) as ws:
        for _ in range(20):
            send(ws, "Hola")
            for _ in EVENTS:
                ws.receive_json()
        send(ws, "Hola")
        reply = ws.receive_json()
    assert reply["status"] == "error"
    assert "muy rápido" in reply["content"]
    assert len(orchestrator.calls) == 20


def test_sesion_invalida_genera_un_uuid(client: TestClient, orchestrator: FakeOrchestrator) -> None:
    with client.websocket_connect("/ws?session=../etc", headers=HEADERS) as ws:
        send(ws, "Hola")
        ws.receive_json()
    session_id = orchestrator.calls[0][0]
    assert session_id != "../etc"
    assert len(session_id) == 36


def test_el_lifespan_abre_el_orquestador_una_sola_vez_con_sesiones_en_redis(
    monkeypatch: pytest.MonkeyPatch, orchestrator: FakeOrchestrator
) -> None:
    opened: list[Any] = []

    @asynccontextmanager
    async def fake_create(settings: Settings, sessions: Any) -> AsyncIterator[FakeOrchestrator]:
        opened.append(sessions)
        yield orchestrator

    monkeypatch.setattr("agichat.gateway.app.create_orchestrator", fake_create)
    settings = Settings(_env_file=None, allowed_origins=[ORIGIN])  # type: ignore[call-arg]
    with TestClient(create_app(settings, redis=FakeAsyncRedis())) as test_client:
        for _ in range(2):
            with test_client.websocket_connect("/ws", headers=HEADERS) as ws:
                send(ws, "Hola")
                ws.receive_json()
    assert len(opened) == 1
    assert isinstance(opened[0], RedisSessionStore)
