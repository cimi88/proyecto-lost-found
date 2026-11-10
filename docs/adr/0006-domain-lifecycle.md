# ADR 0006: Ciclo de vida del dominio y devoluciones

- **Estado:** Aceptado
- **Fecha:** 2026-11-03

## Contexto

Las publicaciones, las solicitudes de recuperación, las coincidencias y las devoluciones tienen reglas de estado que deben aplicarse en un único lugar. El asistente y el frontend no pueden decidir transiciones ni derivar identificadores de actores.

## Decisión

### Publicaciones

Estados: `ACTIVE`, `RESERVED`, `RETURNED`, `CLOSED`.

Reglas:

- `ACTIVE -> RESERVED` al aprobar una solicitud de recuperación.
- `RESERVED -> ACTIVE` al cancelar la solicitud aprobada.
- `RESERVED -> RETURNED` solo mediante el registro de una devolución.
- `ACTIVE -> CLOSED` por el propietario o un administrador.
- No existe cierre forzado de `RESERVED`: el cierre solo se permite sobre publicaciones `ACTIVE`.
- El propietario no puede cerrar una publicación `RESERVED`.
- La eliminación de publicaciones no está implementada.

### Solicitudes de recuperación

Estados: `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`, `COMPLETED`.

Reglas:

- Solo se crean sobre publicaciones `FOUND`.
- El solicitante no puede ser el propietario.
- Aprobar una solicitud pone la publicación en `RESERVED` y rechaza las demás solicitudes pendientes de esa publicación.
- El solicitante puede cancelar su solicitud `PENDING`.
- El solicitante o el propietario pueden cancelar una solicitud `APPROVED`.
- Un ADMIN solo puede cancelar si es solicitante o propietario.
- La cancelación registra actor y motivo.
- Una solicitud `COMPLETED` no se cancela.

### Devoluciones

La versión 1 usa un flujo de un solo paso:

- La registra el propietario de la publicación.
- Un ADMIN solo puede registrarla si es el propietario.
- La solicitud pasa a `COMPLETED`.
- La publicación pasa a `RETURNED`.
- Los datos `completed_at`, `completed_by_id` y `return_notes` se almacenan en `recovery_requests`.
- No existe una tabla `devoluciones` separada.
- La confirmación del solicitante queda para la versión 2.

### Coincidencias

Estados persistidos posibles: `SUGGESTED`, `CONFIRMED`, `DISMISSED`. La API y la UI actuales solo generan y muestran `SUGGESTED`; no existen endpoints para confirmar o descartar.

- No existe `INVALIDATED`.
- “Accionable” se deriva de que ambas publicaciones estén `ACTIVE`.
- Una coincidencia descartada no se reabre automáticamente.

## Consecuencias

- NestJS implementa las transiciones y las valida en cada operación.
- La base de datos debe reflejar los estados, pero la lógica de transición no se delega a restricciones informales del cliente.
- Las devoluciones requieren auditoría de actor, entrega y recepción.
- El frontend y el asistente solo muestran y solicitan operaciones; no calculan transiciones.
- Cualquier cambio de estados o reglas requiere un nuevo ADR y autorización.
