"""Confirmation and cancellation for prepared CU10 actions."""

from __future__ import annotations

from dataclasses import dataclass

from .config import Settings
from .mcp_client import (
    McpIdentityError,
    McpUnavailableError,
    McpWriteUnknownError,
    execute_write_tool,
)
from .pending_actions import (
    PendingAction,
    PendingActionStatus,
    PendingActionStore,
    PendingActionType,
)
from .schemas import (
    ActionCancelResponse,
    ActionConfirmResponse,
    ActionStatusResponse,
)


class ActionServiceError(Exception):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


WRITE_TOOLS = {
    PendingActionType.CREATE_LOST_PUBLICATION: "create_lost_publication",
    PendingActionType.CREATE_FOUND_PUBLICATION: "create_found_publication",
    PendingActionType.CREATE_RECOVERY_REQUEST: "create_recovery_request",
}


@dataclass(frozen=True)
class ConfirmationOutcome:
    response: ActionConfirmResponse


def _not_pending_error(action: PendingAction) -> ActionServiceError:
    if action.status is PendingActionStatus.EXECUTING:
        return ActionServiceError(
            409,
            "ACTION_ALREADY_EXECUTING",
            "La acción ya se está ejecutando.",
        )
    if action.status is PendingActionStatus.EXPIRED:
        return ActionServiceError(
            410,
            "ACTION_EXPIRED",
            "La acción venció y no puede ejecutarse.",
        )
    return ActionServiceError(
        409,
        "ACTION_NOT_PENDING",
        "La acción ya no está pendiente.",
    )


def action_status_response(
    action: PendingAction,
) -> ActionStatusResponse:
    return ActionStatusResponse(
        action_id=action.action_id,
        action_type=action.action_type.value,
        status=action.status.value,
        created_at=action.created_at,
        expires_at=action.expires_at,
        result=action.result,
        error=action.error,
        result_unknown=action.error == "ACTION_RESULT_UNKNOWN",
    )


