from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=1000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=10)
    conversation_id: UUID | None = None


class PendingActionField(BaseModel):
    label: str
    value: str


class PendingActionPreview(BaseModel):
    action_id: UUID
    action_type: Literal[
        "CREATE_LOST_PUBLICATION",
        "CREATE_FOUND_PUBLICATION",
        "CREATE_RECOVERY_REQUEST",
    ]
    title: str
    fields: list[PendingActionField]
    expires_at: datetime
    status: Literal["PENDING"] = "PENDING"
    confirmation_token: str | None = None


class ChatResponse(BaseModel):
    reply: str
    role: Literal["USER", "ADMIN"]
    pending_action: PendingActionPreview | None = None


class ConfirmActionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    conversation_id: UUID
    action_id: UUID
    confirmation_token: str = Field(min_length=1, max_length=512)


class CancelActionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    conversation_id: UUID
    action_id: UUID


class ActionConfirmResponse(BaseModel):
    action_id: UUID
    action_type: Literal[
        "CREATE_LOST_PUBLICATION",
        "CREATE_FOUND_PUBLICATION",
        "CREATE_RECOVERY_REQUEST",
    ]
    status: Literal["COMPLETED"]
    result: dict[str, object] | None = None
    message: str


class ActionCancelResponse(BaseModel):
    action_id: UUID
    status: Literal["CANCELLED"]
    message: str


class ActionStatusResponse(BaseModel):
    action_id: UUID
    action_type: Literal[
        "CREATE_LOST_PUBLICATION",
        "CREATE_FOUND_PUBLICATION",
        "CREATE_RECOVERY_REQUEST",
    ]
    status: str
    created_at: datetime
    expires_at: datetime
    result: dict[str, object] | None = None
    error: str | None = None
    result_unknown: bool = False


class ArchiveConversationResponse(BaseModel):
    conversation_id: UUID
    archived: bool
    superseded: int
