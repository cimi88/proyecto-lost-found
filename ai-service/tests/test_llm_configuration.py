from types import SimpleNamespace

import pytest

import app.agent as agent
from app.config import get_settings


def test_default_provider_is_groq(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("LLM_PROVIDER", raising=False)

    settings = get_settings()

    assert settings.llm_provider == "groq"
    assert settings.groq_model == "openai/gpt-oss-120b"


def test_ollama_can_be_selected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "ollama")

    settings = get_settings()

    assert settings.llm_provider == "ollama"


def test_unknown_provider_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "unknown-provider")

    with pytest.raises(ValueError, match="Unsupported LLM_PROVIDER"):
        get_settings()


def test_groq_is_initialized_with_api_key_and_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict = {}

    class FakeChatGroq:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr(agent, "ChatGroq", FakeChatGroq)

    agent.build_llm(
        SimpleNamespace(
            llm_provider="groq",
            groq_api_key="test-groq-key",
            groq_model="openai/gpt-oss-120b",
        )
    )

    assert captured == {
        "model": "openai/gpt-oss-120b",
        "api_key": "test-groq-key",
        "temperature": 0.2,
        "max_retries": 2,
    }


def test_ollama_is_initialized_with_existing_headers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict = {}

    class FakeChatOllama:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr(agent, "ChatOllama", FakeChatOllama)

    agent.build_llm(
        SimpleNamespace(
            llm_provider="ollama",
            ollama_api_key="test-ollama-key",
            ollama_model="gemma4:31b",
            ollama_base_url="https://ollama.test",
        )
    )

    assert captured["model"] == "gemma4:31b"
    assert captured["base_url"] == "https://ollama.test"
    assert captured["temperature"] == 0.2
    assert captured["client_kwargs"]["headers"] == {
        "Authorization": "Bearer test-ollama-key"
    }
    assert captured["async_client_kwargs"]["headers"] == {
        "Authorization": "Bearer test-ollama-key"
    }


def test_missing_selected_provider_key_is_rejected() -> None:
    with pytest.raises(RuntimeError, match="GROQ_API_KEY"):
        agent.build_llm(
            SimpleNamespace(
                llm_provider="groq",
                groq_api_key=None,
                groq_model="openai/gpt-oss-120b",
            )
        )

    with pytest.raises(RuntimeError, match="OLLAMA_API_KEY"):
        agent.build_llm(
            SimpleNamespace(
                llm_provider="ollama",
                ollama_api_key=None,
                ollama_model="gemma4:31b",
                ollama_base_url="https://ollama.test",
            )
        )


def test_build_llm_rejects_unknown_provider() -> None:
    with pytest.raises(ValueError, match="Unsupported LLM provider"):
        agent.build_llm(SimpleNamespace(llm_provider="unknown"))
