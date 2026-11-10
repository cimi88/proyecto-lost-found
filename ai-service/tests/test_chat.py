import asyncio
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app.agent import build_system_prompt
from app.pending_actions import PendingActionStore, PendingActionType
from app.schemas import (
    ActionCancelResponse,
    ActionConfirmResponse,
    ChatMessage,
)

IDENTITY = "22222222-2222-4222-8222-222222222222"
OTHER_IDENTITY = "33333333-3333-4333-8333-333333333333"


@pytest.fixture(autouse=True)
def configured_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        main_module,
        "settings",
        SimpleNamespace(
            llm_provider="groq",
            groq_api_key="test-groq-key",
            groq_model="openai/gpt-oss-120b",
            ollama_api_key=None,
            ollama_model="gemma4:31b",
            ollama_base_url="https://ollama.com",
            mcp_server_url="http://mcp.test",
            allowed_origins=[],
        ),
    )


def test_health_is_available() -> None:
    response = TestClient(main_module.app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.parametrize("provider", ["groq", "ollama"])
def test_chat_returns_503_when_selected_provider_key_is_missing(
    monkeypatch: pytest.MonkeyPatch,
    provider: str,
) -> None:
    async def fake_role(_identity: str, _settings) -> str:
        return "USER"

    monkeypatch.setattr(main_module, "get_user_role", fake_role)
    monkeypatch.setattr(
        main_module,
        "settings",
        SimpleNamespace(
            llm_provider=provider,
            groq_api_key=None if provider == "groq" else "test",
            groq_model="openai/gpt-oss-120b",
            ollama_api_key=None if provider == "ollama" else "test",
            ollama_model="gemma4:31b",
            ollama_base_url="https://ollama.test",
            mcp_server_url="http://mcp.test",
            allowed_origins=[],
        ),
    )

    response = TestClient(main_module.app).post(
        "/chat",
        json={"message": "Hola"},
        headers={"X-Demo-User-Id": IDENTITY},
    )

    assert response.status_code == 503
    assert response.json()["code"] == "ASSISTANT_UNAVAILABLE"
    assert "test" not in response.text


def test_chat_requires_demo_identity() -> None:
    response = TestClient(main_module.app).post(
        "/chat", json={"message": "¿Cómo busco?"}
    )
    assert response.status_code == 401
    assert response.json()["code"] == "DEMO_IDENTITY_REQUIRED"


def test_chat_rejects_invalid_identity() -> None:
    response = TestClient(main_module.app).post(
        "/chat",
        json={"message": "¿Cómo busco?"},
        headers={"X-Demo-User-Id": "not-a-uuid"},
    )
    assert response.status_code == 401
    assert response.json()["code"] == "DEMO_IDENTITY_INVALID"


def test_chat_uses_role_from_backend_and_returns_it(
    monkeypatch,
) -> None:
    captured: dict[str, str] = {}

    async def fake_role(identity: str, _settings) -> str:
        captured["identity"] = identity
        return "ADMIN"

    async def fake_reply(
        role: str,
        _message: str,
        _history,
        _settings,
        tools=(),
    ) -> str:
        captured["role"] = role
        return "Como administrador, podés supervisar las publicaciones."

    monkeypatch.setattr(main_module, "get_user_role", fake_role)
    monkeypatch.setattr(main_module, "generate_reply", fake_reply)

    response = TestClient(main_module.app).post(
        "/chat",
        json={"message": "¿Qué puedo hacer como admin?"},
        headers={"X-Demo-User-Id": IDENTITY},
    )

    assert response.status_code == 200
    assert response.json() == {
        "reply": "Como administrador, podés supervisar las publicaciones.",
        "role": "ADMIN",
    }
    assert captured == {"identity": IDENTITY, "role": "ADMIN"}


def test_chat_remains_compatible_without_conversation_id(monkeypatch) -> None:
    async def fake_role(_identity: str, _settings) -> str:
        return "USER"

    async def fake_reply(
        _role: str,
        _message: str,
        _history,
        _settings,
        tools=(),
    ) -> str:
        return "Respuesta"

    monkeypatch.setattr(main_module, "get_user_role", fake_role)
    monkeypatch.setattr(main_module, "generate_reply", fake_reply)

    response = TestClient(main_module.app).post(
        "/chat",
        json={"message": "Hola"},
        headers={"X-Demo-User-Id": IDENTITY},
    )

    assert response.status_code == 200
    assert response.json() == {"reply": "Respuesta", "role": "USER"}


def test_chat_accepts_and_reuses_a_valid_conversation_id(monkeypatch) -> None:
    conversation_id = str(uuid4())

    async def fake_role(_identity: str, _settings) -> str:
        return "USER"

    async def fake_reply(
        _role: str,
        _message: str,
        _history,
        _settings,
        tools=(),
    ) -> str:
        return "Respuesta"

    monkeypatch.setattr(main_module, "get_user_role", fake_role)
    monkeypatch.setattr(main_module, "generate_reply", fake_reply)

    client = TestClient(main_module.app)
    for _ in range(2):
        response = client.post(
            "/chat",
            json={"message": "Hola", "conversation_id": conversation_id},
            headers={"X-Demo-User-Id": IDENTITY},
        )
        assert response.status_code == 200
        assert response.json() == {"reply": "Respuesta", "role": "USER"}


def test_chat_rejects_the_same_conversation_for_another_actor(monkeypatch) -> None:
    conversation_id = str(uuid4())
    calls: list[str] = []

    async def fake_role(identity: str, _settings) -> str:
        return "USER"

    async def fake_reply(
        _role: str,
        _message: str,
        _history,
        _settings,
        tools=(),
    ) -> str:
        calls.append("reply")
        return "Respuesta"

    monkeypatch.setattr(main_module, "get_user_role", fake_role)
    monkeypatch.setattr(main_module, "generate_reply", fake_reply)

    client = TestClient(main_module.app)
    first = client.post(
        "/chat",
        json={"message": "Hola", "conversation_id": conversation_id},
        headers={"X-Demo-User-Id": IDENTITY},
    )
    second = client.post(
        "/chat",
        json={"message": "Hola", "conversation_id": conversation_id},
        headers={"X-Demo-User-Id": OTHER_IDENTITY},
    )

    assert first.status_code == 200
    assert second.status_code == 409
    assert second.json()["code"] == "CONVERSATION_ID_CONFLICT"
    assert calls == ["reply"]


def test_chat_returns_a_prepared_action_preview(monkeypatch) -> None:
    conversation_id = str(uuid4())

    async def fake_role(_identity: str, _settings) -> str:
        return "USER"

    async def fake_reply(
        _role: str,
        _message: str,
        _history,
        _settings,
        tools=(),
    ) -> str:
        await tools[0].ainvoke(
            {
                "title": "Mochila negra",
                "description": "Mochila negra con una marca azul.",
                "category": "BAGS",
                "location": "Plaza Central",
                "eventDate": "2020-11-01",
            }
        )
        return "Preparé la publicación. Todavía no fue ejecutada."

    monkeypatch.setattr(main_module, "get_user_role", fake_role)
    monkeypatch.setattr(main_module, "generate_reply", fake_reply)

    response = TestClient(main_module.app).post(
        "/chat",
        json={"message": "Perdí una mochila", "conversation_id": conversation_id},
        headers={"X-Demo-User-Id": IDENTITY},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["reply"] == (
        "Preparé la publicación. Todavía no fue ejecutada."
    )
    assert body["role"] == "USER"
    assert body["pending_action"]["action_type"] == "CREATE_LOST_PUBLICATION"
    assert body["pending_action"]["status"] == "PENDING"
    assert body["pending_action"]["title"] == "Registrar objeto perdido"
    assert body["pending_action"]["confirmation_token"]
    assert any(
        field["label"] == "Categoría"
        for field in body["pending_action"]["fields"]
    )
    assert "actor_id" not in body["pending_action"]
    assert "payload_hash" not in body["pending_action"]


def test_confirm_rejects_payload_or_identity_in_body() -> None:
    response = TestClient(main_module.app).post(
        "/chat/confirm",
        json={
            "conversation_id": str(uuid4()),
            "action_id": str(uuid4()),
            "payload": {"title": "inyectado"},
        },
        headers={"X-Demo-User-Id": IDENTITY},
    )

    assert response.status_code == 400
    assert response.json()["code"] == "VALIDATION_ERROR"


def test_chat_confirm_and_cancel_endpoints(monkeypatch) -> None:
    action_id = uuid4()
    conversation_id = uuid4()

    async def fake_confirm(*_args, **_kwargs) -> ActionConfirmResponse:
        return ActionConfirmResponse(
            action_id=action_id,
            action_type="CREATE_LOST_PUBLICATION",
            status="COMPLETED",
            result={"id": "created-1"},
            message="La operación se completó correctamente.",
        )

    async def fake_cancel(*_args, **_kwargs) -> ActionCancelResponse:
        return ActionCancelResponse(
            action_id=action_id,
            status="CANCELLED",
            message="La acción fue cancelada.",
        )

    monkeypatch.setattr(main_module, "confirm_action", fake_confirm)
    monkeypatch.setattr(main_module, "cancel_action", fake_cancel)
    client = TestClient(main_module.app)

    confirmed = client.post(
        "/chat/confirm",
        json={
            "conversation_id": str(conversation_id),
            "action_id": str(action_id),
            "confirmation_token": "test-confirmation-token",
        },
        headers={"X-Demo-User-Id": IDENTITY},
    )
    cancelled = client.post(
        "/chat/cancel",
        json={
            "conversation_id": str(conversation_id),
            "action_id": str(action_id),
        },
        headers={"X-Demo-User-Id": IDENTITY},
    )

    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "COMPLETED"
    assert confirmed.json()["result"] == {"id": "created-1"}
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "CANCELLED"


def test_action_status_and_archive_endpoints(monkeypatch) -> None:
    store = PendingActionStore()
    monkeypatch.setattr(main_module, "pending_actions", store)
    conversation_id = uuid4()
    action, _token = asyncio.run(
        store.create_action_with_token(
            actor_id=IDENTITY,
            conversation_id=conversation_id,
            action_type=PendingActionType.CREATE_LOST_PUBLICATION,
            payload={"title": "Mochila"},
        )
    )
    client = TestClient(main_module.app)
    headers = {"X-Demo-User-Id": IDENTITY}

    status_before = client.get(
        f"/chat/actions/{action.action_id}",
        params={"conversation_id": str(conversation_id)},
        headers=headers,
    )
    assert status_before.status_code == 200
    assert status_before.json()["status"] == "PENDING"
    assert "confirmation_token" not in status_before.json()
    assert "confirmation_token_hash" not in status_before.json()

    archived = client.post(
        f"/chat/conversations/{conversation_id}/archive",
        headers=headers,
    )
    assert archived.status_code == 200
    assert archived.json()["archived"] is True
    assert archived.json()["superseded"] == 1

    status_after = client.get(
        f"/chat/actions/{action.action_id}",
        params={"conversation_id": str(conversation_id)},
        headers=headers,
    )
    assert status_after.status_code == 200
    assert status_after.json()["status"] == "SUPERSEDED"

    archived_again = client.post(
        f"/chat/conversations/{conversation_id}/archive",
        headers=headers,
    )
    assert archived_again.status_code == 200
    assert archived_again.json()["superseded"] == 0


def test_archive_endpoint_rejects_executing_action(monkeypatch) -> None:
    store = PendingActionStore()
    monkeypatch.setattr(main_module, "pending_actions", store)
    conversation_id = uuid4()
    action, _token = asyncio.run(
        store.create_action_with_token(
            actor_id=IDENTITY,
            conversation_id=conversation_id,
            action_type=PendingActionType.CREATE_LOST_PUBLICATION,
            payload={"title": "Mochila"},
        )
    )
    asyncio.run(
        store.claim_action(
            action.action_id,
            actor_id=IDENTITY,
            conversation_id=conversation_id,
        )
    )

    response = TestClient(main_module.app).post(
        f"/chat/conversations/{conversation_id}/archive",
        headers={"X-Demo-User-Id": IDENTITY},
    )

    assert response.status_code == 409
    assert response.json()["code"] == "CONVERSATION_ACTION_IN_PROGRESS"
    assert not asyncio.run(
        store.is_archived(
            actor_id=IDENTITY,
            conversation_id=conversation_id,
        )
    )
    current = asyncio.run(
        store.get_action(
            action.action_id,
            actor_id=IDENTITY,
            conversation_id=conversation_id,
        )
    )
    assert current is not None
    assert current.status.value == "EXECUTING"


def test_archive_endpoint_rejects_unknown_action_result(monkeypatch) -> None:
    store = PendingActionStore()
    monkeypatch.setattr(main_module, "pending_actions", store)
    conversation_id = uuid4()
    action, _token = asyncio.run(
        store.create_action_with_token(
            actor_id=IDENTITY,
            conversation_id=conversation_id,
            action_type=PendingActionType.CREATE_LOST_PUBLICATION,
            payload={"title": "Mochila"},
        )
    )
    asyncio.run(
        store.claim_action(
            action.action_id,
            actor_id=IDENTITY,
            conversation_id=conversation_id,
        )
    )
    asyncio.run(
        store.fail_action(
            action.action_id,
            actor_id=IDENTITY,
            conversation_id=conversation_id,
            error="ACTION_RESULT_UNKNOWN",
        )
    )

    response = TestClient(main_module.app).post(
        f"/chat/conversations/{conversation_id}/archive",
        headers={"X-Demo-User-Id": IDENTITY},
    )

    assert response.status_code == 409
    assert response.json()["code"] == (
        "CONVERSATION_ACTION_RESULT_UNKNOWN"
    )
    assert not asyncio.run(
        store.is_archived(
            actor_id=IDENTITY,
            conversation_id=conversation_id,
        )
    )


def test_chat_rejects_an_archived_conversation(monkeypatch) -> None:
    store = PendingActionStore()
    monkeypatch.setattr(main_module, "pending_actions", store)
    conversation_id = uuid4()
    asyncio.run(
        store.archive_conversation(
            actor_id=IDENTITY,
            conversation_id=conversation_id,
        )
    )
    calls: list[str] = []

    async def fake_role(_identity: str, _settings) -> str:
        return "USER"

    async def fake_reply(*_args, **_kwargs) -> str:
        calls.append("reply")
        return "Respuesta"

    monkeypatch.setattr(main_module, "get_user_role", fake_role)
    monkeypatch.setattr(main_module, "generate_reply", fake_reply)

    response = TestClient(main_module.app).post(
        "/chat",
        json={
            "message": "Hola",
            "conversation_id": str(conversation_id),
        },
        headers={"X-Demo-User-Id": IDENTITY},
    )

    assert response.status_code == 409
    assert response.json()["code"] == "CONVERSATION_ARCHIVED"
    assert calls == []


def test_status_reports_unknown_result_without_exposing_tokens(monkeypatch) -> None:
    store = PendingActionStore()
    monkeypatch.setattr(main_module, "pending_actions", store)
    conversation_id = uuid4()
    action, _token = asyncio.run(
        store.create_action_with_token(
            actor_id=IDENTITY,
            conversation_id=conversation_id,
            action_type=PendingActionType.CREATE_LOST_PUBLICATION,
            payload={"title": "Mochila"},
        )
    )
    asyncio.run(
        store.claim_action(
            action.action_id,
            actor_id=IDENTITY,
            conversation_id=conversation_id,
        )
    )
    asyncio.run(
        store.fail_action(
            action.action_id,
            actor_id=IDENTITY,
            conversation_id=conversation_id,
            error="ACTION_RESULT_UNKNOWN",
        )
    )

    response = TestClient(main_module.app).get(
        f"/chat/actions/{action.action_id}",
        params={"conversation_id": str(conversation_id)},
        headers={"X-Demo-User-Id": IDENTITY},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "FAILED"
    assert response.json()["result_unknown"] is True
    assert "confirmation_token" not in response.json()
    assert "confirmation_token_hash" not in response.json()


def test_archive_endpoint_rejects_another_actor(monkeypatch) -> None:
    store = PendingActionStore()
    monkeypatch.setattr(main_module, "pending_actions", store)
    conversation_id = uuid4()
    asyncio.run(
        store.create_action_with_token(
            actor_id=IDENTITY,
            conversation_id=conversation_id,
            action_type=PendingActionType.CREATE_LOST_PUBLICATION,
            payload={"title": "Mochila"},
        )
    )

    response = TestClient(main_module.app).post(
        f"/chat/conversations/{conversation_id}/archive",
        headers={"X-Demo-User-Id": OTHER_IDENTITY},
    )

    assert response.status_code == 409
    assert response.json()["code"] == "CONVERSATION_ID_CONFLICT"


def test_confirm_requires_confirmation_token() -> None:
    response = TestClient(main_module.app).post(
        "/chat/confirm",
        json={
            "conversation_id": str(uuid4()),
            "action_id": str(uuid4()),
        },
        headers={"X-Demo-User-Id": IDENTITY},
    )

    assert response.status_code == 400
    assert response.json()["code"] == "VALIDATION_ERROR"


def test_chat_rejects_invalid_conversation_id(monkeypatch) -> None:
    response = TestClient(main_module.app).post(
        "/chat",
        json={"message": "Hola", "conversation_id": "not-a-uuid"},
        headers={"X-Demo-User-Id": IDENTITY},
    )

    assert response.status_code == 400
    assert response.json()["code"] == "VALIDATION_ERROR"


def test_chat_rejects_role_injection_in_body() -> None:
    response = TestClient(main_module.app).post(
        "/chat",
        json={"message": "Hola", "role": "ADMIN"},
        headers={"X-Demo-User-Id": IDENTITY},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "VALIDATION_ERROR"


def test_chat_rejects_more_than_ten_history_messages() -> None:
    response = TestClient(main_module.app).post(
        "/chat",
        json={
            "message": "Hola",
            "history": [
                {"role": "user", "content": "mensaje"}
                for _ in range(11)
            ],
        },
        headers={"X-Demo-User-Id": IDENTITY},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "VALIDATION_ERROR"


def test_prompts_are_role_specific_and_forbid_writes() -> None:
    user_prompt = build_system_prompt("USER")
    admin_prompt = build_system_prompt("ADMIN")

    assert "rol USER" in user_prompt
    assert "rol ADMIN" in admin_prompt
    assert "preparar" in user_prompt.lower()
    assert "confirmación" in user_prompt.lower()
    assert "Confirmar" in user_prompt
    assert "no ejecuta" in user_prompt.lower()
    assert "todavía no fue ejecutada" in user_prompt.lower()
    assert "No puedes cambiar" in user_prompt
    assert "No tiene acceso a la pantalla de moderación" in user_prompt
    assert "puede acceder a la moderación administrativa" in admin_prompt
    assert "publicaciones activas de otros usuarios" in admin_prompt.lower()


def test_prompt_distinguishes_app_and_assistant_capabilities() -> None:
    prompt = build_system_prompt("USER")
    normalized = " ".join(prompt.lower().split())

    assert "funcionalidades reales de la aplicación" in normalized
    assert "capacidades del asistente" in normalized
    assert "buscar publicaciones mediante texto libre" in normalized
    assert "12 elementos por página" in normalized
    assert "no existe un selector de tamaño de página" in normalized
    assert "relevancia únicamente está disponible cuando hay un término de búsqueda" in normalized
    assert "coincidencias sugeridas" in normalized
    assert "solicitar la recuperación" in normalized
    assert "el asistente no puede" in normalized
    assert "buscar publicaciones reales" in normalized
    assert "contactar al propietario" in normalized
    assert "marcar publicaciones como «interesado»" in normalized
    assert "aprobar, rechazar o cancelar solicitudes" in normalized
    assert "no tenés información suficiente" in normalized
    assert "explicar cómo buscar desde la aplicación no significa" in normalized
    assert "preparar" in normalized
    assert "confirmación explícita" in normalized
    assert "no ejecuta directamente" in normalized
    assert "no inventes botones, rutas, filtros, secciones, opciones" in normalized


def test_history_model_rejects_unknown_roles() -> None:
    try:
        ChatMessage(role="system", content="no permitido")
    except Exception:
        return
    raise AssertionError("system role should be rejected")
