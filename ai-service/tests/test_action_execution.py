from __future__ import annotations

import asyncio
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

import app.action_execution as execution
from app.action_execution import (
    ActionServiceError,
    cancel_action,
    confirm_action as execute_confirm_action,
)
from app.pending_actions import (
    PendingActionStatus,
    PendingActionStore,
    PendingActionType,
)

CONFIRMATION_TOKENS: dict = {}


async def confirm_action(
    store: PendingActionStore,
    *,
    actor_id: str,
    conversation_id,
    action_id,
    settings,
):
    return await execute_confirm_action(
        store,
        actor_id=actor_id,
        conversation_id=conversation_id,
        action_id=action_id,
        confirmation_token=CONFIRMATION_TOKENS[action_id],
        settings=settings,
    )


class FakeClock:
    def __init__(self) -> None:
        self.value = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)

    def __call__(self) -> datetime:
        return self.value

    def advance(self, seconds: int) -> None:
        self.value += timedelta(seconds=seconds)


def settings() -> SimpleNamespace:
    return SimpleNamespace(mcp_server_url="http://mcp.test")


async def make_action(
    store: PendingActionStore,
    *,
    action_type: PendingActionType = PendingActionType.CREATE_LOST_PUBLICATION,
    actor_id: str = "actor-1",
    conversation_id=None,
    payload: dict | None = None,
):
    action, token = await store.create_action_with_token(
        actor_id=actor_id,
        conversation_id=conversation_id or uuid4(),
        action_type=action_type,
        payload=payload
        or {
            "title": "Mochila negra",
            "description": "Mochila negra con una marca azul.",
            "category": "BAGS",
            "location": "Plaza Central",
            "eventDate": "2020-11-01",
        },
    )
    CONFIRMATION_TOKENS[action.action_id] = token
    return action


def successful_execute(calls: list[tuple[str, dict, str]]):
    async def fake(tool_name, arguments, identity, _settings):
        calls.append((tool_name, arguments, identity))
        return {"status": "completed", "data": {"id": "created-1"}}

    return fake


async def test_confirms_each_action_with_the_stored_payload(monkeypatch) -> None:
    for action_type, tool_name in (
        (PendingActionType.CREATE_LOST_PUBLICATION, "create_lost_publication"),
        (PendingActionType.CREATE_FOUND_PUBLICATION, "create_found_publication"),
        (PendingActionType.CREATE_RECOVERY_REQUEST, "create_recovery_request"),
    ):
        store = PendingActionStore()
        conversation_id = uuid4()
        payload = (
            {"publicationId": str(uuid4()), "notes": "Notas"}
            if action_type is PendingActionType.CREATE_RECOVERY_REQUEST
            else {
                "title": "Mochila negra",
                "description": "Mochila negra con una marca azul.",
                "category": "BAGS",
                "location": "Plaza Central",
                "eventDate": "2020-11-01",
            }
        )
        action = await make_action(
            store,
            action_type=action_type,
            conversation_id=conversation_id,
            payload=payload,
        )
        calls: list[tuple[str, dict, str]] = []
        monkeypatch.setattr(
            execution,
            "execute_write_tool",
            successful_execute(calls),
        )

        response = await confirm_action(
            store,
            actor_id="actor-1",
            conversation_id=conversation_id,
            action_id=action.action_id,
            settings=settings(),
        )

        assert response.status == "COMPLETED"
        assert response.result == {"id": "created-1"}
        assert calls == [(tool_name, payload, "actor-1")]


async def test_rejects_wrong_confirmation_token(monkeypatch) -> None:
    store = PendingActionStore()
    conversation_id = uuid4()
    action = await make_action(store, conversation_id=conversation_id)
    calls: list[tuple[str, dict, str]] = []
    monkeypatch.setattr(
        execution,
        "execute_write_tool",
        successful_execute(calls),
    )

    with pytest.raises(ActionServiceError) as invalid:
        await execute_confirm_action(
            store,
            actor_id="actor-1",
            conversation_id=conversation_id,
            action_id=action.action_id,
            confirmation_token="wrong-token",
            settings=settings(),
        )

    assert invalid.value.status_code == 403
    assert invalid.value.code == "ACTION_CONFIRMATION_INVALID"
    assert calls == []


async def test_archived_action_cannot_be_confirmed(monkeypatch) -> None:
    store = PendingActionStore()
    conversation_id = uuid4()
    action = await make_action(store, conversation_id=conversation_id)
    await store.archive_conversation(
        actor_id="actor-1",
        conversation_id=conversation_id,
    )
    calls: list[tuple[str, dict, str]] = []
    monkeypatch.setattr(
        execution,
        "execute_write_tool",
        successful_execute(calls),
    )

    with pytest.raises(ActionServiceError) as error:
        await confirm_action(
            store,
            actor_id="actor-1",
            conversation_id=conversation_id,
            action_id=action.action_id,
            settings=settings(),
        )

    assert error.value.code == "ACTION_NOT_PENDING"
    assert calls == []


