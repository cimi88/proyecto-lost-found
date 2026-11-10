import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env")


SUPPORTED_LLM_PROVIDERS = ("groq", "ollama")


@dataclass(frozen=True)
class Settings:
    llm_provider: str
    ollama_api_key: str | None
    ollama_model: str
    ollama_base_url: str
    groq_api_key: str | None
    groq_model: str
    mcp_server_url: str
    allowed_origins: list[str]


def get_settings() -> Settings:
    provider = os.getenv("LLM_PROVIDER", "groq").strip().lower()
    if provider not in SUPPORTED_LLM_PROVIDERS:
        supported = ", ".join(SUPPORTED_LLM_PROVIDERS)
        raise ValueError(
            f"Unsupported LLM_PROVIDER '{provider}'. "
            f"Expected one of: {supported}."
        )

    return Settings(
        llm_provider=provider,
        ollama_api_key=os.getenv("OLLAMA_API_KEY") or None,
        ollama_model=os.getenv("OLLAMA_MODEL", "gemma4:31b"),
        ollama_base_url=os.getenv("OLLAMA_BASE_URL", "https://ollama.com"),
        groq_api_key=os.getenv("GROQ_API_KEY") or None,
        groq_model=os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"),
        mcp_server_url=os.getenv(
            "MCP_SERVER_URL", "http://127.0.0.1:8001/mcp"
        ),
        allowed_origins=[
            origin.strip()
            for origin in os.getenv(
                "ALLOWED_ORIGINS", "http://localhost:4200"
            ).split(",")
            if origin.strip()
        ],
    )
