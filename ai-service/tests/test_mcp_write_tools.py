import httpx
import pytest

import mcp_server.server as server
from mcp_server.server import (
    _sanitize_publication,
    _sanitize_recovery_request,
)


def test_publication_sanitizer_removes_owner_and_internal_fields() -> None:
    result = _sanitize_publication(
        {
            "id": "p-1",
            "type": "LOST",
            "status": "ACTIVE",
            "ownerId": "owner-secret",
            "title": "Mochila",
            "description": "Mochila negra",
            "category": "BAGS",
            "location": "Plaza",
            "eventDate": "2020-11-01",
            "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-01T00:00:00Z",
        }
    )

    assert "ownerId" not in result
    assert result["id"] == "p-1"
    assert result["title"] == "Mochila"


def test_recovery_sanitizer_removes_internal_identifiers() -> None:
    result = _sanitize_recovery_request(
        {
            "id": "r-1",
            "status": "PENDING",
            "notes": "Notas",
            "cancellationReason": None,
            "completedAt": None,
            "returnNotes": None,
            "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-01T00:00:00Z",
            "ownerId": "owner-secret",
            "requesterId": "requester-secret",
            "cancelledById": "admin-secret",
            "publication": {
                "id": "p-1",
                "title": "Mochila",
                "ownerId": "owner-secret",
            },
            "requesterDisplayName": "Solicitante",
        }
    )

    assert "ownerId" not in result
    assert "requesterId" not in result
    assert "cancelledById" not in result
    assert "ownerId" not in result["publication"]
    assert result["publication"]["title"] == "Mochila"


class FakeResponse:
    def __init__(self, status_code: int, payload: dict) -> None:
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict:
        return self._payload


class FakeClient:
    def __init__(self, response: FakeResponse | Exception, calls: list) -> None:
        self.response = response
        self.calls = calls

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def post(self, url: str, headers: dict, json: dict) -> FakeResponse:
        self.calls.append({"url": url, "headers": headers, "json": json})
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


def patch_client(monkeypatch, response: FakeResponse | Exception, calls: list) -> None:
    monkeypatch.setattr(server, "_demo_identity", lambda: "actor-1")
    monkeypatch.setattr(
        server.httpx,
        "AsyncClient",
        lambda **_kwargs: FakeClient(response, calls),
    )


async def test_post_write_success_uses_header_and_sanitizes(monkeypatch) -> None:
    calls: list[dict] = []
    patch_client(
        monkeypatch,
        FakeResponse(
            201,
            {
                "id": "p-1",
                "ownerId": "owner-secret",
                "title": "Mochila",
            },
        ),
        calls,
    )

    result = await server._post_write(
        "lost-publications",
        {"title": "Mochila"},
        _sanitize_publication,
    )

    assert result["status"] == "completed"
    assert result["data"] == {"id": "p-1", "title": "Mochila"}
    assert calls[0]["headers"] == {"X-Demo-User-Id": "actor-1"}
    assert calls[0]["json"] == {"title": "Mochila"}
    assert calls[0]["url"].endswith("/lost-publications")


async def test_post_write_maps_definitive_and_unknown_errors(monkeypatch) -> None:
    calls: list[dict] = []
    patch_client(
        monkeypatch,
        FakeResponse(
            400,
            {
                "code": "VALIDATION_ERROR",
                "message": "Invalid request data",
                "details": [{"field": "title", "message": "bad"}],
            },
        ),
        calls,
    )

    failed = await server._post_write(
        "lost-publications",
        {},
        _sanitize_publication,
    )
    assert failed["status"] == "failed"
    assert failed["http_status"] == 400
    assert failed["code"] == "VALIDATION_ERROR"

    patch_client(
        monkeypatch,
        FakeResponse(500, {"message": "boom"}),
        calls,
    )
    unknown = await server._post_write(
        "lost-publications",
        {},
        _sanitize_publication,
    )
    assert unknown["status"] == "unknown"
    assert unknown["code"] == "ACTION_RESULT_UNKNOWN"

    patch_client(monkeypatch, httpx.ConnectError("offline"), calls)
    disconnected = await server._post_write(
        "lost-publications",
        {},
        _sanitize_publication,
    )
    assert disconnected["status"] == "unknown"
    assert disconnected["code"] == "ACTION_RESULT_UNKNOWN"
