# ADR 0003: Autenticación RS256 y propagación del token

- **Estado:** Aceptado
- **Fecha:** 2026-11-03

> **Estado de implementación:** esta ADR describe una decisión de arquitectura objetivo. JWT/RS256 **no está implementado** en la entrega actual. La identidad se resuelve con `X-Demo-User-Id`; ver ADR 0008 y ADR 0011. No debe presentarse como autenticación lista para producción.

## Contexto

El sistema tiene tres saltos relevantes: Angular hacia NestJS, Angular hacia FastAPI y FastAPI hacia NestJS a través de LangChain y MCP. El asistente no debe acceder a PostgreSQL ni decidir reglas de negocio. Además, una conversación no puede filtrar datos de otro usuario.

## Decisión

### Emisión

- NestJS es el único emisor de JWT.
- Algoritmo: **RS256**.
- La clave privada permanece exclusivamente en el backend.
- FastAPI y los servidores MCP verifican con una clave pública estática.
- Vida útil: **30 minutos**.
- No hay refresh token en la versión 1.
- Audiencia: `aud=lostfound-api`.
- Claims previstos: `sub`, `role`, `aud`, `iss`, `iat`, `exp`.
- Rotación de claves manual.
- JWKS queda para una versión posterior.

### Propagación

El token en bruto se propaga en esta cadena:

```text
Angular -> FastAPI /chat -> LangChain MCPAdapter -> FastMCP -> NestJS
```

Reglas:

- Se reenvía el encabezado `Authorization: Bearer <token>` sin transformarlo.
- Las herramientas MCP no reciben `userId` ni `role` como parámetros.
- El usuario se deriva del token verificado en cada salto.
- No se confía en identificadores enviados por el modelo ni por el cliente a las herramientas.
- Cada llamada se revalida; no alcanza con validar al comienzo de la conversación.
- No se registran tokens completos en logs.

### Aislamiento

- Las conversaciones se identifican por `(sub, conversation_id)`.
- El `sub` autenticado es obligatorio; el `conversation_id` por sí solo no autoriza acceso.
- FastAPI crea el `MCPAdapter`, el cliente y las herramientas por petición.
- No se cachean adaptadores, clientes, herramientas ni contexto entre usuarios.
- No se depende de `Mcp-Session-Id` para el aislamiento: MCP 2026-07-28 es *sessionless*.
- El vínculo de sesión de FastMCP, si existe, es defensa en profundidad para clientes legados, no el mecanismo principal.

## Consecuencias

- El backend debe custodiar la clave privada y distribuir la clave pública a FastAPI y a los servidores MCP.
- La rotación manual requiere coordinar la actualización de la clave pública.
- Sin refresh token, el usuario debe volver a autenticarse al vencer el token de 30 minutos.
- La cadena completa debe probarse con dos usuarios, tokens válidos, inválidos y vencidos, y verificación de ausencia de estado compartido.
- La PoC de la cadena RS256 es obligatoria antes de declarar funcional el asistente.
