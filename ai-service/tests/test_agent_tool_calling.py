from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

from langchain_core.messages import AIMessage

from app.action_preparation import build_preparation_tools
from app.agent import generate_reply
from app.pending_actions import PendingActionStore


class FakeToolCallingLLM:
    def __init__(self, responses: list[AIMessage]) -> None:
        self.responses = responses
        self.bound_tools = []

    def bind_tools(self, tools):
        self.bound_tools = tools
        return self

    async def ainvoke(self, _messages):
        return self.responses.pop(0)


async def test_agent_prepares_action_through_the_tool_loop(monkeypatch) -> None:
    store = PendingActionStore()
    tools, context = build_preparation_tools(
        store=store,
        actor_id="actor-1",
        conversation_id=uuid4(),
    )
    fake_llm = FakeToolCallingLLM(
        [
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "prepare_create_lost_publication",
                        "args": {
                            "title": "Mochila negra",
                            "description": "Mochila negra con una marca azul.",
                            "category": "BAGS",
                            "location": "Plaza Central",
                            "eventDate": "2020-11-01",
                        },
                        "id": "call-1",
                    }
                ],
            ),
            AIMessage(
                content="Preparé la publicación. Todavía no fue ejecutada."
            ),
        ]
    )
    monkeypatch.setattr(
        "app.agent.build_llm",
        lambda _settings: fake_llm,
    )

    reply = await generate_reply(
        "USER",
        "Perdí una mochila negra.",
        [],
        SimpleNamespace(
            llm_provider="groq",
            groq_api_key="test",
        ),
        tools=tools,
    )

    assert "Todavía no fue ejecutada" in reply
    assert fake_llm.bound_tools == tools
    assert context.pending_action is not None
    assert context.pending_action.actor_id == "actor-1"
    assert context.pending_action.payload["title"] == "Mochila negra"


async def test_agent_without_tool_call_preserves_text_response(monkeypatch) -> None:
    fake_llm = FakeToolCallingLLM(
        [AIMessage(content="Respuesta orientativa")]
    )
    monkeypatch.setattr(
        "app.agent.build_llm",
        lambda _settings: fake_llm,
    )

    reply = await generate_reply(
        "USER",
        "¿Cómo busco?",
        [],
        SimpleNamespace(
            llm_provider="groq",
            groq_api_key="test",
        ),
    )

    assert reply == "Respuesta orientativa"
    assert fake_llm.bound_tools == []
