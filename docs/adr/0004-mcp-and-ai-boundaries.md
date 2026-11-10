# ADR 0004: Límites del asistente y arquitectura MCP

- **Estado:** Aceptado con puntos abiertos de PoC
- **Fecha:** 2026-11-03

> **Estado de implementación CU10:** la decisión original se conserva. En la entrega actual el MCP propio expone `get_user_context` y tres herramientas de escritura (`create_lost_publication`, `create_found_publication`, `create_recovery_request`). Las escrituras son invocadas por FastAPI únicamente después de la confirmación explícita del usuario. FastAPI no verifica JWT y usa `X-Demo-User-Id`. Las herramientas de búsqueda, detalle y coincidencias siguen siendo diseño futuro, no funcionalidad implementada. Ver ADR 0011.

## Contexto

El asistente conversacional debe poder consultar y operar el dominio sin convertirse en una segunda fuente de verdad. El proyecto exige al menos dos servidores o herramientas MCP, con al menos uno externo. Context7 y Playwright, integrados en OpenCode, son los servidores externos aprobados; el servidor MCP propio se usa durante la ejecución del chatbot. En el momento de esta decisión, LangChain, FastMCP y MCP 2026-07-28 debían verificarse en conjunto; el estado actual se detalla en el addendum de implementación CU10.

## Decisión

### Separación de responsabilidades

- FastAPI recibe el mensaje, verifica el JWT, administra la conversación y orquesta LangChain.
- LangChain construye el agente e invoca el modelo de Ollama Cloud.
- El servidor MCP propio del proyecto expone herramientas delgadas que llaman a la API NestJS con el token del usuario.
- NestJS aplica autenticación, autorización, reglas, estados y persistencia.
- FastAPI, LangChain y MCP no acceden a PostgreSQL ni duplican reglas del dominio.
- Los servidores MCP externos (Context7 y Playwright) se integran en OpenCode y no reciben secretos del dominio.

### Servidores MCP

Se requieren al menos dos servidores o herramientas MCP:

1. **MCP propio del proyecto:** en el diseño objetivo, herramientas de búsqueda, detalle y apoyo a coincidencias, siempre delegando en NestJS. En CU10 se implementaron `get_user_context` y las tres herramientas de escritura de creación ya indicadas; las herramientas de lectura de búsqueda, detalle y coincidencias no se implementaron.
2. **MCP externos:** **Context7** y **Playwright**, integrados en OpenCode. Se usan como herramientas de desarrollo y son los que cumplen el requisito académico de contar con MCP externo. No forman parte de la cadena runtime del chatbot.

Esta decisión está aprobada y no requiere confirmación adicional del docente.

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

- ~~Compatibilidad exacta de LangChain 1.4.8, FastMCP 4.1.6 y MCP 2026-07-28.~~ Resuelto para CU10 con LangChain 1.4.8, FastMCP 3.4.11, MCP 1.30.0 y `langchain-mcp-adapters` 0.3.2. La combinación FastMCP 4.1.6 + MCP 2.x no fue compatible con el adaptador elegido.
- ~~Resolución de dependencias entre FastAPI, FastMCP y Starlette.~~ Resuelto y verificado en CU10.
- Comportamiento de *tool calling* y *streaming* de Ollama Cloud con `gemma4:31b`: la respuesta de texto fue verificada; CU10 no delega el rol al tool calling del modelo.

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
- Context7 y Playwright quedan fuera de la cadena runtime del chatbot; el servidor MCP propio es el que se invoca durante la ejecución.
- La PoC puede revelar incompatibilidades que obliguen a ajustar versiones; no se cambiará de tecnología sin autorización.
