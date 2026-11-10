"""Conversational action preparation for CU10.

The tools in this module create ephemeral PendingAction records only. They do
not call NestJS, MCP, or any domain write endpoint.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any
from uuid import UUID

from langchain_core.tools import tool

from .pending_actions import (
    PendingAction,
    PendingActionStore,
    PendingActionType,
    canonical_payload,
    hash_payload,
)
from .schemas import PendingActionField, PendingActionPreview

PUBLICATION_CATEGORIES = (
    "ELECTRONICS",
    "DOCUMENTS",
    "KEYS",
    "BAGS",
    "CLOTHING",
    "ACCESSORIES",
    "BOOKS",
    "SPORTS",
    "OTHER",
)

CATEGORY_LABELS = {
    "ELECTRONICS": "Electrónica",
    "DOCUMENTS": "Documentos",
    "KEYS": "Llaves",
    "BAGS": "Bolsos",
    "CLOTHING": "Ropa",
    "ACCESSORIES": "Accesorios",
    "BOOKS": "Libros",
    "SPORTS": "Deportes",
    "OTHER": "Otros",
}

ACTION_TITLES = {
    PendingActionType.CREATE_LOST_PUBLICATION: "Registrar objeto perdido",
    PendingActionType.CREATE_FOUND_PUBLICATION: "Registrar objeto encontrado",
    PendingActionType.CREATE_RECOVERY_REQUEST: "Solicitar recuperación",
}


def preview_from_action(
    action: PendingAction,
    confirmation_token: str | None = None,
) -> PendingActionPreview:
    payload = action.payload
    fields: list[PendingActionField] = []

    if action.action_type in (
        PendingActionType.CREATE_LOST_PUBLICATION,
        PendingActionType.CREATE_FOUND_PUBLICATION,
    ):
        fields = [
            PendingActionField(label="Título", value=str(payload["title"])),
            PendingActionField(
                label="Descripción",
                value=str(payload["description"]),
            ),
            PendingActionField(
                label="Categoría",
                value=CATEGORY_LABELS.get(
                    str(payload["category"]),
                    str(payload["category"]),
                ),
            ),
            PendingActionField(
                label="Ubicación",
                value=str(payload["location"]),
            ),
            PendingActionField(
                label="Fecha del evento",
                value=str(payload["eventDate"]),
            ),
        ]
    elif action.action_type is PendingActionType.CREATE_RECOVERY_REQUEST:
        fields = [
            PendingActionField(
                label="Publicación",
                value=str(payload["publicationId"]),
            ),
        ]
        if payload.get("notes"):
            fields.append(
                PendingActionField(
                    label="Notas",
                    value=str(payload["notes"]),
                )
            )

    return PendingActionPreview(
        action_id=action.action_id,
        action_type=action.action_type.value,
        title=ACTION_TITLES[action.action_type],
        fields=fields,
        expires_at=action.expires_at,
        status="PENDING",
        confirmation_token=confirmation_token,
    )


def _trimmed(value: str) -> str:
    return value.strip()


def _validate_publication_payload(
    *,
    title: str,
    description: str,
    category: str,
    location: str,
    eventDate: str,
) -> tuple[dict[str, Any], list[dict[str, str]]]:
    errors: list[dict[str, str]] = []
    normalized_title = _trimmed(title)
    normalized_description = _trimmed(description)
    normalized_category = category.strip().upper()
    normalized_location = _trimmed(location)
    normalized_event_date = eventDate.strip()

    if not 3 <= len(normalized_title) <= 120:
        errors.append(
            {
                "field": "title",
                "message": "El título debe tener entre 3 y 120 caracteres.",
            }
        )
    if not 10 <= len(normalized_description) <= 1000:
        errors.append(
            {
                "field": "description",
                "message": "La descripción debe tener entre 10 y 1000 caracteres.",
            }
        )
    if normalized_category not in PUBLICATION_CATEGORIES:
        errors.append(
            {
                "field": "category",
                "message": "La categoría no es válida.",
            }
        )
    if not 3 <= len(normalized_location) <= 120:
        errors.append(
            {
                "field": "location",
                "message": "La ubicación debe tener entre 3 y 120 caracteres.",
            }
        )

    try:
        parsed_date = date.fromisoformat(normalized_event_date)
    except ValueError:
        parsed_date = None
        errors.append(
            {
                "field": "eventDate",
                "message": "La fecha debe tener formato AAAA-MM-DD.",
            }
        )

    if (
        parsed_date is not None
        and parsed_date > datetime.now(timezone.utc).date()
    ):
        errors.append(
            {
                "field": "eventDate",
                "message": "La fecha del evento no puede ser futura.",
            }
        )

    if errors:
        return {}, errors

    return (
        {
            "title": normalized_title,
            "description": normalized_description,
            "category": normalized_category,
            "location": normalized_location,
            "eventDate": normalized_event_date,
        },
        [],
    )


@dataclass
class PreparationContext:
    store: PendingActionStore
    actor_id: str
    conversation_id: UUID
    pending_action: PendingAction | None = field(default=None)
    confirmation_token: str | None = field(default=None)

    async def prepare_publication(
        self,
        action_type: PendingActionType,
        *,
        title: str,
        description: str,
        category: str,
        location: str,
        eventDate: str,
    ) -> dict[str, Any]:
        payload, errors = _validate_publication_payload(
            title=title,
            description=description,
            category=category,
            location=location,
            eventDate=eventDate,
        )
        if errors:
            return {"status": "invalid", "errors": errors}

        return await self._create(action_type, payload)

    async def prepare_recovery(
        self,
        *,
        publicationId: str,
        notes: str | None = None,
    ) -> dict[str, Any]:
        errors: list[dict[str, str]] = []

        try:
            normalized_publication_id = str(UUID(publicationId.strip()))
        except (ValueError, AttributeError):
            normalized_publication_id = ""
            errors.append(
                {
                    "field": "publicationId",
                    "message": "La publicación debe ser un UUID válido.",
                }
            )

        normalized_notes = notes.strip() if isinstance(notes, str) else None
        if normalized_notes and len(normalized_notes) > 500:
            errors.append(
                {
                    "field": "notes",
                    "message": "Las notas no pueden superar 500 caracteres.",
                }
            )

        if errors:
            return {"status": "invalid", "errors": errors}

        payload: dict[str, Any] = {
            "publicationId": normalized_publication_id,
        }
        if normalized_notes:
            payload["notes"] = normalized_notes

        return await self._create(
            PendingActionType.CREATE_RECOVERY_REQUEST,
            payload,
        )

    async def _create(
        self,
        action_type: PendingActionType,
        payload: Mapping[str, Any],
    ) -> dict[str, Any]:
        canonical = canonical_payload(payload)
        idempotency_key = (
            f"{self.actor_id}:{self.conversation_id}:"
            f"{action_type.value}:{hash_payload(canonical)}"
        )

        await self.store.supersede_pending(
            actor_id=self.actor_id,
            conversation_id=self.conversation_id,
        )
        action, confirmation_token = (
            await self.store.create_action_with_token(
                actor_id=self.actor_id,
                conversation_id=self.conversation_id,
                action_type=action_type,
                payload=payload,
                idempotency_key=idempotency_key,
            )
        )
        self.pending_action = action
        self.confirmation_token = confirmation_token
        return {
            "status": "prepared",
            "preview": preview_from_action(action).model_dump(
                mode="json",
                exclude_none=True,
            ),
        }


def build_preparation_tools(
    *,
    store: PendingActionStore,
    actor_id: str,
    conversation_id: UUID,
) -> tuple[list[Any], PreparationContext]:
    context = PreparationContext(
        store=store,
        actor_id=actor_id,
        conversation_id=conversation_id,
    )

    @tool
    async def prepare_create_lost_publication(
        title: str,
        description: str,
        category: str,
        location: str,
        eventDate: str,
    ) -> str:
        """Prepara una publicación de objeto perdido sin ejecutarla."""
        return json.dumps(
            await context.prepare_publication(
                PendingActionType.CREATE_LOST_PUBLICATION,
                title=title,
                description=description,
                category=category,
                location=location,
                eventDate=eventDate,
            ),
            ensure_ascii=False,
        )

    @tool
    async def prepare_create_found_publication(
        title: str,
        description: str,
        category: str,
        location: str,
        eventDate: str,
    ) -> str:
        """Prepara una publicación de objeto encontrado sin ejecutarla."""
        return json.dumps(
            await context.prepare_publication(
                PendingActionType.CREATE_FOUND_PUBLICATION,
                title=title,
                description=description,
                category=category,
                location=location,
                eventDate=eventDate,
            ),
            ensure_ascii=False,
        )

    @tool
    async def prepare_create_recovery_request(
        publicationId: str,
        notes: str | None = None,
    ) -> str:
        """Prepara una solicitud de recuperación sin ejecutarla."""
        return json.dumps(
            await context.prepare_recovery(
                publicationId=publicationId,
                notes=notes,
            ),
            ensure_ascii=False,
        )

    return [
        prepare_create_lost_publication,
        prepare_create_found_publication,
        prepare_create_recovery_request,
    ], context
