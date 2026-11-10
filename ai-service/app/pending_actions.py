"""In-memory pending actions for the future CU10 write flows.

This module is infrastructure only. It does not call MCP, NestJS, FastAPI,
Angular, or any domain service.
"""

from __future__ import annotations

import asyncio
import copy
import hashlib
import hmac
import json
import secrets
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any
from uuid import UUID, uuid4


class PendingActionType(str, Enum):
    CREATE_LOST_PUBLICATION = "CREATE_LOST_PUBLICATION"
    CREATE_FOUND_PUBLICATION = "CREATE_FOUND_PUBLICATION"
    CREATE_RECOVERY_REQUEST = "CREATE_RECOVERY_REQUEST"


class PendingActionStatus(str, Enum):
    PENDING = "PENDING"
    EXECUTING = "EXECUTING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"
    SUPERSEDED = "SUPERSEDED"


class ConversationArchivedError(Exception):
    """A conversation cannot accept new actions after archival."""


class ConversationArchiveConflictError(Exception):
    """An action blocks archival because its result must be preserved."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class ConversationOwnershipError(Exception):
    """A conversation belongs to another actor."""


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def hash_confirmation_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def canonical_payload(payload: Mapping[str, Any]) -> str:
    """Return a stable JSON representation used for hashing and execution."""
    if not isinstance(payload, Mapping):
        raise TypeError("payload must be a mapping")

    try:
        return json.dumps(
            payload,
            ensure_ascii=False,
            allow_nan=False,
            sort_keys=True,
            separators=(",", ":"),
        )
    except (TypeError, ValueError) as error:
        raise ValueError("payload must be JSON serializable") from error


def hash_payload(canonical_json: str) -> str:
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class PendingAction:
    action_id: UUID
    conversation_id: UUID
    actor_id: str
    action_type: PendingActionType
    payload_json: str = field(repr=False)
    payload_hash: str
    confirmation_token_hash: str = field(repr=False)
    status: PendingActionStatus
    created_at: datetime
    expires_at: datetime
    idempotency_key: str
    result: dict[str, Any] | None = None
    error: str | None = None

    @property
    def payload(self) -> dict[str, Any]:
        """Return a fresh copy; external mutations cannot affect the store."""
        return json.loads(self.payload_json)

    def verify_hash(self) -> bool:
        return self.payload_hash == hash_payload(
            canonical_payload(self.payload)
        )

    def verify_confirmation_token(self, token: str) -> bool:
        return hmac.compare_digest(
            self.confirmation_token_hash,
            hash_confirmation_token(token),
        )

    @property
    def result_unknown(self) -> bool:
        return (
            self.status is PendingActionStatus.FAILED
            and self.error == "ACTION_RESULT_UNKNOWN"
        )


class PendingActionStore:
    """Ephemeral, single-process store for actions awaiting confirmation."""

    def __init__(
        self,
        *,
        ttl_seconds: int = 300,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        if ttl_seconds <= 0:
            raise ValueError("ttl_seconds must be greater than zero")

        self._ttl_seconds = ttl_seconds
        self._now = now or _utc_now
        self._actions: dict[UUID, PendingAction] = {}
        self._owners: dict[UUID, str] = {}
        self._archived: set[UUID] = set()
        self._lock = asyncio.Lock()

    async def create_action(
        self,
        *,
        actor_id: str,
        conversation_id: UUID,
        action_type: PendingActionType,
        payload: Mapping[str, Any],
        idempotency_key: str | None = None,
    ) -> PendingAction:
        action, _token = await self.create_action_with_token(
            actor_id=actor_id,
            conversation_id=conversation_id,
            action_type=action_type,
            payload=payload,
            idempotency_key=idempotency_key,
        )
        return action

    async def create_action_with_token(
        self,
        *,
        actor_id: str,
        conversation_id: UUID,
        action_type: PendingActionType,
        payload: Mapping[str, Any],
        idempotency_key: str | None = None,
    ) -> tuple[PendingAction, str]:
        if not actor_id or not isinstance(actor_id, str):
            raise ValueError("actor_id must be a non-empty string")
        if not isinstance(conversation_id, UUID):
            raise TypeError("conversation_id must be a UUID")

        try:
            normalized_type = PendingActionType(action_type)
        except ValueError as error:
            raise ValueError("unsupported action type") from error

        canonical = canonical_payload(payload)

        async with self._lock:
            self._ensure_conversation_available(
                actor_id,
                conversation_id,
            )
            action_id = uuid4()
            confirmation_token = secrets.token_urlsafe(32)
            created_at = self._current_time()
            action = PendingAction(
                action_id=action_id,
                conversation_id=conversation_id,
                actor_id=actor_id,
                action_type=normalized_type,
                payload_json=canonical,
                payload_hash=hash_payload(canonical),
                confirmation_token_hash=hash_confirmation_token(
                    confirmation_token
                ),
                status=PendingActionStatus.PENDING,
                created_at=created_at,
                expires_at=created_at + timedelta(seconds=self._ttl_seconds),
                idempotency_key=idempotency_key or str(action_id),
            )
            self._actions[action_id] = action
            self._owners.setdefault(conversation_id, actor_id)
            return action, confirmation_token

    async def get_action(
        self,
        action_id: UUID,
        *,
        actor_id: str,
        conversation_id: UUID,
    ) -> PendingAction | None:
        async with self._lock:
            action = self._owned_action(
                action_id,
                actor_id=actor_id,
                conversation_id=conversation_id,
            )
            if action is None:
                return None

            action = self._expire_if_needed(action)
            self._actions[action_id] = action
            return action

    async def is_expired(
        self,
        action_id: UUID,
        *,
        actor_id: str,
        conversation_id: UUID,
    ) -> bool | None:
        action = await self.get_action(
            action_id,
            actor_id=actor_id,
            conversation_id=conversation_id,
        )
        if action is None:
            return None
        return action.status is PendingActionStatus.EXPIRED

    async def claim_action(
        self,
        action_id: UUID,
        *,
        actor_id: str,
        conversation_id: UUID,
    ) -> PendingAction | None:
        async with self._lock:
            if conversation_id in self._archived:
                return None

            action = self._owned_action(
                action_id,
                actor_id=actor_id,
                conversation_id=conversation_id,
            )
            if action is None:
                return None

            action = self._expire_if_needed(action)
            if action.status is not PendingActionStatus.PENDING:
                self._actions[action_id] = action
                return None

            claimed = replace(
                action,
                status=PendingActionStatus.EXECUTING,
                error=None,
            )
            self._actions[action_id] = claimed
            return claimed

    async def complete_action(
        self,
        action_id: UUID,
        *,
        actor_id: str,
        conversation_id: UUID,
        result: dict[str, Any] | None = None,
    ) -> PendingAction | None:
        async with self._lock:
            action = self._owned_action(
                action_id,
                actor_id=actor_id,
                conversation_id=conversation_id,
            )
            if action is None:
                return None

            if action.status is PendingActionStatus.COMPLETED:
                return action

            if action.status is not PendingActionStatus.EXECUTING:
                return None

            completed = replace(
                action,
                status=PendingActionStatus.COMPLETED,
                result=copy.deepcopy(result),
                error=None,
            )
            self._actions[action_id] = completed
            return completed

    async def fail_action(
        self,
        action_id: UUID,
        *,
        actor_id: str,
        conversation_id: UUID,
        error: str,
    ) -> PendingAction | None:
        async with self._lock:
            action = self._owned_action(
                action_id,
                actor_id=actor_id,
                conversation_id=conversation_id,
            )
            if action is None:
                return None

            if action.status is not PendingActionStatus.EXECUTING:
                return None

            failed = replace(
                action,
                status=PendingActionStatus.FAILED,
                error=error,
            )
            self._actions[action_id] = failed
            return failed

    async def cancel_action(
        self,
        action_id: UUID,
        *,
        actor_id: str,
        conversation_id: UUID,
    ) -> PendingAction | None:
        async with self._lock:
            action = self._owned_action(
                action_id,
                actor_id=actor_id,
                conversation_id=conversation_id,
            )
            if action is None:
                return None

            action = self._expire_if_needed(action)
            self._actions[action_id] = action

            if action.status is not PendingActionStatus.PENDING:
                return None

            cancelled = replace(
                action,
                status=PendingActionStatus.CANCELLED,
            )
            self._actions[action_id] = cancelled
            return cancelled

    async def supersede_pending(
        self,
        *,
        actor_id: str,
        conversation_id: UUID,
        exclude_action_id: UUID | None = None,
    ) -> int:
        async with self._lock:
            count = 0

            for action_id, action in list(self._actions.items()):
                if (
                    action.actor_id == actor_id
                    and action.conversation_id == conversation_id
                ):
                    action = self._expire_if_needed(action)
                    self._actions[action_id] = action

                    if (
                        action.status is PendingActionStatus.PENDING
                        and action_id != exclude_action_id
                    ):
                        self._actions[action_id] = replace(
                            action,
                            status=PendingActionStatus.SUPERSEDED,
                        )
                        count += 1

            return count

    async def archive_conversation(
        self,
        *,
        actor_id: str,
        conversation_id: UUID,
    ) -> int:
        if not isinstance(conversation_id, UUID):
            raise TypeError("conversation_id must be a UUID")

        async with self._lock:
            owner = self._owners.get(conversation_id)
            if owner is not None and owner != actor_id:
                raise ConversationOwnershipError(
                    "conversation belongs to another actor"
                )

            blocking_reason: str | None = None
            for action in self._actions.values():
                if (
                    action.actor_id != actor_id
                    or action.conversation_id != conversation_id
                ):
                    continue
                if action.status is PendingActionStatus.EXECUTING:
                    blocking_reason = "EXECUTING"
                    break
                if action.result_unknown:
                    blocking_reason = "ACTION_RESULT_UNKNOWN"

            if blocking_reason is not None:
                raise ConversationArchiveConflictError(blocking_reason)

            self._owners.setdefault(conversation_id, actor_id)
            self._archived.add(conversation_id)

            count = 0
            for action_id, action in list(self._actions.items()):
                if (
                    action.actor_id == actor_id
                    and action.conversation_id == conversation_id
                ):
                    action = self._expire_if_needed(action)
                    self._actions[action_id] = action

                    if action.status is PendingActionStatus.PENDING:
                        self._actions[action_id] = replace(
                            action,
                            status=PendingActionStatus.SUPERSEDED,
                        )
                        count += 1

            return count

    async def is_archived(
        self,
        *,
        actor_id: str,
        conversation_id: UUID,
    ) -> bool:
        async with self._lock:
            return conversation_id in self._archived

    async def cleanup_expired(self) -> int:
        async with self._lock:
            count = 0

            for action_id, action in list(self._actions.items()):
                expired = self._expire_if_needed(action)
                if expired is not action:
                    self._actions[action_id] = expired
                    count += 1

            return count

    def _current_time(self) -> datetime:
        value = self._now()

        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)

        return value.astimezone(timezone.utc)

    def _ensure_conversation_available(
        self,
        actor_id: str,
        conversation_id: UUID,
    ) -> None:
        if conversation_id in self._archived:
            raise ConversationArchivedError(
                "conversation is archived"
            )

        owner = self._owners.get(conversation_id)
        if owner is not None and owner != actor_id:
            raise ConversationOwnershipError(
                "conversation belongs to another actor"
            )

    def _owned_action(
        self,
        action_id: UUID,
        *,
        actor_id: str,
        conversation_id: UUID,
    ) -> PendingAction | None:
        action = self._actions.get(action_id)

        if action is None:
            return None

        if (
            action.actor_id != actor_id
            or action.conversation_id != conversation_id
        ):
            return None

        return action

    def _expire_if_needed(self, action: PendingAction) -> PendingAction:
        if (
            action.status is PendingActionStatus.PENDING
            and action.expires_at <= self._current_time()
        ):
            return replace(action, status=PendingActionStatus.EXPIRED)

        return action
