# app

Aplicación FastAPI del asistente LostFound.

## Responsabilidades

- `main.py`: endpoints de salud, chat, acciones, confirmación, cancelación y
  archivado de conversaciones; CORS y errores.
- `agent.py`: prompt por rol y modelo LangChain seleccionado por `LLM_PROVIDER`
  (`ChatGroq` o `ChatOllama`).
- `action_preparation.py`: herramientas de preparación de publicaciones perdidas,
  publicaciones encontradas y solicitudes de recuperación.
- `action_execution.py`: ejecución de las tres herramientas MCP de escritura
  después de confirmación.
- `pending_actions.py`: store en memoria para acciones preparadas y sus estados.
- `mcp_client.py`: cliente MCP real con `langchain-mcp-adapters`; obtiene el rol
  y ejecuta herramientas de escritura.
- `schemas.py`: contratos de chat, acciones, confirmación y cancelación.
- `conversation_registry.py`: vinculación de `conversation_id` con la identidad
  demo.

## Endpoints

- `GET /health`
- `POST /chat`
- `POST /chat/confirm`
- `POST /chat/cancel`
- `GET /chat/actions/{action_id}`
- `POST /chat/conversations/{conversation_id}/archive`

El modelo puede preparar acciones y mostrar una vista previa, pero no ejecuta
escrituras directamente. FastAPI invoca MCP tras la confirmación explícita.

La identidad se propaga con `X-Demo-User-Id`. No hay JWT ni autenticación real.
El historial de conversaciones se conserva en localStorage del navegador por
perfil demo y no en PostgreSQL ni en FastAPI.
