"""Ephemeral ownership registry for assistant conversations."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone
from uuid import UUID


class ConversationConflictError(Exception):
    """A conversation ID is already owned by another actor."""


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class ConversationBinding:
    conversation_id: UUID
    actor_id: str
    created_at: datetime
    last_seen_at: datetime


class ConversationRegistry:
    """In-memory conversation ownership with inactivity TTL."""

    def __init__(
        self,
        *,
        ttl_seconds: int = 1800,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        if ttl_seconds <= 0:
            raise ValueError("ttl_seconds must be greater than zero")

        self._ttl_seconds = ttl_seconds
        self._now = now or _utc_now
        self._bindings: dict[UUID, ConversationBinding] = {}
        self._lock = asyncio.Lock()

    async def bind_or_validate(
        self,
        conversation_id: UUID,
        actor_id: str,
    ) -> ConversationBinding:
        if not isinstance(conversation_id, UUID):
            raise TypeError("conversation_id must be a UUID")
        if not actor_id or not isinstance(actor_id, str):
            raise ValueError("actor_id must be a non-empty string")

        async with self._lock:
            now = self._current_time()
            binding = self._bindings.get(conversation_id)

            if binding is not None and self._is_expired(binding, now):
                del self._bindings[conversation_id]
                binding = None

            if binding is None:
                binding = ConversationBinding(
                    conversation_id=conversation_id,
                    actor_id=actor_id,
                    created_at=now,
                    last_seen_at=now,
                )
                self._bindings[conversation_id] = binding
                return binding

            if binding.actor_id != actor_id:
                raise ConversationConflictError(
                    "conversation_id is owned by another actor"
                )

            renewed = replace(binding, last_seen_at=now)
            self._bindings[conversation_id] = renewed
            return renewed

    async def cleanup_expired(self) -> int:
        async with self._lock:
            now = self._current_time()
            expired_ids = [
                conversation_id
                for conversation_id, binding in self._bindings.items()
                if self._is_expired(binding, now)
            ]

            for conversation_id in expired_ids:
                del self._bindings[conversation_id]

            return len(expired_ids)

    def _current_time(self) -> datetime:
        value = self._now()

        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)

        return value.astimezone(timezone.utc)

    def _is_expired(
        self,
        binding: ConversationBinding,
        now: datetime,
    ) -> bool:
        return binding.last_seen_at + timedelta(
            seconds=self._ttl_seconds
        ) <= now
