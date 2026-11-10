# mcp_server

Servidor FastMCP propio del asistente LostFound.

## Herramientas actuales

- `get_user_context`: lee `X-Demo-User-Id` del request MCP, lo reenvía a
  `GET /api/v1/assistant/context` de NestJS y devuelve `{ "role": "USER" | "ADMIN" }`.
- `create_lost_publication`: crea una publicación perdida.
- `create_found_publication`: crea una publicación encontrada.
- `create_recovery_request`: crea una solicitud de recuperación.

Las tres herramientas de escritura son invocadas por FastAPI únicamente después
de la confirmación explícita del usuario. No son invocadas directamente por el
modelo.

No acepta `userId` ni `role` como argumentos, no accede a PostgreSQL y no expone
herramientas de búsqueda, detalle, coincidencias, aprobación, rechazo,
cancelación, devolución ni administración.

La identidad se propaga con `X-Demo-User-Id` mientras `AUTH_MODE=demo`. No es
autenticación real para producción.
