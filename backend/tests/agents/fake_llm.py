from typing import Any

from agichat.agents.llm import LLMReply, ToolCall

AGENT_BY_PROMPT = {
    "Eres el asistente de cine": "supervisor",
    "Eres el especialista en recomendaciones": "recomendador",
    "Eres el crítico": "critico",
    "Eres un clasificador de seguridad": "guardian",
}


def call(name: str, call_id: str = "c1", **arguments: Any) -> ToolCall:
    return ToolCall(call_id, name, arguments)


def tools(*calls: ToolCall) -> LLMReply:
    return LLMReply("", list(calls))


def say(text: str) -> LLMReply:
    return LLMReply(text)


class ScriptedLLM:
    """LLM falso: cada agente (identificado por su system prompt) consume su propio guion."""

    def __init__(self, **scripts: list[LLMReply]) -> None:
        self.scripts = {name: list(replies) for name, replies in scripts.items()}
        self.calls: list[tuple[str, list[dict[str, Any]], list[dict[str, Any]] | None]] = []

    async def chat(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None = None
    ) -> LLMReply:
        system = messages[0]["content"]
        agent = next(name for prefix, name in AGENT_BY_PROMPT.items() if system.startswith(prefix))
        self.calls.append((agent, [dict(m) for m in messages], tools))
        script = self.scripts.get(agent)
        if not script:
            raise AssertionError(f"El guion de '{agent}' se terminó")
        return script.pop(0)

    def tool_names_seen_by(self, agent: str) -> set[str]:
        return {
            spec["function"]["name"]
            for name, _, specs in self.calls
            if name == agent
            for spec in specs or []
        }
