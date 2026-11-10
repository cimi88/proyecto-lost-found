import os
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv
from fastmcp import FastMCP
from fastmcp.server.dependencies import get_http_headers

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

NESTJS_API_URL = os.getenv(
    "NESTJS_API_URL", "http://localhost:3000/api/v1"
).rstrip("/")
MCP_HOST = os.getenv("MCP_HOST", "127.0.0.1")
MCP_PORT = int(os.getenv("MCP_PORT", "8001"))

mcp = FastMCP(
    "lostfound-assistant",
    instructions=(
        "Servidor MCP del asistente LostFound. Expone contexto de identidad "
        "y herramientas de escritura invocadas únicamente por FastAPI tras "
        "una confirmación explícita."
    ),
)


def _demo_identity() -> str:
    headers = get_http_headers(include={"x-demo-user-id"})
    identity = headers.get("x-demo-user-id")
    if not identity:
        raise ValueError("X-Demo-User-Id is required")
    return identity


def _sanitize_publication(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        key: payload[key]
        for key in (
            "id",
            "type",
            "status",
            "title",
            "description",
            "category",
            "location",
            "eventDate",
            "createdAt",
            "updatedAt",
        )
        if key in payload
    }


def _sanitize_recovery_request(payload: dict[str, Any]) -> dict[str, Any]:
    publication = payload.get("publication")
    return {
        "id": payload.get("id"),
        "status": payload.get("status"),
        "notes": payload.get("notes"),
        "cancellationReason": payload.get("cancellationReason"),
        "completedAt": payload.get("completedAt"),
        "returnNotes": payload.get("returnNotes"),
        "createdAt": payload.get("createdAt"),
        "updatedAt": payload.get("updatedAt"),
        "publication": (
            _sanitize_publication(publication)
            if isinstance(publication, dict)
            else None
        ),
        "requesterDisplayName": payload.get("requesterDisplayName"),
    }


async def _post_write(
    path: str,
    body: dict[str, Any],
    sanitizer,
) -> dict[str, Any]:
    identity = _demo_identity()

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                f"{NESTJS_API_URL}/{path.lstrip('/')}",
                headers={"X-Demo-User-Id": identity},
                json=body,
            )
    except httpx.HTTPError:
        return {
            "status": "unknown",
            "code": "ACTION_RESULT_UNKNOWN",
            "message": "The domain write result could not be determined.",
        }

    if response.status_code in (200, 201):
        try:
            payload = response.json()
        except ValueError:
            return {
                "status": "unknown",
                "code": "ACTION_RESULT_UNKNOWN",
                "message": "NestJS returned an invalid response.",
            }

        return {
            "status": "completed",
            "data": sanitizer(payload),
        }

    if response.status_code >= 500:
        return {
            "status": "unknown",
            "code": "ACTION_RESULT_UNKNOWN",
            "message": "NestJS returned an indeterminate server error.",
        }

    try:
        error_payload = response.json()
    except ValueError:
        error_payload = {}

    return {
        "status": "failed",
        "http_status": response.status_code,
        "code": error_payload.get("code", "ACTION_EXECUTION_FAILED"),
        "message": error_payload.get(
            "message",
            "NestJS rejected the operation.",
        ),
        "details": error_payload.get("details"),
    }


@mcp.tool
async def get_user_context() -> dict[str, str]:
    """Devuelve únicamente el rol del usuario autenticado."""
    headers = get_http_headers(include={"x-demo-user-id"})
    identity = headers.get("x-demo-user-id")
    if not identity:
        raise ValueError("X-Demo-User-Id is required")

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f"{NESTJS_API_URL}/assistant/context",
                headers={"X-Demo-User-Id": identity},
            )
    except httpx.HTTPError as error:
        raise ValueError("NestJS is unavailable") from error

    if response.status_code == 401:
        raise ValueError("Invalid demo identity")
    if response.status_code >= 400:
        raise ValueError("NestJS rejected the context request")

    payload = response.json()
    role = payload.get("role")
    if role not in {"USER", "ADMIN"}:
        raise ValueError("NestJS returned an invalid role")
    return {"role": role}


@mcp.tool
async def create_lost_publication(
    title: str,
    description: str,
    category: str,
    location: str,
    eventDate: str,
) -> dict[str, Any]:
    """Crea una publicación perdida; invocada solo tras confirmación."""
    return await _post_write(
        "lost-publications",
        {
            "title": title,
            "description": description,
            "category": category,
            "location": location,
            "eventDate": eventDate,
        },
        _sanitize_publication,
    )


@mcp.tool
async def create_found_publication(
    title: str,
    description: str,
    category: str,
    location: str,
    eventDate: str,
) -> dict[str, Any]:
    """Crea una publicación encontrada; invocada solo tras confirmación."""
    return await _post_write(
        "found-publications",
        {
            "title": title,
            "description": description,
            "category": category,
            "location": location,
            "eventDate": eventDate,
        },
        _sanitize_publication,
    )


@mcp.tool
async def create_recovery_request(
    publicationId: str,
    notes: str | None = None,
) -> dict[str, Any]:
    """Crea una solicitud de recuperación; invocada solo tras confirmación."""
    body: dict[str, Any] = {}
    if notes:
        body["notes"] = notes

    return await _post_write(
        f"publications/{publicationId}/recovery-requests",
        body,
        _sanitize_recovery_request,
    )


if __name__ == "__main__":
    mcp.run(
        transport="streamable-http",
        host=MCP_HOST,
        port=MCP_PORT,
        path="/mcp",
        show_banner=False,
    )
