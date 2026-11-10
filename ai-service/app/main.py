import uuid
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .action_execution import (
    ActionServiceError,
    action_status_response,
    cancel_action,
    confirm_action,
)
from .action_preparation import (
    build_preparation_tools,
    preview_from_action,
)
from .agent import generate_reply
from .config import get_settings
from .conversation_registry import (
    ConversationConflictError,
    ConversationRegistry,
)
from .mcp_client import (
    McpIdentityError,
    McpUnavailableError,
    get_user_role,
)
from .pending_actions import (
    ConversationArchiveConflictError,
    ConversationOwnershipError,
    PendingActionStore,
)
from .schemas import (
    ActionCancelResponse,
    ActionConfirmResponse,
    ActionStatusResponse,
    ArchiveConversationResponse,
    CancelActionRequest,
    ChatRequest,
    ChatResponse,
    ConfirmActionRequest,
)

settings = get_settings()
conversations = ConversationRegistry()
pending_actions = PendingActionStore()
app = FastAPI(title="LostFound Assistant")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Demo-User-Id"],
)


def api_error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"statusCode": status, "code": code, "message": message},
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(
    _request: Request, exception: HTTPException
) -> JSONResponse:
    detail = exception.detail
    if isinstance(detail, dict):
        return JSONResponse(
            status_code=exception.status_code,
            content={
                "statusCode": exception.status_code,
                "code": detail.get("code", "HTTP_ERROR"),
                "message": detail.get("message", "Request failed"),
            },
        )
    return api_error(exception.status_code, "HTTP_ERROR", str(detail))


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    _request: Request, _exception: RequestValidationError
) -> JSONResponse:
    return api_error(400, "VALIDATION_ERROR", "Invalid request data")


def require_demo_identity(header: str | None) -> str:
    if not header:
        raise HTTPException(
            status_code=401,
            detail={
                "code": "DEMO_IDENTITY_REQUIRED",
                "message": "X-Demo-User-Id header is required",
            },
        )

    try:
        uuid.UUID(header)
    except ValueError as error:
        raise HTTPException(
            status_code=401,
            detail={
                "code": "DEMO_IDENTITY_INVALID",
                "message": "X-Demo-User-Id is not a valid demo identity",
            },
        ) from error

    return header


async def bind_conversation(
    conversation_id,
    actor_id: str,
) -> None:
    try:
        await conversations.bind_or_validate(conversation_id, actor_id)
    except ConversationConflictError as error:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "CONVERSATION_ID_CONFLICT",
                "message": (
                    "The conversation_id is already associated "
                    "with another identity"
                ),
            },
        ) from error


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post(
    "/chat",
    response_model=ChatResponse,
    response_model_exclude_none=True,
)
async def chat(
    body: ChatRequest,
    x_demo_user_id: str | None = Header(default=None, alias="X-Demo-User-Id"),
) -> ChatResponse:
    if not x_demo_user_id:
        raise HTTPException(
            status_code=401,
            detail={
                "code": "DEMO_IDENTITY_REQUIRED",
                "message": "X-Demo-User-Id header is required",
            },
        )

    try:
        uuid.UUID(x_demo_user_id)
    except ValueError as error:
        raise HTTPException(
            status_code=401,
            detail={
                "code": "DEMO_IDENTITY_INVALID",
                "message": "X-Demo-User-Id is not a valid demo identity",
            },
        ) from error

    try:
        role = await get_user_role(x_demo_user_id, settings)
    except McpIdentityError as error:
        raise HTTPException(
            status_code=401,
            detail={
                "code": "DEMO_IDENTITY_INVALID",
                "message": "X-Demo-User-Id does not identify a user",
            },
        ) from error
    except McpUnavailableError as error:
        raise HTTPException(
            status_code=502,
            detail={
                "code": "ASSISTANT_UPSTREAM_ERROR",
                "message": "The assistant could not verify the role",
            },
        ) from error

    if settings.llm_provider == "groq" and not settings.groq_api_key:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "ASSISTANT_UNAVAILABLE",
                "message": "The selected LLM provider is not configured",
            },
        )

    if settings.llm_provider == "ollama" and not settings.ollama_api_key:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "ASSISTANT_UNAVAILABLE",
                "message": "The selected LLM provider is not configured",
            },
        )

    if body.conversation_id is not None:
        await bind_conversation(body.conversation_id, x_demo_user_id)
        if await pending_actions.is_archived(
            actor_id=x_demo_user_id,
            conversation_id=body.conversation_id,
        ):
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "CONVERSATION_ARCHIVED",
                    "message": (
                        "The conversation is archived and cannot accept "
                        "new actions"
                    ),
                },
            )

    preparation_tools: list[Any] = []
    preparation_context = None
    if body.conversation_id is not None:
        preparation_tools, preparation_context = build_preparation_tools(
            store=pending_actions,
            actor_id=x_demo_user_id,
            conversation_id=body.conversation_id,
        )

    try:
        reply = await generate_reply(
            role,
            body.message,
            body.history,
            settings,
            tools=preparation_tools,
        )
    except Exception as error:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "ASSISTANT_UNAVAILABLE",
                "message": "The assistant is temporarily unavailable",
            },
        ) from error

    pending_action = None
    if (
        preparation_context is not None
        and preparation_context.pending_action is not None
    ):
        pending_action = preview_from_action(
            preparation_context.pending_action,
            preparation_context.confirmation_token,
        )

    return ChatResponse(
        reply=reply,
        role=role,
        pending_action=pending_action,
    )


