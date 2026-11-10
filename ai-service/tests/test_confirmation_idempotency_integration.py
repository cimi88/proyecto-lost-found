from __future__ import annotations

import asyncio
import os
import socket
import subprocess
import sys
import time
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest

import app.action_execution as execution
import app.main as main_module
from app.conversation_registry import ConversationRegistry
from app.pending_actions import PendingActionStore, PendingActionType

BASE_DIR = Path(__file__).resolve().parents[1]
USER_ID = "22222222-2222-4222-8222-222222222222"


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def wait_for_port(port: int, timeout: float = 20) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                return
        except OSError:
            time.sleep(0.2)
    raise RuntimeError(f"Port {port} did not open")


@pytest.fixture
def integration_services():
    stub_port = free_port()
    mcp_port = free_port()
    while mcp_port == stub_port:
        mcp_port = free_port()

    env = os.environ.copy()
    env["NESTJS_API_URL"] = f"http://127.0.0.1:{stub_port}/api/v1"
    env["MCP_HOST"] = "127.0.0.1"
    env["MCP_PORT"] = str(mcp_port)

    stub = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "tests.nest_stub:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(stub_port),
            "--log-level",
            "warning",
        ],
        cwd=BASE_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    mcp = subprocess.Popen(
        [sys.executable, "-m", "mcp_server.server"],
        cwd=BASE_DIR,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        wait_for_port(stub_port)
        wait_for_port(mcp_port)
        yield stub_port, mcp_port
    finally:
        for process in (mcp, stub):
            if process.poll() is None:
                process.terminate()
        for process in (mcp, stub):
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)


def configure_app(
    monkeypatch: pytest.MonkeyPatch,
    store: PendingActionStore,
    mcp_port: int,
) -> None:
    monkeypatch.setattr(main_module, "pending_actions", store)
    monkeypatch.setattr(
        main_module,
        "conversations",
        ConversationRegistry(),
    )
    monkeypatch.setattr(
        main_module,
        "settings",
        SimpleNamespace(
            mcp_server_url=f"http://127.0.0.1:{mcp_port}/mcp"
        ),
    )


async def create_pending_lost_action(
    store: PendingActionStore,
    conversation_id,
):
    return await store.create_action_with_token(
        actor_id=USER_ID,
        conversation_id=conversation_id,
        action_type=PendingActionType.CREATE_LOST_PUBLICATION,
        payload={
            "title": "Mochila de prueba",
            "description": "Descripción de prueba",
            "category": "BAGS",
            "location": "Plaza de prueba",
            "eventDate": "2020-11-01",
        },
    )


async def stub_counts(stub_port: int) -> dict:
    async with httpx.AsyncClient(
        base_url=f"http://127.0.0.1:{stub_port}",
        timeout=5,
    ) as client:
        response = await client.get("/api/v1/test/counts")
        response.raise_for_status()
        return response.json()


def confirm_body(conversation_id, action_id, token: str) -> dict:
    return {
        "conversation_id": str(conversation_id),
        "action_id": str(action_id),
        "confirmation_token": token,
    }


async def make_client() -> httpx.AsyncClient:
    transport = httpx.ASGITransport(app=main_module.app)
    return httpx.AsyncClient(
        transport=transport,
        base_url="http://assistant.test",
    )


@pytest.mark.integration
async def test_sequential_confirmation_is_idempotent(
    integration_services,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stub_port, mcp_port = integration_services
    store = PendingActionStore()
    configure_app(monkeypatch, store, mcp_port)

    original_execute = execution.execute_write_tool
    mcp_calls: list[str] = []

    async def counting_execute(tool_name, arguments, identity, settings):
        mcp_calls.append(tool_name)
        return await original_execute(
            tool_name,
            arguments,
            identity,
            settings,
        )

    monkeypatch.setattr(
        execution,
        "execute_write_tool",
        counting_execute,
    )

    conversation_id = uuid4()
    action, token = await create_pending_lost_action(
        store,
        conversation_id,
    )

    async with await make_client() as client:
        first = await client.post(
            "/chat/confirm",
            json=confirm_body(conversation_id, action.action_id, token),
            headers={"X-Demo-User-Id": USER_ID},
        )
        second = await client.post(
            "/chat/confirm",
            json=confirm_body(conversation_id, action.action_id, token),
            headers={"X-Demo-User-Id": USER_ID},
        )

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["status"] == "COMPLETED"
    assert second.json()["status"] == "COMPLETED"
    assert second.json()["result"] == first.json()["result"]
    assert mcp_calls == ["create_lost_publication"]

    counts = await stub_counts(stub_port)
    assert counts["lost_publications"] == 1
    assert len(counts["requests"]) == 1


@pytest.mark.integration
async def test_concurrent_confirmation_invokes_mcp_once(
    integration_services,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stub_port, mcp_port = integration_services
    store = PendingActionStore()
    configure_app(monkeypatch, store, mcp_port)

    original_execute = execution.execute_write_tool
    mcp_calls: list[str] = []

    async def counting_execute(tool_name, arguments, identity, settings):
        mcp_calls.append(tool_name)
        return await original_execute(
            tool_name,
            arguments,
            identity,
            settings,
        )

    monkeypatch.setattr(
        execution,
        "execute_write_tool",
        counting_execute,
    )

    conversation_id = uuid4()
    action, token = await create_pending_lost_action(
        store,
        conversation_id,
    )

    async with await make_client() as client:
        responses = await asyncio.gather(
            client.post(
                "/chat/confirm",
                json=confirm_body(
                    conversation_id,
                    action.action_id,
                    token,
                ),
                headers={"X-Demo-User-Id": USER_ID},
            ),
            client.post(
                "/chat/confirm",
                json=confirm_body(
                    conversation_id,
                    action.action_id,
                    token,
                ),
                headers={"X-Demo-User-Id": USER_ID},
            ),
        )

    successes = [
        response for response in responses if response.status_code == 200
    ]
    conflicts = [
        response for response in responses if response.status_code == 409
    ]

    assert len(successes) + len(conflicts) == 2
    assert len(conflicts) <= 1
    assert len(successes) >= 1
    assert all(
        response.json()["status"] == "COMPLETED"
        for response in successes
    )
    if len(successes) == 2:
        assert successes[0].json()["result"] == successes[1].json()["result"]
    if conflicts:
        assert conflicts[0].json()["code"] == "ACTION_ALREADY_EXECUTING"
    assert mcp_calls == ["create_lost_publication"]

    counts = await stub_counts(stub_port)
    assert counts["lost_publications"] == 1
    assert len(counts["requests"]) == 1
