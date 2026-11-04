# ADR 0004: Límites del asistente y arquitectura MCP

- **Estado:** Aceptado con puntos abiertos de PoC
- **Fecha:** 2026-11-03

## Contexto

El asistente conversacional debe poder consultar y operar el dominio sin convertirse en una segunda fuente de verdad. El proyecto exige al menos dos servidores o herramientas MCP, con al menos uno externo. LangChain, FastMCP y MCP 2026-07-28 todavía deben verificarse en conjunto.

## Decisión

### Separación de responsabilidades

- FastAPI recibe el mensaje, verifica el JWT, administra la conversación y orquesta LangChain.
- LangChain construye el agente e invoca el modelo de Ollama Cloud.
- El servidor MCP interno expone herramientas delgadas que llaman a la API NestJS con el token del usuario.
- NestJS aplica autenticación, autorización, reglas, estados y persistencia.
- FastAPI, LangChain y MCP no acceden a PostgreSQL ni duplican reglas del dominio.
- El servidor MCP externo aporta capacidades auxiliares y no recibe secretos del dominio.

### Servidores MCP

Se requieren al menos dos servidores o herramientas MCP:

1. **MCP interno de dominio:** herramientas de búsqueda, detalle y apoyo a coincidencias, siempre delegando en NestJS.
2. **MCP externo:** una capacidad auxiliar. Context7 o Playwright en OpenCode pueden cumplir el requisito para el entorno de desarrollo; si el asistente debe consumir un MCP externo en tiempo de ejecución, se agregará uno y se documentará en la PoC.

Las herramientas no reciben `userId` ni `role` como parámetros. El usuario se deriva del token y NestJS vuelve a autorizar cada llamada.

### Aislamiento

- El `MCPAdapter`, el cliente MCP y las herramientas se crean por petición.
- No se cachean entre usuarios ni entre conversaciones.
- Las conversaciones se indexan por `(sub, conversation_id)`.
- Cada llamada se revalida; no se confía en el estado de una sesión MCP.
- No se depende de `Mcp-Session-Id`; MCP 2026-07-28 es *sessionless*.
- El vínculo de sesión de FastMCP es defensa en profundidad para clientes legados, no el aislamiento principal.

### Modelo

- Ollama Cloud: `https://ollama.com/api/chat`.
- Modelo: `gemma4:31b`.
- Autenticación: `Authorization: Bearer $OLLAMA_API_KEY`.
- `ChatOllama` con `base_url`, cabeceras mediante `client_kwargs`/`async_client_kwargs` y `validate_model_on_init=False`.
- Inicialización diferida para que `/health` funcione sin API key.
- El *tool calling* y el *streaming* se validan en la PoC.

## Puntos abiertos

- Compatibilidad exacta de LangChain 1.4.8, FastMCP 4.1.6 y MCP 2026-07-28.
- Resolución de dependencias entre FastAPI, FastMCP y Starlette.
- Necesidad de consumo de un MCP externo en runtime.
- Comportamiento de *tool calling* y *streaming* de Ollama Cloud con `gemma4:31b`.

## PoC obligatoria

No se declarará funcional la cadena MCP hasta completar una PoC aislada que verifique:

1. LangChain -> FastMCP -> NestJS.
2. Propagación del token Bearer.
3. Verificación RS256 en cada salto.
4. Autorización efectiva en NestJS.
5. Aislamiento entre dos usuarios.
6. Rechazo de tokens inválidos y vencidos.
7. Ausencia de adaptadores MCP cacheados entre usuarios.

## Consecuencias

- Los servidores MCP deben ser adaptadores finos y auditables.
- Cualquier regla nueva se implementa en NestJS, no en MCP ni en el prompt.
- La PoC puede revelar incompatibilidades que obliguen a ajustar versiones; no se cambiará de tecnología sin autorización.
