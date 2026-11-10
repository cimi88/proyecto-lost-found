from __future__ import annotations

import asyncio
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest

from app.pending_actions import (
    ConversationArchivedError,
    ConversationArchiveConflictError,
    ConversationOwnershipError,
    PendingActionStatus,
    PendingActionStore,
    PendingActionType,
)


class FakeClock:
    def __init__(self) -> None:
        self.value = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)

    def __call__(self) -> datetime:
        return self.value

    def advance(self, seconds: int) -> None:
        self.value += timedelta(seconds=seconds)


def make_store(
    clock: FakeClock | None = None,
) -> tuple[PendingActionStore, FakeClock]:
    clock = clock or FakeClock()
    return PendingActionStore(ttl_seconds=300, now=clock), clock


def payload() -> dict[str, object]:
    return {
        "title": "Mochila negra",
        "description": "Mochila negra con una marca azul.",
        "nested": {"category": "BAGS"},
    }


async def create_action(
    store: PendingActionStore,
    *,
    actor_id: str = "actor-1",
    conversation_id: UUID | None = None,
    action_type: PendingActionType = PendingActionType.CREATE_LOST_PUBLICATION,
    action_payload: dict[str, object] | None = None,
):
    return await store.create_action(
        actor_id=actor_id,
        conversation_id=conversation_id or uuid4(),
        action_type=action_type,
        payload=action_payload or payload(),
    )


async def test_create_action_has_canonical_payload_and_ttl() -> None:
    store, _clock = make_store()
    conversation_id = uuid4()

    action = await create_action(store, conversation_id=conversation_id)

    assert action.conversation_id == conversation_id
    assert action.actor_id == "actor-1"
    assert action.action_type is PendingActionType.CREATE_LOST_PUBLICATION
    assert action.status is PendingActionStatus.PENDING
    assert action.payload == payload()
    assert action.payload_hash
    assert action.verify_hash()
    assert action.expires_at - action.created_at == timedelta(minutes=5)
    assert action.idempotency_key == str(action.action_id)


async def test_confirmation_token_is_returned_but_only_its_hash_is_stored() -> None:
    store, _clock = make_store()
    action, token = await store.create_action_with_token(
        actor_id="actor-1",
        conversation_id=uuid4(),
        action_type=PendingActionType.CREATE_LOST_PUBLICATION,
        payload=payload(),
    )

    assert token
    assert action.verify_confirmation_token(token)
    assert not action.verify_confirmation_token("wrong-token")
    assert token not in action.confirmation_token_hash
    assert token not in repr(action)


async def test_archive_supersedes_pending_and_blocks_new_actions_and_claims() -> None:
    store, _clock = make_store()
    conversation_id = uuid4()
    action = await create_action(store, conversation_id=conversation_id)

    assert await store.archive_conversation(
        actor_id="actor-1",
        conversation_id=conversation_id,
    ) == 1

    archived = await store.get_action(
        action.action_id,
        actor_id="actor-1",
        conversation_id=conversation_id,
    )
    assert archived is not None
    assert archived.status is PendingActionStatus.SUPERSEDED
    assert (
        await store.claim_action(
            action.action_id,
            actor_id="actor-1",
            conversation_id=conversation_id,
        )
        is None
    )

    with pytest.raises(ConversationArchivedError):
        await store.create_action(
            actor_id="actor-1",
            conversation_id=conversation_id,
            action_type=PendingActionType.CREATE_LOST_PUBLICATION,
            payload=payload(),
        )

    assert await store.is_archived(
        actor_id="actor-1",
        conversation_id=conversation_id,
    )
    assert await store.archive_conversation(
        actor_id="actor-1",
        conversation_id=conversation_id,
    ) == 0


async def test_archive_rejects_another_actor() -> None:
    store, _clock = make_store()
    conversation_id = uuid4()
    await create_action(store, actor_id="actor-1", conversation_id=conversation_id)

    with pytest.raises(ConversationOwnershipError):
        await store.archive_conversation(
            actor_id="actor-2",
            conversation_id=conversation_id,
        )


