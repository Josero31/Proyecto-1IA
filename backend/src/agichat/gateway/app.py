import logging
import re
import uuid
from collections.abc import AsyncIterator
from contextlib import aclosing, asynccontextmanager
from typing import Literal

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field, ValidationError
from redis.asyncio import Redis

from agichat.agents.events import TextEvent
from agichat.agents.factory import create_orchestrator
from agichat.agents.orchestrator import Orchestrator
from agichat.config import Settings
from agichat.gateway.rate_limit import RateLimiter
from agichat.gateway.sessions import RedisSessionStore

logger = logging.getLogger(__name__)

MAX_TEXT_LENGTH = 4000
SESSION_PATTERN = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
RATE_LIMIT_REPLY = "Vas muy rápido, espera un momento."
INVALID_MESSAGE_REPLY = (
    "No pude entender tu mensaje. Revisa que no esté vacío ni pase de 4000 caracteres."
)


class UserMessage(BaseModel):
    type: Literal["user_message"]
    text: str = Field(min_length=1, max_length=MAX_TEXT_LENGTH)


def _error_event(text: str) -> dict:
    return TextEvent(id=f"error-{uuid.uuid4().hex[:12]}", content=text, status="error").model_dump()


def _session_id(raw: str | None) -> str:
    return raw if raw and SESSION_PATTERN.fullmatch(raw) else str(uuid.uuid4())


def create_app(
    settings: Settings | None = None,
    redis: Redis | None = None,
    orchestrator: Orchestrator | None = None,
) -> FastAPI:
    """``redis`` y ``orchestrator`` solo se inyectan en tests; los abre el lifespan."""
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        client = redis or Redis.from_url(settings.redis_url or "redis://localhost:6379/0")
        app.state.limiter = RateLimiter(client)
        try:
            if orchestrator is not None:
                app.state.orchestrator = orchestrator
                yield
            else:
                async with create_orchestrator(
                    settings, sessions=RedisSessionStore(client)
                ) as created:
                    app.state.orchestrator = created
                    yield
        finally:
            if redis is None:
                await client.aclose()

    app = FastAPI(lifespan=lifespan)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.websocket("/ws")
    async def chat(websocket: WebSocket) -> None:
        if websocket.headers.get("origin") not in settings.allowed_origins:
            await websocket.close(code=1008)
            return
        await websocket.accept()
        session_id = _session_id(websocket.query_params.get("session"))
        limiter: RateLimiter = app.state.limiter
        current: Orchestrator = app.state.orchestrator
        try:
            while True:
                raw = await websocket.receive_text()
                try:
                    message = UserMessage.model_validate_json(raw)
                except ValidationError:
                    await websocket.send_json(_error_event(INVALID_MESSAGE_REPLY))
                    continue
                if not await limiter.allow(session_id):
                    await websocket.send_json(_error_event(RATE_LIMIT_REPLY))
                    continue
                async with aclosing(current.run_turn(session_id, message.text)) as events:
                    async for event in events:
                        await websocket.send_json(event.model_dump())
        except WebSocketDisconnect:
            logger.info("Cliente desconectado (sesión %s)", session_id)

    return app
