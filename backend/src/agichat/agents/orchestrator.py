import asyncio
import logging
import re
import uuid
from collections.abc import AsyncIterator
from typing import Any, Protocol

from agichat.agents.agent import ToolAgent
from agichat.agents.events import AgentEvent, MovieCard, MovieCardEvent, OpenUrlEvent, TextEvent
from agichat.agents.guardian import Category, Guardian
from agichat.agents.output_filter import OutputFilter
from agichat.agents.prompts import (
    ERROR_REPLY,
    INJECTION_REFUSAL,
    LEAK_REFUSAL,
    TOO_LONG_REFUSAL,
)
from agichat.agents.tools import TurnContext, UiAction

logger = logging.getLogger(__name__)

MAX_CARDS = 3
HISTORY_LIMIT = 12

_BLOCKED_REPLY: dict[Category, str] = {
    "prompt_injection": INJECTION_REFUSAL,
    "prompt_leak": LEAK_REFUSAL,
    "too_long": TOO_LONG_REFUSAL,
}


class SessionStore(Protocol):
    """Historial por sesión. La Parte 2 lo implementa sobre Redis para que el gateway no tenga
    estado; aquí está la versión en memoria para desarrollo y tests."""

    async def load(self, session_id: str) -> list[dict[str, Any]]: ...

    async def save(self, session_id: str, messages: list[dict[str, Any]]) -> None: ...


class InMemorySessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, list[dict[str, Any]]] = {}

    async def load(self, session_id: str) -> list[dict[str, Any]]:
        return list(self._sessions.get(session_id, []))

    async def save(self, session_id: str, messages: list[dict[str, Any]]) -> None:
        self._sessions[session_id] = list(messages)


def chunk_text(text: str, words_per_chunk: int = 6) -> list[str]:
    """Prefijos acumulados del texto, para simular streaming en el widget."""
    tokens = re.split(r"(\s+)", text)
    prefixes: list[str] = []
    words = 0
    current = ""
    for token in tokens:
        current += token
        if token.strip():
            words += 1
            if words % words_per_chunk == 0:
                prefixes.append(current)
    if not prefixes or prefixes[-1] != current:
        prefixes.append(current)
    return prefixes


class Orchestrator:
    """Punto de entrada del sistema multiagente para un turno del usuario.

    Flujo: Guardián -> Supervisor (delega en especialistas) -> Filtro de salida -> eventos.
    """

    def __init__(
        self,
        guardian: Guardian,
        supervisor: ToolAgent,
        output_filter: OutputFilter,
        sessions: SessionStore | None = None,
        max_tool_calls: int = 12,
    ) -> None:
        self._guardian = guardian
        self._supervisor = supervisor
        self._filter = output_filter
        self._sessions = sessions or InMemorySessionStore()
        self._max_tool_calls = max_tool_calls

    async def run_turn(self, session_id: str, text: str) -> AsyncIterator[AgentEvent]:
        message_id = f"agent-{uuid.uuid4().hex[:12]}"

        verdict = await self._guardian.inspect(text)
        if not verdict.allowed:
            # El intento no se guarda en el historial: no debe contaminar turnos futuros.
            logger.warning("Mensaje bloqueado (%s): %s", verdict.category, verdict.reason)
            for event in _text_events(message_id, _BLOCKED_REPLY[verdict.category]):
                yield event
            return

        history = await self._sessions.load(session_id)
        user_message = {"role": "user", "content": text}

        # Las pestañas se abren en cuanto el agente lo decide (el navegador solo permite
        # window.open poco después de la última interacción del usuario); las tarjetas se
        # mandan después del texto porque se adjuntan a ese mensaje.
        open_urls: asyncio.Queue[OpenUrlEvent | None] = asyncio.Queue()
        cards: list[MovieCard] = []

        async def emit(action: UiAction) -> None:
            if isinstance(action, OpenUrlEvent):
                await open_urls.put(action)
            elif all(card.tmdbId != action.tmdbId for card in cards):
                cards.append(action)

        ctx = TurnContext(emit=emit, max_tool_calls=self._max_tool_calls)
        task = asyncio.create_task(self._supervisor.run([*history, user_message], ctx))
        task.add_done_callback(lambda _: open_urls.put_nowait(None))
        try:
            while (event := await open_urls.get()) is not None:
                yield event
            answer = task.result()
        except Exception:
            logger.exception("Falló el turno de la sesión %s", session_id)
            yield TextEvent(id=message_id, content=ERROR_REPLY, status="error")
            return
        finally:
            if not task.done():
                task.cancel()

        filtered = self._filter.apply(answer)
        if filtered.leaked:
            logger.warning("Filtro de salida bloqueó una posible fuga del prompt")
            reply, cards = LEAK_REFUSAL, []
        else:
            reply = filtered.text or ERROR_REPLY

        for event in _text_events(message_id, reply):
            yield event
        for card in cards[:MAX_CARDS]:
            yield MovieCardEvent(messageId=message_id, card=card)

        assistant_message = {"role": "assistant", "content": reply}
        updated = [*history, user_message, assistant_message][-HISTORY_LIMIT:]
        await self._sessions.save(session_id, updated)


def _text_events(message_id: str, text: str) -> list[TextEvent]:
    prefixes = chunk_text(text)
    return [
        TextEvent(
            id=message_id,
            content=prefix,
            status="complete" if i == len(prefixes) - 1 else "streaming",
        )
        for i, prefix in enumerate(prefixes)
    ]