async def test_executing_action_blocks_archive_without_partial_changes() -> None:
    store, _clock = make_store()
    conversation_id = uuid4()
    action = await create_action(store, conversation_id=conversation_id)
    pending = await create_action(store, conversation_id=conversation_id)

    claimed = await store.claim_action(
        action.action_id,
        actor_id="actor-1",
        conversation_id=conversation_id,
    )
    assert claimed is not None
    assert claimed.status is PendingActionStatus.EXECUTING

    with pytest.raises(ConversationArchiveConflictError) as error:
        await store.archive_conversation(
            actor_id="actor-1",
            conversation_id=conversation_id,
        )

    assert error.value.reason == "EXECUTING"
    assert not await store.is_archived(
        actor_id="actor-1",
        conversation_id=conversation_id,
    )

    current = await store.get_action(
        action.action_id,
        actor_id="actor-1",
        conversation_id=conversation_id,
    )
    pending_after = await store.get_action(
        pending.action_id,
        actor_id="actor-1",
        conversation_id=conversation_id,
    )
    assert current is not None
    assert current.status is PendingActionStatus.EXECUTING
    assert pending_after is not None
    assert pending_after.status is PendingActionStatus.PENDING

    completed = await store.complete_action(
        action.action_id,
        actor_id="actor-1",
        conversation_id=conversation_id,
        result={"id": "created"},
    )
    assert completed is not None
    assert completed.status is PendingActionStatus.COMPLETED


async def test_failed_unknown_result_blocks_archive_without_partial_changes() -> None:
    store, _clock = make_store()
    conversation_id = uuid4()
    action = await create_action(store, conversation_id=conversation_id)
    pending = await create_action(store, conversation_id=conversation_id)

    await store.claim_action(
        action.action_id,
        actor_id="actor-1",
        conversation_id=conversation_id,
    )
    await store.fail_action(
        action.action_id,
        actor_id="actor-1",
        conversation_id=conversation_id,
        error="ACTION_RESULT_UNKNOWN",
    )

    with pytest.raises(ConversationArchiveConflictError) as error:
        await store.archive_conversation(
            actor_id="actor-1",
            conversation_id=conversation_id,
        )

    assert error.value.reason == "ACTION_RESULT_UNKNOWN"
    assert not await store.is_archived(
        actor_id="actor-1",
        conversation_id=conversation_id,
    )

    failed = await store.get_action(
        action.action_id,
        actor_id="actor-1",
        conversation_id=conversation_id,
    )
    pending_after = await store.get_action(
        pending.action_id,
        actor_id="actor-1",
        conversation_id=conversation_id,
    )
    assert failed is not None
    assert failed.status is PendingActionStatus.FAILED
    assert failed.result_unknown is True
    assert pending_after is not None
    assert pending_after.status is PendingActionStatus.PENDING


async def test_retrieval_checks_actor_and_conversation() -> None:
    store, _clock = make_store()
    conversation_id = uuid4()
    action = await create_action(store, conversation_id=conversation_id)

    assert (
        await store.get_action(
            action.action_id,
            actor_id="actor-1",
            conversation_id=conversation_id,
        )
        == action
    )
    assert (
        await store.get_action(
            action.action_id,
            actor_id="actor-2",
            conversation_id=conversation_id,
        )
        is None
    )
    assert (
        await store.get_action(
            action.action_id,
            actor_id="actor-1",
            conversation_id=uuid4(),
        )
        is None
    )


async def test_payload_is_isolated_and_hash_can_be_verified() -> None:
    store, _clock = make_store()
    original = payload()
    action = await create_action(store, action_payload=original)

    original["title"] = "Mutado"
    original["nested"]["category"] = "OTHER"  # type: ignore[index]

    assert action.payload["title"] == "Mochila negra"
    assert action.payload["nested"] == {"category": "BAGS"}

    exposed = action.payload
    exposed["title"] = "Mutado desde fuera"

    stored = await store.get_action(
        action.action_id,
        actor_id="actor-1",
        conversation_id=action.conversation_id,
    )

    assert stored is not None
    assert stored.payload["title"] == "Mochila negra"
    assert stored.verify_hash()
    assert not replace(action, payload_hash="0" * 64).verify_hash()


