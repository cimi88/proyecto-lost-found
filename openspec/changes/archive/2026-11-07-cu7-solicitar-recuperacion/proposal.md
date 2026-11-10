# Proposal

## Why

CU6 permite descubrir coincidencias entre publicaciones `LOST` y `FOUND`, pero un visitante todavía no puede actuar sobre una publicación encontrada: no existe forma de pedir su recuperación ni de que el propietario acepte o rechace el pedido. CU7 cierra ese hueco con un flujo simple y auditable: el solicitante pide la recuperación de una `FOUND` activa, el propietario decide y, al aprobar, la publicación pasa a `RESERVED`. La devolución y el estado `COMPLETED` quedan para CU8.

## What Changes

- Crear la capacidad `recovery-requests` con estados `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED` y `COMPLETED` (este último reservado a CU8).
- Agregar la tabla `recovery_requests` y una migración aditiva y reversible: FK a publicación y usuarios, estados válidos, notas, actor/motivo de cancelación, índices, unicidad parcial de una solicitud activa (`PENDING`/`APPROVED`) por publicación y solicitante, y unicidad parcial de una sola `APPROVED` por publicación.
- Exponer endpoints autenticados con la identidad demo existente:
  - `POST /api/v1/publications/:id/recovery-requests`
  - `GET /api/v1/recovery-requests/mine`
  - `GET /api/v1/recovery-requests/received`
  - `POST /api/v1/recovery-requests/:id/approve`
  - `POST /api/v1/recovery-requests/:id/reject`
  - `POST /api/v1/recovery-requests/:id/cancel`
- Reglas: solo `FOUND` `ACTIVE`; el solicitante no puede ser el propietario; notas opcionales (máx. 500); una publicación `RESERVED` no admite solicitudes ni aprobaciones; aprobar bloquea la publicación, reserva y rechaza las demás `PENDING` en la misma transacción; no puede existir más de una `APPROVED` por publicación; cancelar una `APPROVED` bloquea la publicación, verifica que siga `RESERVED` y que esa solicitud sea la que justifica la reserva, y solo entonces la reactiva; ante inconsistencia no reactiva y responde `409`; la cancelación exige motivo (3–500) y registra actor y motivo.
- Respuestas sin `ownerId`, correo ni identificadores internos de usuario; el propietario ve únicamente el nombre visible del solicitante, notas, estado y fechas. `createdAt` es la creación y `updatedAt` la última modificación: no se presentan como fecha de aprobación, rechazo o cancelación.
- Publicación inexistente, no `ACTIVE` o no `FOUND` responde `404 PUBLICATION_NOT_FOUND`; no se agrega `PUBLICATION_NOT_AVAILABLE`.
- Frontend: formulario de solicitud en el detalle de una `FOUND` activa; acción «Solicitar recuperación» en tarjetas de sugerencia `FOUND`; páginas «Mis solicitudes» y «Solicitudes recibidas» (aprobar/rechazar/cancelar) con dos enlaces nuevos en el nav.
- Contrato manual, ADR 0009, modelo de dominio, arquitectura, READMEs y ODD actualizados.
- Pruebas unitarias, E2E, frontend, migración, `verify:cu7` real y regresiones CU1–CU6.

**Fuera de alcance:** devolución/`COMPLETED` (CU8), edición/cierre de publicaciones propias (CU9), aprobación o rechazo por ADMIN, listado global de moderación, notificaciones/correo, autenticación JWT real, chatbot/MCP, paginación de solicitudes y rate limiting.

## Capabilities

### New Capabilities

- `recovery-requests`: creación, consulta, aprobación, rechazo y cancelación de solicitudes de recuperación sobre publicaciones `FOUND` activas, con transiciones de la publicación a `RESERVED`/`ACTIVE` y protecciones de privacidad.

### Modified Capabilities

- Ninguna. Las lecturas públicas de `publications` y `publication-matching` conservan su comportamiento: siguen mostrando solo publicaciones `ACTIVE` y no se modifican contratos existentes.

## Impact

- **Backend:** nuevo módulo `recovery-requests` (entidad, DTOs, servicio, controlador, pruebas), reutilización de `DemoIdentityGuard`, `@CurrentUser`, `ValidationPipe` y contrato de errores.
- **PostgreSQL:** una migración aditiva `AddRecoveryRequests`; sin cambios destructivos ni de datos.
- **API/contrato:** seis endpoints nuevos y `contracts/v1/recovery-request.ts`; los contratos de CU1–CU6 permanecen intactos.
- **Frontend:** sección de solicitud en el detalle, dos páginas nuevas, navegación y servicio/modelos de solicitudes.
- **Documentación:** ADR 0009, `docs/domain-model.md`, `docs/architecture.md`, READMEs, contrato y ODD.
- **Sin dependencias nuevas, sin chatbot/MCP y sin commits/push.**
