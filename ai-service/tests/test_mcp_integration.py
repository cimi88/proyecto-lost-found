import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest
from langchain_mcp_adapters.client import MultiServerMCPClient

BASE_DIR = Path(__file__).resolve().parents[1]
ADMIN_ID = "11111111-1111-4111-8111-111111111111"
STUB_PORT = 8110
MCP_PORT = 8111


def wait_for_port(port: int, timeout: float = 20) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                return
        except OSError:
            time.sleep(0.2)
    raise RuntimeError(f"Port {port} did not open")


def payload_from_tool(result):
    if isinstance(result, dict):
        return result
    if isinstance(result, str):
        return json.loads(result)
    if isinstance(result, list):
        for item in result:
            text = item.get("text") if isinstance(item, dict) else getattr(item, "text", None)
            if isinstance(text, str):
                return json.loads(text)
    raise AssertionError(f"Unexpected MCP result: {result!r}")


@pytest.mark.integration
async def test_real_mcp_forwards_identity_and_returns_role() -> None:
    env = os.environ.copy()
    env["NESTJS_API_URL"] = f"http://127.0.0.1:{STUB_PORT}/api/v1"
    env["MCP_HOST"] = "127.0.0.1"
    env["MCP_PORT"] = str(MCP_PORT)

    stub = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "tests.nest_stub:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(STUB_PORT),
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
        wait_for_port(STUB_PORT)
        wait_for_port(MCP_PORT)

        client = MultiServerMCPClient(
            {
                "assistant": {
                    "transport": "streamable_http",
                    "url": f"http://127.0.0.1:{MCP_PORT}/mcp",
                    "headers": {"X-Demo-User-Id": ADMIN_ID},
                    "timeout": 15,
                }
            }
        )
        tools = await client.get_tools()
        names = {tool.name for tool in tools}
        assert {
            "get_user_context",
            "create_lost_publication",
            "create_found_publication",
            "create_recovery_request",
        } <= names
        role_tool = next(tool for tool in tools if tool.name == "get_user_context")
        assert role_tool.args == {}

        result = payload_from_tool(
            await role_tool.ainvoke({})
        )
        assert result == {"role": "ADMIN"}
    finally:
        mcp.terminate()
        stub.terminate()
        mcp.wait(timeout=10)
        stub.wait(timeout=10)
