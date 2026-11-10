import json
import uuid
from typing import Any

from langchain_mcp_adapters.client import MultiServerMCPClient

from .config import Settings


class McpIdentityError(Exception):
    """The demo identity was rejected by the backend."""


class McpUnavailableError(Exception):
    """The MCP server or NestJS could not be reached."""


class McpWriteUnknownError(Exception):
    """A write may have reached NestJS, but its result is unknown."""


def _extract_payload(result: Any) -> dict[str, Any]:
    if isinstance(result, dict):
        return result

    if isinstance(result, str):
        try:
            parsed = json.loads(result)
        except json.JSONDecodeError as error:
            raise McpUnavailableError("MCP returned an invalid payload") from error
        if isinstance(parsed, dict):
            return parsed

    if isinstance(result, list):
        for item in result:
            if isinstance(item, dict):
                if "role" in item:
                    return item
                text = item.get("text")
            else:
                text = getattr(item, "text", None)
            if isinstance(text, str):
                try:
                    parsed = json.loads(text)
                except json.JSONDecodeError:
                    continue
                if isinstance(parsed, dict):
                    return parsed

    raise McpUnavailableError("MCP returned an unexpected payload")


async def get_user_role(identity: str, settings: Settings) -> str:
    try:
        uuid.UUID(identity)
    except ValueError as error:
        raise McpIdentityError("Invalid demo identity") from error

    client = MultiServerMCPClient(
        {
            "assistant": {
                "transport": "streamable_http",
                "url": settings.mcp_server_url,
                "headers": {"X-Demo-User-Id": identity},
                "timeout": 15,
            }
        }
    )

    try:
        tools = await client.get_tools()
    except Exception as error:
        raise McpUnavailableError("MCP server is unavailable") from error

    tool = next((candidate for candidate in tools if candidate.name == "get_user_context"), None)
    if tool is None:
        raise McpUnavailableError("MCP role tool is unavailable")

    try:
        result = await tool.ainvoke({})
    except Exception as error:
        message = str(error).lower()
        if "identity" in message or "401" in message or "invalid" in message:
            raise McpIdentityError("Invalid demo identity") from error
        raise McpUnavailableError("MCP role lookup failed") from error

    try:
        payload = _extract_payload(result)
    except McpUnavailableError:
        raw_result = str(result).lower()
        if "invalid" in raw_result or "401" in raw_result:
            raise McpIdentityError("Invalid demo identity")
        raise
    role = payload.get("role")
    if role not in {"USER", "ADMIN"}:
        raise McpUnavailableError("Backend returned an invalid role")
    return role


async def execute_write_tool(
    tool_name: str,
    arguments: dict[str, Any],
    identity: str,
    settings: Settings,
) -> dict[str, Any]:
    """Invoke one confirmed write tool outside the LLM tool set."""
    try:
        uuid.UUID(identity)
    except ValueError as error:
        raise McpIdentityError("Invalid demo identity") from error

    client = MultiServerMCPClient(
        {
            "assistant": {
                "transport": "streamable_http",
                "url": settings.mcp_server_url,
                "headers": {"X-Demo-User-Id": identity},
                "timeout": 20,
            }
        }
    )

    try:
        tools = await client.get_tools()
    except Exception as error:
        raise McpWriteUnknownError(
            "MCP server is unavailable"
        ) from error

    tool = next((candidate for candidate in tools if candidate.name == tool_name), None)
    if tool is None:
        raise McpUnavailableError(f"MCP write tool is unavailable: {tool_name}")

    try:
        result = await tool.ainvoke(arguments)
        payload = _extract_payload(result)
    except Exception as error:
        raise McpWriteUnknownError(
            "MCP write result is unknown"
        ) from error

    if not isinstance(payload, dict):
        raise McpWriteUnknownError("MCP write returned an invalid payload")
    return payload
