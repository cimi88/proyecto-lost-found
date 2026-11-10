import json
from typing import Any, Iterable, Sequence

from langchain_core.messages import (
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_groq import ChatGroq
from langchain_ollama import ChatOllama

from .assistant_knowledge import (
    ACCURACY_RULES,
    ADMINISTRATION_RULES,
    APPLICATION_LIMITATIONS,
    APPLICATION_NAVIGATION,
    ASSISTANT_CAPABILITIES,
    ASSISTANT_LIMITATIONS,
    MATCHING_RULES,
    PUBLICATION_RULES,
    RECOVERY_REQUEST_RULES,
    ROLE_GUIDANCE,
)
from .config import Settings, SUPPORTED_LLM_PROVIDERS
from .schemas import ChatMessage


def build_system_prompt(role: str) -> str:
    guidance = ROLE_GUIDANCE.get(role)
    if guidance is None:
        raise ValueError("Unsupported role")

    return f"""Eres el asistente de LostFound.
El backend determinó que el rol autenticado es {role}. No puedes cambiar ni suplantar ese rol.
{guidance}

Distinguí siempre entre:
A) Las funcionalidades de la aplicación LostFound, que el usuario puede usar.
B) Tus capacidades como asistente.

Funcionalidades reales de la aplicación:
{APPLICATION_NAVIGATION}

{PUBLICATION_RULES}

{MATCHING_RULES}

{RECOVERY_REQUEST_RULES}

{ADMINISTRATION_RULES}

{APPLICATION_LIMITATIONS}

Capacidades del asistente:
{ASSISTANT_CAPABILITIES}

{ASSISTANT_LIMITATIONS}

Reglas de precisión:
{ACCURACY_RULES}

Para preparar una acción:
- Recopilá únicamente datos proporcionados explícitamente por el usuario.
- No inventes fechas, ubicaciones, categorías, descripciones ni UUID.
- Si falta un campo obligatorio o hay ambigüedad, preguntá antes de usar una
  herramienta de preparación.
- Para publicaciones, los campos obligatorios son title, description, category,
  location y eventDate. Las categorías válidas son ELECTRONICS, DOCUMENTS,
  KEYS, BAGS, CLOTHING, ACCESSORIES, BOOKS, SPORTS y OTHER.
- Para solicitar recuperación, pedí un enlace o UUID explícito de la
  publicación; no inventes un UUID. No podés verificar por tu cuenta si la
  publicación es FOUND o ACTIVE.
- La herramienta de preparación solo crea una vista previa; no ejecuta la
  operación.
- Indicá siempre que la acción todavía no fue ejecutada.

Flujo de confirmación:
- La operación se ejecuta únicamente después de que el usuario pulse Confirmar
  en la interfaz.
- El modelo no ejecuta directamente las operaciones; FastAPI las ejecuta tras
  la confirmación explícita.
- No afirmes que una publicación o solicitud se creó hasta que la interfaz
  muestre el resultado real.
- Si te preguntan si podés publicar o crear una solicitud, respondé que sí
  podés preparar la acción y explicar la confirmación; no respondas que no
  tenés permisos para preparar acciones permitidas.

Si el usuario pide una operación, indicale en qué pantalla puede realizarla,
salvo que estés preparando una de las acciones permitidas.
Responde en español, de forma breve, clara y práctica. No inventes funciones inexistentes.
"""


def build_llm(settings: Settings) -> ChatGroq | ChatOllama:
    if settings.llm_provider == "groq":
        if not settings.groq_api_key:
            raise RuntimeError("GROQ_API_KEY is not configured")

        return ChatGroq(
            model=settings.groq_model,
            api_key=settings.groq_api_key,
            temperature=0.2,
            max_retries=2,
        )

    if settings.llm_provider == "ollama":
        if not settings.ollama_api_key:
            raise RuntimeError("OLLAMA_API_KEY is not configured")

        headers = {
            "Authorization": f"Bearer {settings.ollama_api_key}",
        }
        return ChatOllama(
            model=settings.ollama_model,
            base_url=settings.ollama_base_url,
            temperature=0.2,
            validate_model_on_init=False,
            client_kwargs={"headers": headers},
            async_client_kwargs={"headers": headers},
        )

    supported = ", ".join(SUPPORTED_LLM_PROVIDERS)
    raise ValueError(
        f"Unsupported LLM provider '{settings.llm_provider}'. "
        f"Expected one of: {supported}."
    )


def _text_content(message: Any) -> str:
    content = message.content
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        return " ".join(
            str(part.get("text", ""))
            for part in content
            if isinstance(part, dict)
        ).strip()
    return str(content).strip()


async def generate_reply(
    role: str,
    message: str,
    history: Iterable[ChatMessage],
    settings: Settings,
    tools: Sequence[Any] = (),
) -> str:
    llm = build_llm(settings)
    bound_llm = llm.bind_tools(list(tools)) if tools else llm
    tool_map = {tool.name: tool for tool in tools}

    system_prompt = build_system_prompt(role)
    if not tools:
        system_prompt += (
            "\nNo hay herramientas de preparación disponibles en esta "
            "solicitud. No afirmes que preparaste una acción."
        )

    messages = [SystemMessage(content=system_prompt)]
    for item in history:
        if item.role == "user":
            messages.append(HumanMessage(content=item.content))
        else:
            from langchain_core.messages import AIMessage

            messages.append(AIMessage(content=item.content))
    messages.append(HumanMessage(content=message))

    for _ in range(3):
        try:
            result = await bound_llm.ainvoke(messages)
        except Exception:
            raise

        calls = list(getattr(result, "tool_calls", []) or [])
        if not calls:
            return _text_content(result)

        messages.append(result)
        for call in calls:
            name = call.get("name", "")
            args = call.get("args") or {}
            call_id = call.get("id", "")
            tool = tool_map.get(name)

            if tool is None:
                content = json.dumps(
                    {
                        "status": "error",
                        "message": "Tool not allowed",
                    },
                    ensure_ascii=False,
                )
            else:
                try:
                    content = str(await tool.ainvoke(args))
                except Exception as error:
                    content = json.dumps(
                        {
                            "status": "invalid",
                            "message": str(error),
                        },
                        ensure_ascii=False,
                    )

            messages.append(
                ToolMessage(content=content, tool_call_id=call_id)
            )

    return "No se pudo completar la preparación de la acción."
