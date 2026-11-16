from types import SimpleNamespace
from typing import Any

from agichat.agents.llm import LLMReply, OpenAICompatibleLLM, ToolCall


class FakeCompletions:
    def __init__(self, message: SimpleNamespace) -> None:
        self.message = message
        self.kwargs: dict[str, Any] = {}

    async def create(self, **kwargs: Any) -> SimpleNamespace:
        self.kwargs = kwargs
        return SimpleNamespace(choices=[SimpleNamespace(message=self.message)])


def fake_client(message: SimpleNamespace) -> tuple[Any, FakeCompletions]:
    completions = FakeCompletions(message)
    return SimpleNamespace(chat=SimpleNamespace(completions=completions)), completions


def tool_call(call_id: str, name: str, arguments: str) -> SimpleNamespace:
    return SimpleNamespace(
        id=call_id, type="function", function=SimpleNamespace(name=name, arguments=arguments)
    )


async def test_texto_sin_tools() -> None:
    client, completions = fake_client(SimpleNamespace(content="hola", tool_calls=None))
    reply = await OpenAICompatibleLLM(client, "modelo", 0.2).chat([{"role": "user"}])
    assert reply == LLMReply("hola")
    assert completions.kwargs["model"] == "modelo"
    assert completions.kwargs["temperature"] == 0.2
    assert "tools" not in completions.kwargs


async def test_parsea_tool_calls_y_tolera_json_invalido() -> None:
    message = SimpleNamespace(
        content=None,
        tool_calls=[
            tool_call("a", "search_movie", '{"query": "Dune"}'),
            tool_call("b", "present_movie", "{no es json"),
            tool_call("c", "raro", "[1, 2]"),
        ],
    )
    client, completions = fake_client(message)
    specs = [{"type": "function", "function": {"name": "search_movie"}}]
    reply = await OpenAICompatibleLLM(client, "m").chat([], specs)
    assert completions.kwargs["tools"] == specs
    assert reply.content == ""
    assert reply.tool_calls == [
        ToolCall("a", "search_movie", {"query": "Dune"}),
        ToolCall("b", "present_movie", {}),
        ToolCall("c", "raro", {}),
    ]


def test_as_message_reconstruye_el_turno_del_asistente() -> None:
    assert LLMReply("hola").as_message() == {"role": "assistant", "content": "hola"}
    message = LLMReply("", [ToolCall("a", "x", {"k": 1})]).as_message()
    assert message["tool_calls"][0]["function"] == {"name": "x", "arguments": '{"k": 1}'}
