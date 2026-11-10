from __future__ import annotations

import json
from uuid import uuid4

from app.action_preparation import (
    build_preparation_tools,
    preview_from_action,
)
from app.pending_actions import (
    PendingActionStatus,
    PendingActionStore,
    PendingActionType,
)


def make_store() -> PendingActionStore:
    return PendingActionStore(ttl_seconds=300)


def publication_payload() -> dict[str, str]:
    return {
        "title": "  Mochila negra  ",
        "description": "  Mochila negra con una marca azul.  ",
        "category": "bags",
        "location": "  Plaza Central  ",
        "eventDate": "2020-11-01",
    }


async def test_preparation_tools_are_the_three_allowed_tools() -> None:
    store = make_store()
    tools, _context = build_preparation_tools(
        store=store,
        actor_id="actor-1",
        conversation_id=uuid4(),
    )

    assert [tool.name for tool in tools] == [
        "prepare_create_lost_publication",
        "prepare_create_found_publication",
        "prepare_create_recovery_request",
    ]


async def test_prepares_lost_publication_with_canonical_payload() -> None:
    store = make_store()
    conversation_id = uuid4()
    tools, context = build_preparation_tools(
        store=store,
        actor_id="actor-1",
        conversation_id=conversation_id,
    )

    result = json.loads(
        await tools[0].ainvoke(publication_payload())
    )

    assert result["status"] == "prepared"
    assert context.pending_action is not None
    assert context.confirmation_token is not None
    assert "confirmation_token" not in result["preview"]
    action = context.pending_action
    assert action.action_type is PendingActionType.CREATE_LOST_PUBLICATION
    assert action.actor_id == "actor-1"
    assert action.conversation_id == conversation_id
    assert action.payload == {
        "title": "Mochila negra",
        "description": "Mochila negra con una marca azul.",
        "category": "BAGS",
        "location": "Plaza Central",
        "eventDate": "2020-11-01",
    }
    assert "ownerId" not in action.payload
    assert "status" not in action.payload
    assert action.verify_hash()

    preview = result["preview"]
    assert preview["action_id"] == str(action.action_id)
    assert preview["title"] == "Registrar objeto perdido"
    assert preview["status"] == "PENDING"
    assert any(field["label"] == "Categoría" for field in preview["fields"])


async def test_prepares_found_publication() -> None:
    store = make_store()
    tools, context = build_preparation_tools(
        store=store,
        actor_id="actor-1",
        conversation_id=uuid4(),
    )

    result = json.loads(
        await tools[1].ainvoke(publication_payload())
    )

    assert result["status"] == "prepared"
    assert context.pending_action is not None
    assert (
        context.pending_action.action_type
        is PendingActionType.CREATE_FOUND_PUBLICATION
    )


async def test_missing_publication_fields_do_not_create_action() -> None:
    store = make_store()
    _tools, context = build_preparation_tools(
        store=store,
        actor_id="actor-1",
        conversation_id=uuid4(),
    )

    result = await context.prepare_publication(
        PendingActionType.CREATE_LOST_PUBLICATION,
        title="",
        description="",
        category="",
        location="",
        eventDate="",
    )

    assert result["status"] == "invalid"
    assert len(result["errors"]) == 5
    assert context.pending_action is None


async def test_invalid_publication_does_not_create_action() -> None:
    store = make_store()
    tools, context = build_preparation_tools(
        store=store,
        actor_id="actor-1",
        conversation_id=uuid4(),
    )

    result = json.loads(
        await tools[0].ainvoke(
            {
                **publication_payload(),
                "title": "x",
                "category": "INVALID",
                "eventDate": "2999-01-01",
            }
        )
    )

    assert result["status"] == "invalid"
    assert context.pending_action is None
    assert {error["field"] for error in result["errors"]} == {
        "title",
        "category",
        "eventDate",
    }


async def test_prepares_recovery_with_explicit_uuid() -> None:
    store = make_store()
    publication_id = uuid4()
    tools, context = build_preparation_tools(
        store=store,
        actor_id="actor-1",
        conversation_id=uuid4(),
    )

    result = json.loads(
        await tools[2].ainvoke(
            {
                "publicationId": str(publication_id),
                "notes": "  Lo retiro mañana.  ",
            }
        )
    )

    assert result["status"] == "prepared"
    assert context.pending_action is not None
    assert (
        context.pending_action.action_type
        is PendingActionType.CREATE_RECOVERY_REQUEST
    )
    assert context.pending_action.payload == {
        "publicationId": str(publication_id),
        "notes": "Lo retiro mañana.",
    }
    assert result["preview"]["title"] == "Solicitar recuperación"


async def test_recovery_without_valid_uuid_does_not_create_action() -> None:
    store = make_store()
    tools, context = build_preparation_tools(
        store=store,
        actor_id="actor-1",
        conversation_id=uuid4(),
    )

    result = json.loads(
        await tools[2].ainvoke({"publicationId": "not-a-uuid"})
    )

    assert result["status"] == "invalid"
    assert result["errors"][0]["field"] == "publicationId"
    assert context.pending_action is None


async def test_new_preparation_supersedes_previous_pending_action() -> None:
    store = make_store()
    conversation_id = uuid4()
    tools, context = build_preparation_tools(
        store=store,
        actor_id="actor-1",
        conversation_id=conversation_id,
    )

    await tools[0].ainvoke(publication_payload())
    first = context.pending_action
    assert first is not None

    await tools[1].ainvoke(
        {
            **publication_payload(),
            "title": "Llaves encontradas",
        }
    )
    second = context.pending_action
    assert second is not None

    stored_first = await store.get_action(
        first.action_id,
        actor_id="actor-1",
        conversation_id=conversation_id,
    )
    stored_second = await store.get_action(
        second.action_id,
        actor_id="actor-1",
        conversation_id=conversation_id,
    )

    assert stored_first is not None
    assert stored_first.status is PendingActionStatus.SUPERSEDED
    assert stored_second is not None
    assert stored_second.status is PendingActionStatus.PENDING


async def test_previews_do_not_expose_actor_or_hash() -> None:
    store = make_store()
    tools, context = build_preparation_tools(
        store=store,
        actor_id="actor-secret",
        conversation_id=uuid4(),
    )

    await tools[0].ainvoke(publication_payload())
    assert context.pending_action is not None
    preview = preview_from_action(context.pending_action).model_dump(
        mode="json"
    )

    serialized = json.dumps(preview)
    assert "actor-secret" not in serialized
    assert "payload_hash" not in serialized
    assert "actor_id" not in serialized


async def test_contexts_are_isolated_by_actor_and_conversation() -> None:
    store = make_store()
    first_tools, first_context = build_preparation_tools(
        store=store,
        actor_id="actor-1",
        conversation_id=uuid4(),
    )
    second_tools, second_context = build_preparation_tools(
        store=store,
        actor_id="actor-2",
        conversation_id=uuid4(),
    )

    await first_tools[0].ainvoke(publication_payload())
    await second_tools[0].ainvoke(publication_payload())

    assert first_context.pending_action is not None
    assert second_context.pending_action is not None
    assert first_context.pending_action.actor_id == "actor-1"
    assert second_context.pending_action.actor_id == "actor-2"
    assert (
        first_context.pending_action.action_id
        != second_context.pending_action.action_id
    )