async def confirm_action(
    store: PendingActionStore,
    *,
    actor_id: str,
    conversation_id,
    action_id,
    confirmation_token: str,
    settings: Settings,
) -> ActionConfirmResponse:
    action = await store.get_action(
        action_id,
        actor_id=actor_id,
        conversation_id=conversation_id,
    )
    if action is None:
        raise ActionServiceError(
            404,
            "ACTION_NOT_FOUND",
            "La acción no existe para esta identidad y conversación.",
        )

    if not action.verify_confirmation_token(confirmation_token):
        raise ActionServiceError(
            403,
            "ACTION_CONFIRMATION_INVALID",
            "La capacidad de confirmación no es válida.",
        )

    if action.status is PendingActionStatus.COMPLETED:
        return ActionConfirmResponse(
            action_id=action.action_id,
            action_type=action.action_type.value,
            status="COMPLETED",
            result=action.result,
            message="La acción ya fue completada.",
        )

    if action.status is not PendingActionStatus.PENDING:
        raise _not_pending_error(action)

    if not action.verify_hash():
        raise ActionServiceError(
            409,
            "ACTION_PAYLOAD_INVALID",
            "La integridad de la acción no es válida.",
        )

    claimed = await store.claim_action(
        action_id,
        actor_id=actor_id,
        conversation_id=conversation_id,
    )
    if claimed is None:
        current = await store.get_action(
            action_id,
            actor_id=actor_id,
            conversation_id=conversation_id,
        )
        if current is None:
            raise ActionServiceError(
                404,
                "ACTION_NOT_FOUND",
                "La acción no existe para esta identidad y conversación.",
            )
        if current.status is PendingActionStatus.COMPLETED:
            return ActionConfirmResponse(
                action_id=current.action_id,
                action_type=current.action_type.value,
                status="COMPLETED",
                result=current.result,
                message="La acción ya fue completada.",
            )
        raise _not_pending_error(current)

    tool_name = WRITE_TOOLS.get(claimed.action_type)
    if tool_name is None:
        await store.fail_action(
            action_id,
            actor_id=actor_id,
            conversation_id=conversation_id,
            error="ACTION_EXECUTION_FAILED",
        )
        raise ActionServiceError(
            502,
            "ACTION_EXECUTION_FAILED",
            "No hay una operación de escritura asociada.",
        )

    try:
        result = await execute_write_tool(
            tool_name,
            claimed.payload,
            actor_id,
            settings,
        )
    except McpWriteUnknownError:
        await store.fail_action(
            action_id,
            actor_id=actor_id,
            conversation_id=conversation_id,
            error="ACTION_RESULT_UNKNOWN",
        )
        raise ActionServiceError(
            504,
            "ACTION_RESULT_UNKNOWN",
            "No se pudo determinar el resultado. Verificá la operación "
            "antes de intentar otra.",
        )
    except McpIdentityError:
        await store.fail_action(
            action_id,
            actor_id=actor_id,
            conversation_id=conversation_id,
            error="ACTION_EXECUTION_FAILED",
        )
        raise ActionServiceError(
            401,
            "DEMO_IDENTITY_INVALID",
            "La identidad demo no es válida.",
        )
    except McpUnavailableError:
        await store.fail_action(
            action_id,
            actor_id=actor_id,
            conversation_id=conversation_id,
            error="ACTION_EXECUTION_FAILED",
        )
        raise ActionServiceError(
            502,
            "ACTION_EXECUTION_FAILED",
            "La operación de escritura no está disponible.",
        )

    status = result.get("status")
    if status == "completed":
        data = result.get("data")
        if not isinstance(data, dict):
            await store.fail_action(
                action_id,
                actor_id=actor_id,
                conversation_id=conversation_id,
                error="ACTION_RESULT_UNKNOWN",
            )
            raise ActionServiceError(
                504,
                "ACTION_RESULT_UNKNOWN",
                "No se pudo interpretar la respuesta del dominio.",
            )

        completed = await store.complete_action(
            action_id,
            actor_id=actor_id,
            conversation_id=conversation_id,
            result=data,
        )
        if completed is None:
            raise ActionServiceError(
                504,
                "ACTION_RESULT_UNKNOWN",
                "No se pudo registrar el resultado de la acción.",
            )

        return ActionConfirmResponse(
            action_id=completed.action_id,
            action_type=completed.action_type.value,
            status="COMPLETED",
            result=completed.result,
            message="La operación se completó correctamente.",
        )

    if status == "failed":
        message = str(result.get("message") or "NestJS rechazó la operación.")
        await store.fail_action(
            action_id,
            actor_id=actor_id,
            conversation_id=conversation_id,
            error=message,
        )
        raise ActionServiceError(
            502,
            "ACTION_EXECUTION_FAILED",
            message,
        )

    await store.fail_action(
        action_id,
        actor_id=actor_id,
        conversation_id=conversation_id,
        error="ACTION_RESULT_UNKNOWN",
    )
    raise ActionServiceError(
        504,
        "ACTION_RESULT_UNKNOWN",
        "No se pudo determinar el resultado. Verificá la operación "
        "antes de intentar otra.",
    )


async def cancel_action(
    store: PendingActionStore,
    *,
    actor_id: str,
    conversation_id,
    action_id,
) -> ActionCancelResponse:
    action = await store.get_action(
        action_id,
        actor_id=actor_id,
        conversation_id=conversation_id,
    )
    if action is None:
        raise ActionServiceError(
            404,
            "ACTION_NOT_FOUND",
            "La acción no existe para esta identidad y conversación.",
        )

    if action.status is PendingActionStatus.CANCELLED:
        return ActionCancelResponse(
            action_id=action.action_id,
            status="CANCELLED",
            message="La acción ya estaba cancelada.",
        )

    if action.status is PendingActionStatus.EXPIRED:
        raise ActionServiceError(
            410,
            "ACTION_EXPIRED",
            "La acción venció y no puede cancelarse.",
        )

    if action.status is not PendingActionStatus.PENDING:
        raise ActionServiceError(
            409,
            "ACTION_NOT_CANCELLABLE",
            "Solo se pueden cancelar acciones pendientes.",
        )

    cancelled = await store.cancel_action(
        action_id,
        actor_id=actor_id,
        conversation_id=conversation_id,
    )
    if cancelled is None:
        raise ActionServiceError(
            409,
            "ACTION_NOT_CANCELLABLE",
            "La acción cambió de estado y no puede cancelarse.",
        )

    return ActionCancelResponse(
        action_id=cancelled.action_id,
        status="CANCELLED",
        message="La acción fue cancelada.",
    )