async def test_expiration_and_expired_execution_are_blocked() -> None:
    store, clock = make_store()
    action = await create_action(store)
    clock.advance(301)

    expired = await store.get_action(
        action.action_id,
        actor_id="actor-1",
        conversation_id=action.conversation_id,
    )

    assert expired is not None
    assert expired.status is PendingActionStatus.EXPIRED
    assert (
        await store.is_expired(
            action.action_id,
            actor_id="actor-1",
            conversation_id=action.conversation_id,
        )
        is True
    )
    assert (
        await store.claim_action(
            action.action_id,
            actor_id="actor-1",
            conversation_id=action.conversation_id,
        )
        is None
    )
    assert (
        await store.cancel_action(
            action.action_id,
            actor_id="actor-1",
            conversation_id=action.conversation_id,
        )
        is None
    )


async def test_payload_hash_is_canonical_and_order_independent() -> None:
    store, _clock = make_store()
    first = await create_action(
        store,
        action_payload={"b": 2, "a": 1},
    )
    second = await create_action(
        store,
        action_payload={"a": 1, "b": 2},
    )

    assert first.payload_json == second.payload_json
    assert first.payload_hash == second.payload_hash


async def test_cleanup_marks_pending_actions_expired() -> None:
    store, clock = make_store()
    action = await create_action(store)
    clock.advance(301)

    assert await store.cleanup_expired() == 1
    result = await store.get_action(
        action.action_id,
        actor_id="actor-1",
        conversation_id=action.conversation_id,
    )

    assert result is not None
    assert result.status is PendingActionStatus.EXPIRED


async def test_valid_and_invalid_transitions() -> None:
    store, _clock = make_store()
    action = await create_action(store)
    key = {
        "actor_id": "actor-1",
        "conversation_id": action.conversation_id,
    }

    assert (
        await store.complete_action(
            action.action_id,
            result={"id": "x"},
            **key,
        )
        is None
    )
    assert await store.fail_action(action.action_id, error="no", **key) is None

    claimed = await store.claim_action(action.action_id, **key)
    assert claimed is not None
    assert claimed.status is PendingActionStatus.EXECUTING

    assert await store.claim_action(action.action_id, **key) is None
    assert await store.cancel_action(action.action_id, **key) is None

    completed = await store.complete_action(
        action.action_id,
        result={"createdId": "abc"},
        **key,
    )
    assert completed is not None
    assert completed.status is PendingActionStatus.COMPLETED
    assert completed.result == {"createdId": "abc"}

    assert await store.claim_action(action.action_id, **key) is None
    second = await store.complete_action(action.action_id, **key)
    assert second is not None
    assert second.status is PendingActionStatus.COMPLETED
    assert second.result == {"createdId": "abc"}


async def test_fail_action_and_terminal_claim_rejection() -> None:
    store, _clock = make_store()
    action = await create_action(store)
    key = {
        "actor_id": "actor-1",
        "conversation_id": action.conversation_id,
    }

    assert await store.claim_action(action.action_id, **key) is not None
    failed = await store.fail_action(
        action.action_id,
        error="NestJS unavailable",
        **key,
    )

    assert failed is not None
    assert failed.status is PendingActionStatus.FAILED
    assert failed.error == "NestJS unavailable"
    assert await store.claim_action(action.action_id, **key) is None


async def test_cancel_only_pending_action() -> None:
    store, _clock = make_store()
    action = await create_action(store)
    key = {
        "actor_id": "actor-1",
        "conversation_id": action.conversation_id,
    }

    cancelled = await store.cancel_action(action.action_id, **key)
    assert cancelled is not None
    assert cancelled.status is PendingActionStatus.CANCELLED
    assert await store.claim_action(action.action_id, **key) is None
    assert await store.cancel_action(action.action_id, **key) is None


