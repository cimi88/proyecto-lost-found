# Design

## Context

CU1–CU7 están implementados. CU10 se implementó como asistente orientativo con Angular, FastAPI, LangChain, Ollama Cloud y FastMCP. No hay JWT: la identidad es la costura demo `X-Demo-User-Id`.

## Decisions

### Alcance

El asistente solo explica cómo usar LostFound. No ejecuta operaciones de negocio ni recibe herramientas de búsqueda, solicitudes, aprobación, cancelación o devolución.

### Rol e identidad

- Angular envía `X-Demo-User-Id` a FastAPI.
- FastAPI lo reenvía al MCP.
- El MCP lee el encabezado y consulta `GET /api/v1/assistant/context` en NestJS.
- NestJS devuelve `{ role: "USER" | "ADMIN" }`.
- FastAPI construye el prompt con ese rol.
- El modelo no recibe `userId`/`role` como argumentos y no puede cambiarlos.
- JWT/RS256 no está implementado.

### MCP

El servidor FastMCP propio expone una única herramienta de solo lectura:

- `get_user_context` → `GET /api/v1/assistant/context`.

No hay herramientas de búsqueda, detalle, coincidencias, solicitudes ni gestión.

### Modelo y memoria

- Ollama Cloud con `gemma4:31b`.
- Un único agente, sin memoria persistente.
- El frontend conserva la conversación solo en memoria.
- El servidor no almacena historial.

### Versiones verificadas

FastAPI 0.162.1, LangChain 1.4.8, `langchain-ollama` 1.1.0, `langchain-mcp-adapters` 0.3.2, FastMCP 3.4.11, MCP 1.30.0.

## Risks / Trade-offs

- La identidad demo es spoofeable y no sirve para producción.
- No existe panel ADMIN ni funciones administrativas en la interfaz.
- El modelo puede alucinar funciones inexistentes; el prompt y la ausencia de herramientas de negocio lo limitan.
- La cadena MCP con JWT y aislamiento real entre usuarios queda pendiente.

## Migration Plan

Sin migraciones ni cambios de persistencia.
