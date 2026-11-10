from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.conversation_registry import (
    ConversationConflictError,
    ConversationRegistry,
)


class FakeClock:
    def __init__(self) -> None:
        self.value = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)

    def __call__(self) -> datetime:
        return self.value

    def advance(self, seconds: int) -> None:
        self.value += timedelta(seconds=seconds)


def make_registry(
    clock: FakeClock | None = None,
) -> tuple[ConversationRegistry, FakeClock]:
    clock = clock or FakeClock()
    return ConversationRegistry(ttl_seconds=1800, now=clock), clock


async def test_new_conversation_is_bound_to_actor() -> None:
    registry, _clock = make_registry()
    conversation_id = uuid4()

    binding = await registry.bind_or_validate(conversation_id, "actor-1")

    assert binding.conversation_id == conversation_id
    assert binding.actor_id == "actor-1"
    assert binding.created_at == binding.last_seen_at


async def test_same_actor_can_reuse_conversation() -> None:
    registry, _clock = make_registry()
    conversation_id = uuid4()

    await registry.bind_or_validate(conversation_id, "actor-1")
    binding = await registry.bind_or_validate(conversation_id, "actor-1")

    assert binding.actor_id == "actor-1"


async def test_other_actor_is_rejected() -> None:
    registry, _clock = make_registry()
    conversation_id = uuid4()

    await registry.bind_or_validate(conversation_id, "actor-1")

    with pytest.raises(ConversationConflictError):
        await registry.bind_or_validate(conversation_id, "actor-2")


async def test_activity_renews_inactivity_ttl() -> None:
    registry, clock = make_registry()
    conversation_id = uuid4()

    first = await registry.bind_or_validate(conversation_id, "actor-1")
    clock.advance(20 * 60)
    renewed = await registry.bind_or_validate(conversation_id, "actor-1")

    assert renewed.created_at == first.created_at
    assert renewed.last_seen_at > first.last_seen_at

    clock.advance(20 * 60)
    still_valid = await registry.bind_or_validate(conversation_id, "actor-1")
    assert still_valid.actor_id == "actor-1"

    clock.advance(29 * 60)
    with pytest.raises(ConversationConflictError):
        await registry.bind_or_validate(conversation_id, "actor-2")


async def test_expired_conversation_can_be_rebound() -> None:
    registry, clock = make_registry()
    conversation_id = uuid4()

    await registry.bind_or_validate(conversation_id, "actor-1")
    clock.advance(30 * 60 + 1)

    binding = await registry.bind_or_validate(conversation_id, "actor-2")

    assert binding.actor_id == "actor-2"


async def test_cleanup_expired_removes_only_expired_bindings() -> None:
    registry, clock = make_registry()
    old_id = uuid4()
    fresh_id = uuid4()

    await registry.bind_or_validate(old_id, "actor-1")
    clock.advance(20 * 60)
    await registry.bind_or_validate(fresh_id, "actor-1")
    clock.advance(11 * 60)

    assert await registry.cleanup_expired() == 1

    with pytest.raises(ConversationConflictError):
        await registry.bind_or_validate(fresh_id, "actor-2")


async def test_two_conversations_are_isolated() -> None:
    registry, _clock = make_registry()
    first_id = uuid4()
    second_id = uuid4()

    await registry.bind_or_validate(first_id, "actor-1")
    await registry.bind_or_validate(second_id, "actor-2")

    with pytest.raises(ConversationConflictError):
        await registry.bind_or_validate(first_id, "actor-2")
    with pytest.raises(ConversationConflictError):
        await registry.bind_or_validate(second_id, "actor-1")


async def test_new_registry_does_not_retain_bindings() -> None:
    first_registry, _clock = make_registry()
    conversation_id = uuid4()
    await first_registry.bind_or_validate(conversation_id, "actor-1")

    second_registry, _clock = make_registry()
    binding = await second_registry.bind_or_validate(conversation_id, "actor-2")

    assert binding.actor_id == "actor-2"
