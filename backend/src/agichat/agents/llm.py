import json
from dataclasses import dataclass, field
from typing import Any, Protocol

from openai import AsyncOpenAI


@dataclass(frozen=True)
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass(frozen=True)
class LLMReply:
    content: str
    tool_calls: list[ToolCall] = field(default_factory=list)

    def as_message(self) -> dict[str, Any]:
        message: dict[str, Any] = {"role": "assistant", "content": self.content}
        if self.tool_calls:
            message["tool_calls"] = [
                {
                    "id": call.id,
                    "type": "function",
                    "function": {"name": call.name, "arguments": json.dumps(call.arguments)},
                }
                for call in self.tool_calls
            ]
        return message


class LLM(Protocol):
    async def chat(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None = None
    ) -> LLMReply: ...


def _parse_arguments(raw: str | None) -> dict[str, Any]:
    try:
        parsed = json.loads(raw or "{}")
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


class OpenAICompatibleLLM:
    """Cualquier proveedor con la API de chat completions de OpenAI (Groq en este proyecto)."""

    def __init__(self, client: AsyncOpenAI, model: str, temperature: float = 0.3) -> None:
        self._client = client
        self._model = model
        self._temperature = temperature

    async def chat(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None = None
    ) -> LLMReply:
        extra: dict[str, Any] = {"tools": tools} if tools else {}
        response = await self._client.chat.completions.create(
            model=self._model,
            messages=messages,  # type: ignore[arg-type]
            temperature=self._temperature,
            **extra,
        )
        message = response.choices[0].message
        calls = [
            ToolCall(call.id, call.function.name, _parse_arguments(call.function.arguments))
            for call in message.tool_calls or []
            if call.type == "function"
        ]
        return LLMReply(message.content or "", calls)
