import pytest

from app.agent import generate_reply
from app.config import get_settings


@pytest.mark.integration
async def test_real_groq_response() -> None:
    settings = get_settings()
    if not settings.groq_api_key:
        pytest.skip("GROQ_API_KEY is not configured")

    reply = await generate_reply(
        "USER",
        "Responde únicamente: OK",
        [],
        settings,
    )
    assert reply
    assert "OK" in reply.upper()