async def test_rejects_wrong_actor_or_conversation(monkeypatch) -> None:
    store = PendingActionStore()
    conversation_id = uuid4()
    action = await make_action(store, conversation_id=conversation_id)
    calls: list[tuple[str, dict, str]] = []
    monkeypatch.setattr(
        execution,
        "execute_write_tool",
        successful_execute(calls),
    )

    with pytest.raises(ActionServiceError) as wrong_actor:
        await confirm_action(
            store,
            actor_id="actor-2",
            conversation_id=conversation_id,
            action_id=action.action_id,
            settings=settings(),
        )
    with pytest.raises(ActionServiceError) as wrong_conversation:
        await confirm_action(
            store,
            actor_id="actor-1",
            conversation_id=uuid4(),
            action_id=action.action_id,
            settings=settings(),
        )

    assert wrong_actor.value.status_code == 404
    assert wrong_conversation.value.status_code == 404
    assert calls == []


async def test_rejects_expired_and_superseded_actions(monkeypatch) -> None:
    clock = FakeClock()
    store = PendingActionStore(now=clock)
    conversation_id = uuid4()
    action = await make_action(store, conversation_id=conversation_id)
    calls: list[tuple[str, dict, str]] = []
    monkeypatch.setattr(
        execution,
        "execute_write_tool",
        successful_execute(calls),
    )

    clock.advance(301)
    with pytest.raises(ActionServiceError) as expired:
        await confirm_action(
            store,
            actor_id="actor-1",
            conversation_id=conversation_id,
            action_id=action.action_id,
            settings=settings(),
        )
    assert expired.value.status_code == 410
    assert expired.value.code == "ACTION_EXPIRED"

    store = PendingActionStore()
    conversation_id = uuid4()
    first = await make_action(store, conversation_id=conversation_id)
    await make_action(store, conversation_id=conversation_id)
    await store.supersede_pending(
        actor_id="actor-1",
        conversation_id=conversation_id,
    )

    with pytest.raises(ActionServiceError) as superseded:
        await confirm_action(
            store,
            actor_id="actor-1",
            conversation_id=conversation_id,
            action_id=first.action_id,
            settings=settings(),
        )
    assert superseded.value.status_code == 409
    assert calls == []


async def test_rejects_payload_hash_mismatch(monkeypatch) -> None:
    store = PendingActionStore()
    conversation_id = uuid4()
    action = await make_action(store, conversation_id=conversation_id)
    store._actions[action.action_id] = replace(  # type: ignore[attr-defined]
        action,
        payload_hash="0" * 64,
    )
    calls: list[tuple[str, dict, str]] = []
    monkeypatch.setattr(
        execution,
        "execute_write_tool",
        successful_execute(calls),
    )

    with pytest.raises(ActionServiceError) as invalid:
        await confirm_action(
            store,
            actor_id="actor-1",
            conversation_id=conversation_id,
            action_id=action.action_id,
            settings=settings(),
        )

    assert invalid.value.status_code == 409
    assert invalid.value.code == "ACTION_PAYLOAD_INVALID"
    assert calls == []


async def test_completed_confirmation_is_idempotent(monkeypatch) -> None:
    store = PendingActionStore()
    conversation_id = uuid4()
    action = await make_action(store, conversation_id=conversation_id)
    calls: list[tuple[str, dict, str]] = []
    monkeypatch.setattr(
        execution,
        "execute_write_tool",
        successful_execute(calls),
    )

    first = await confirm_action(
        store,
        actor_id="actor-1",
        conversation_id=conversation_id,
        action_id=action.action_id,
        settings=settings(),
    )
    second = await confirm_action(
        store,
        actor_id="actor-1",
        conversation_id=conversation_id,
        action_id=action.action_id,
        settings=settings(),
    )

    assert first.status == "COMPLETED"
    assert second.status == "COMPLETED"
    assert second.result == first.result
    assert len(calls) == 1


async def test_concurrent_confirmation_invokes_mcp_only_once(monkeypatch) -> None:
    store = PendingActionStore()
    conversation_id = uuid4()
    action = await make_action(store, conversation_id=conversation_id)
    calls: list[tuple[str, dict, str]] = []

    async def slow_execute(tool_name, arguments, identity, _settings):
        calls.append((tool_name, arguments, identity))
        await asyncio.sleep(0.05)
        return {"status": "completed", "data": {"id": "created-1"}}

    monkeypatch.setattr(execution, "execute_write_tool", slow_execute)

    results = await asyncio.gather(
        confirm_action(
            store,
            actor_id="actor-1",
            conversation_id=conversation_id,
            action_id=action.action_id,
            settings=settings(),
        ),
        confirm_action(
            store,
            actor_id="actor-1",
            conversation_id=conversation_id,
            action_id=action.action_id,
            settings=settings(),
        ),
        return_exceptions=True,
    )

    successes = [
        result for result in results if not isinstance(result, Exception)
    ]
    failures = [
        result for result in results if isinstance(result, Exception)
    ]
    assert len(successes) == 1
    assert len(failures) == 1
    assert isinstance(failures[0], ActionServiceError)
    assert len(calls) == 1


