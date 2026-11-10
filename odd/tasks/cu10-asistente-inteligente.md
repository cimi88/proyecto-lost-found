# CU10 — Asistente con preparación y confirmación de acciones

Estado: **implementado con alcance parcial**.

## Alcance actual

- Chat asistente para explicar LostFound y preparar operaciones.
- Identidad demo mediante dos perfiles (`X-Demo-User-Id`).
- Preparación de publicaciones perdidas, publicaciones encontradas y solicitudes
  de recuperación.
- Vista previa de la acción antes de ejecutarla.
- Confirmación explícita en la interfaz; el modelo no ejecuta escrituras.
- Herramientas MCP de lectura y escritura invocadas por FastAPI.
- Historial de conversaciones en localStorage, separado por UUID demo.

## Fuera de alcance o pendiente

- Búsqueda o consulta de publicaciones desde el asistente.
- Consulta de coincidencias desde el asistente.
- Gestión de solicitudes de recuperación desde el asistente.
- Edición, cierre o eliminación de publicaciones desde el asistente.
- Registro de devoluciones desde el asistente.
- Acciones administrativas desde el asistente.
- Contacto con otros usuarios.
- JWT/RS256 y autenticación real de producción.

## Identidad

- La identidad se propaga con `X-Demo-User-Id` desde Angular hasta NestJS.
- El rol lo determina NestJS mediante `GET /api/v1/assistant/context`; nunca lo
  fija el cliente ni el modelo.
- Los perfiles demo no constituyen autenticación real.

## MCP

El servidor FastMCP propio expone:

- `get_user_context`.
- `create_lost_publication`.
- `create_found_publication`.
- `create_recovery_request`.

Las herramientas de escritura son ejecutadas por FastAPI solo después de la
confirmación del usuario. No reciben `userId` ni `role` como argumentos.

## Persistencia

- Las acciones preparadas viven en un `PendingActionStore` en memoria de FastAPI.
- Los tokens de confirmación viven en memoria del frontend.
- Las conversaciones se conservan en localStorage por perfil demo.
- FastAPI no persiste historial en PostgreSQL.

## Verificación

- Pruebas de preparación, confirmación, cancelación, expiración, archivado e
  idempotencia.
- Pruebas de prompt y contrato de capacidades.
- Build y pruebas del frontend.
- Pruebas unitarias e integración del servicio de IA.
- La identidad demo es simulable localmente y no es una protección de
  producción.
