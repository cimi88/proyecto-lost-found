# Servicio de IA

Servicio Python + FastAPI + LangChain.

- Base FastAPI en la **Etapa 0.5**, sin Ollama, JWT ni MCP.
- `app/`: aplicación FastAPI y orquestación del asistente.
- `mcp_server/`: servidor FastMCP propio de dominio.
- No accede a PostgreSQL ni duplica reglas de negocio.
- No se instalan dependencias en la Etapa 0.1.