async def test_definitive_failure_and_unknown_result_are_terminal(monkeypatch) -> None:
    store = PendingActionStore()
    conversation_id = uuid4()
    action = await make_action(store, conversation_id=conversation_id)

    async def failed_execute(*_args):
        return {
            "status": "failed",
            "code": "PUBLICATION_NOT_FOUND",
            "message": "Publication not found",
        }

    monkeypatch.setattr(execution, "execute_write_tool", failed_execute)
    with pytest.raises(ActionServiceError) as failed:
        await confirm_action(
            store,
            actor_id="actor-1",
            conversation_id=conversation_id,
            action_id=action.action_id,
            settings=settings(),
        )
    assert failed.value.status_code == 502
    assert failed.value.code == "ACTION_EXECUTION_FAILED"
    stored = await store.get_action(
        action.action_id,
        actor_id="actor-1",
        conversation_id=conversation_id,
    )
    assert stored is not None
    assert stored.status is PendingActionStatus.FAILED

    store = PendingActionStore()
    conversation_id = uuid4()
    action = await make_action(store, conversation_id=conversation_id)

    async def unknown_execute(*_args):
        return {
            "status": "unknown",
            "code": "ACTION_RESULT_UNKNOWN",
            "message": "unknown",
        }

    monkeypatch.setattr(execution, "execute_write_tool", unknown_execute)
    with pytest.raises(ActionServiceError) as unknown:
        await confirm_action(
            store,
            actor_id="actor-1",
            conversation_id=conversation_id,
            action_id=action.action_id,
            settings=settings(),
        )
    assert unknown.value.status_code == 504
    assert unknown.value.code == "ACTION_RESULT_UNKNOWN"
    stored = await store.get_action(
        action.action_id,
        actor_id="actor-1",
        conversation_id=conversation_id,
    )
    assert stored is not None
    assert stored.status is PendingActionStatus.FAILED

    with pytest.raises(ActionServiceError) as retry:
        await confirm_action(
            store,
            actor_id="actor-1",
            conversation_id=conversation_id,
            action_id=action.action_id,
            settings=settings(),
        )
    assert retry.value.status_code == 409


async def test_mcp_unknown_exception_is_terminal(monkeypatch) -> None:
    store = PendingActionStore()
    conversation_id = uuid4()
    action = await make_action(store, conversation_id=conversation_id)

    async def broken_execute(*_args):
        from app.mcp_client import McpWriteUnknownError

        raise McpWriteUnknownError("connection lost")

    monkeypatch.setattr(execution, "execute_write_tool", broken_execute)

    with pytest.raises(ActionServiceError) as error:
        await confirm_action(
            store,
            actor_id="actor-1",
            conversation_id=conversation_id,
            action_id=action.action_id,
            settings=settings(),
        )

    assert error.value.status_code == 504
    assert error.value.code == "ACTION_RESULT_UNKNOWN"
    stored = await store.get_action(
        action.action_id,
        actor_id="actor-1",
        conversation_id=conversation_id,
    )
    assert stored is not None
    assert stored.status is PendingActionStatus.FAILED


async def test_cancel_pending_and_reject_non_cancellable(monkeypatch) -> None:
    store = PendingActionStore()
    conversation_id = uuid4()
    action = await make_action(store, conversation_id=conversation_id)
    calls: list[tuple[str, dict, str]] = []
    monkeypatch.setattr(
        execution,
        "execute_write_tool",
        successful_execute(calls),
    )

    cancelled = await cancel_action(
        store,
        actor_id="actor-1",
        conversation_id=conversation_id,
        action_id=action.action_id,
    )
    again = await cancel_action(
        store,
        actor_id="actor-1",
        conversation_id=conversation_id,
        action_id=action.action_id,
    )

    assert cancelled.status == "CANCELLED"
    assert again.status == "CANCELLED"
    assert calls == []

    store = PendingActionStore()
    conversation_id = uuid4()
    action = await make_action(store, conversation_id=conversation_id)
    await store.claim_action(
        action.action_id,
        actor_id="actor-1",
        conversation_id=conversation_id,
    )

    with pytest.raises(ActionServiceError) as error:
        await cancel_action(
            store,
            actor_id="actor-1",
            conversation_id=conversation_id,
            action_id=action.action_id,
        )
    assert error.value.status_code == 409
    assert error.value.code == "ACTION_NOT_CANCELLABLE"
