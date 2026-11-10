# Servicio de IA

Asistente de LostFound. Puede explicar el uso del sistema y preparar
publicaciones o solicitudes de recuperación. La ejecución de esas operaciones
requiere confirmación explícita en la interfaz; el modelo no ejecuta escrituras
directamente.

## Componentes

- `app/`: FastAPI + LangChain. Usa Groq por defecto y permite Ollama como
  proveedor alternativo. Expone endpoints de chat, acciones, confirmación,
  cancelación y archivado.
- `mcp_server/`: FastMCP propio con herramientas de lectura y escritura. Las
  write tools son invocadas por FastAPI después de la confirmación.

Flujo:

```text
Angular -> FastAPI -> MCP -> NestJS
                    \-> LLM (Groq por defecto u Ollama)
```

La identidad se propaga con `X-Demo-User-Id` mientras `AUTH_MODE=demo`. No es
autenticación para producción; el rol siempre lo determina NestJS.

## Configuración

Crear `ai-service/.env` (ignorado por Git) a partir de `.env.example`:

```text
LLM_PROVIDER=groq
OLLAMA_API_KEY=...
OLLAMA_MODEL=gemma4:31b
OLLAMA_BASE_URL=https://ollama.com
GROQ_API_KEY=...
GROQ_MODEL=openai/gpt-oss-120b
MCP_SERVER_URL=http://127.0.0.1:8001/mcp
NESTJS_API_URL=http://localhost:3000/api/v1
ALLOWED_ORIGINS=http://localhost:4200
MCP_HOST=127.0.0.1
MCP_PORT=8001
```

`LLM_PROVIDER` admite `groq` u `ollama`; si se omite, se usa `groq`.
No se debe imprimir ni versionar ninguna API key.

## Instalación y arranque

Desde `ai-service/`:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Servidor MCP:

```powershell
.\.venv\Scripts\python.exe -m mcp_server.server
```

Servicio FastAPI:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Requiere NestJS en `localhost:3000`. El rol se consulta por MCP antes de llamar
al modelo; el modelo no recibe herramientas de negocio.

## Pruebas

```powershell
.\.venv\Scripts\python.exe -m pytest -m "not integration" -q
.\.venv\Scripts\python.exe -m pytest -m integration tests/test_mcp_integration.py -q
.\.venv\Scripts\python.exe -m pytest -m integration tests/test_groq_integration.py -q
```

La prueba de Groq requiere `GROQ_API_KEY` y `LLM_PROVIDER=groq`. La integración
MCP levanta un stub HTTP de NestJS y un servidor FastMCP reales.

## Limitaciones

- Sin JWT: se usa la costura demo aprobada con perfiles A/B.
- El historial de conversaciones se guarda en localStorage del navegador,
  separado por UUID demo; no se persiste en PostgreSQL ni en FastAPI.
- El modelo no ejecuta operaciones de negocio: solo prepara acciones; FastAPI
  invoca MCP después de una confirmación explícita.
- No hay búsqueda, detalle, coincidencias, gestión de solicitudes, devoluciones
  ni administración desde el asistente.
- No hay autenticación real para producción.
- Un único agente.