async def test_supersede_only_pending_actions_from_same_conversation() -> None:
    store, _clock = make_store()
    conversation_id = uuid4()
    first = await create_action(store, conversation_id=conversation_id)
    second = await create_action(store, conversation_id=conversation_id)
    other = await create_action(store, conversation_id=uuid4())

    count = await store.supersede_pending(
        actor_id="actor-1",
        conversation_id=conversation_id,
    )

    assert count == 2
    first_after = await store.get_action(
        first.action_id,
        actor_id="actor-1",
        conversation_id=conversation_id,
    )
    second_after = await store.get_action(
        second.action_id,
        actor_id="actor-1",
        conversation_id=conversation_id,
    )
    other_after = await store.get_action(
        other.action_id,
        actor_id="actor-1",
        conversation_id=other.conversation_id,
    )

    assert first_after is not None
    assert first_after.status is PendingActionStatus.SUPERSEDED
    assert second_after is not None
    assert second_after.status is PendingActionStatus.SUPERSEDED
    assert other_after is not None
    assert other_after.status is PendingActionStatus.PENDING
    assert (
        await store.claim_action(
            first.action_id,
            actor_id="actor-1",
            conversation_id=conversation_id,
        )
        is None
    )


async def test_supersede_can_exclude_current_action() -> None:
    store, _clock = make_store()
    conversation_id = uuid4()
    first = await create_action(store, conversation_id=conversation_id)
    current = await create_action(store, conversation_id=conversation_id)

    count = await store.supersede_pending(
        actor_id="actor-1",
        conversation_id=conversation_id,
        exclude_action_id=current.action_id,
    )

    assert count == 1
    first_after = await store.get_action(
        first.action_id,
        actor_id="actor-1",
        conversation_id=conversation_id,
    )
    current_after = await store.get_action(
        current.action_id,
        actor_id="actor-1",
        conversation_id=conversation_id,
    )

    assert first_after is not None
    assert first_after.status is PendingActionStatus.SUPERSEDED
    assert current_after is not None
    assert current_after.status is PendingActionStatus.PENDING


async def test_concurrent_claims_have_only_one_winner() -> None:
    store, _clock = make_store()
    action = await create_action(store)
    key = {
        "actor_id": "actor-1",
        "conversation_id": action.conversation_id,
    }

    results = await asyncio.gather(
        store.claim_action(action.action_id, **key),
        store.claim_action(action.action_id, **key),
    )
    winners = [result for result in results if result is not None]

    assert len(winners) == 1
    assert winners[0].status is PendingActionStatus.EXECUTING


async def test_archive_and_claim_are_atomic() -> None:
    store, _clock = make_store()
    action = await create_action(store)
    key = {
        "actor_id": "actor-1",
        "conversation_id": action.conversation_id,
    }

    archive_result, claim_result = await asyncio.gather(
        store.archive_conversation(**key),
        store.claim_action(action.action_id, **key),
        return_exceptions=True,
    )

    current = await store.get_action(action.action_id, **key)
    assert current is not None

    if isinstance(archive_result, ConversationArchiveConflictError):
        assert archive_result.reason == "EXECUTING"
        assert claim_result is not None
        assert claim_result.status is PendingActionStatus.EXECUTING
        assert current.status is PendingActionStatus.EXECUTING
        assert not await store.is_archived(**key)
    else:
        assert archive_result == 1
        assert claim_result is None
        assert current.status is PendingActionStatus.SUPERSEDED
        assert await store.is_archived(**key)


async def test_isolation_between_actions_and_users() -> None:
    store, _clock = make_store()
    first = await create_action(
        store,
        actor_id="actor-1",
        conversation_id=uuid4(),
    )
    second = await create_action(
        store,
        actor_id="actor-2",
        conversation_id=uuid4(),
    )

    assert (
        await store.get_action(
            first.action_id,
            actor_id="actor-2",
            conversation_id=first.conversation_id,
        )
        is None
    )
    assert (
        await store.get_action(
            second.action_id,
            actor_id="actor-2",
            conversation_id=first.conversation_id,
        )
        is None
    )
    assert (
        await store.get_action(
            second.action_id,
            actor_id="actor-2",
            conversation_id=second.conversation_id,
        )
        == second
    )