@app.get(
    "/chat/actions/{action_id}",
    response_model=ActionStatusResponse,
)
async def action_status(
    action_id: uuid.UUID,
    conversation_id: uuid.UUID,
    x_demo_user_id: str | None = Header(default=None, alias="X-Demo-User-Id"),
) -> ActionStatusResponse:
    actor_id = require_demo_identity(x_demo_user_id)
    await bind_conversation(conversation_id, actor_id)

    action = await pending_actions.get_action(
        action_id,
        actor_id=actor_id,
        conversation_id=conversation_id,
    )
    if action is None:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "ACTION_NOT_FOUND",
                "message": (
                    "The action does not exist for this identity and "
                    "conversation"
                ),
            },
        )

    return action_status_response(action)


@app.post(
    "/chat/conversations/{conversation_id}/archive",
    response_model=ArchiveConversationResponse,
)
async def archive_conversation(
    conversation_id: uuid.UUID,
    x_demo_user_id: str | None = Header(default=None, alias="X-Demo-User-Id"),
) -> ArchiveConversationResponse:
    actor_id = require_demo_identity(x_demo_user_id)
    await bind_conversation(conversation_id, actor_id)

    try:
        superseded = await pending_actions.archive_conversation(
            actor_id=actor_id,
            conversation_id=conversation_id,
        )
    except ConversationArchiveConflictError as error:
        if error.reason == "EXECUTING":
            code = "CONVERSATION_ACTION_IN_PROGRESS"
            message = (
                "The conversation cannot be archived while an action "
                "is executing"
            )
        else:
            code = "CONVERSATION_ACTION_RESULT_UNKNOWN"
            message = (
                "The conversation cannot be archived while an action "
                "has an unknown result"
            )
        raise HTTPException(
            status_code=409,
            detail={"code": code, "message": message},
        ) from error
    except ConversationOwnershipError as error:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "CONVERSATION_ID_CONFLICT",
                "message": "The conversation belongs to another identity",
            },
        ) from error

    return ArchiveConversationResponse(
        conversation_id=conversation_id,
        archived=True,
        superseded=superseded,
    )


@app.post(
    "/chat/confirm",
    response_model=ActionConfirmResponse,
)
async def confirm(
    body: ConfirmActionRequest,
    x_demo_user_id: str | None = Header(default=None, alias="X-Demo-User-Id"),
) -> ActionConfirmResponse:
    actor_id = require_demo_identity(x_demo_user_id)
    await bind_conversation(body.conversation_id, actor_id)

    try:
        return await confirm_action(
            pending_actions,
            actor_id=actor_id,
            conversation_id=body.conversation_id,
            action_id=body.action_id,
            confirmation_token=body.confirmation_token,
            settings=settings,
        )
    except ActionServiceError as error:
        raise HTTPException(
            status_code=error.status_code,
            detail={
                "code": error.code,
                "message": error.message,
            },
        ) from error


@app.post(
    "/chat/cancel",
    response_model=ActionCancelResponse,
)
async def cancel(
    body: CancelActionRequest,
    x_demo_user_id: str | None = Header(default=None, alias="X-Demo-User-Id"),
) -> ActionCancelResponse:
    actor_id = require_demo_identity(x_demo_user_id)
    await bind_conversation(body.conversation_id, actor_id)

    try:
        return await cancel_action(
            pending_actions,
            actor_id=actor_id,
            conversation_id=body.conversation_id,
            action_id=body.action_id,
        )
    except ActionServiceError as error:
        raise HTTPException(
            status_code=error.status_code,
            detail={
                "code": error.code,
                "message": error.message,
            },
        ) from error
