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
- `RESERVED -> ACTIVE` al cancelar la solicitud aprobada, salvo cierre forzado.
- `RESERVED -> RETURNED` solo mediante el registro de una devolución.
- `ACTIVE -> CLOSED` por el propietario o un administrador.
- `RESERVED -> CLOSED` solo por cierre forzado de un administrador, cancelando primero la solicitud aprobada.
- El propietario no puede cerrar una publicación `RESERVED`.

### Solicitudes de recuperación

Estados: `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`, `COMPLETED`.

Reglas:

- Solo se crean sobre publicaciones `FOUND`.
- El solicitante no puede ser el propietario.
- Aprobar una solicitud pone la publicación en `RESERVED` y rechaza las demás solicitudes pendientes de esa publicación.
- El solicitante, el propietario o un administrador pueden cancelar una solicitud aprobada antes de que exista una devolución.
- La cancelación registra actor y motivo.
- Una solicitud `COMPLETED` no se cancela.

### Devoluciones

La versión 1 usa un flujo de un solo paso:

- La registra el propietario o un administrador.
- Un administrador puede registrarla sin ser quien entrega el objeto.
- La solicitud pasa a `COMPLETED`.
- La publicación pasa a `RETURNED`.
- La confirmación del solicitante queda para la versión 2.

Se distinguen tres identificadores:

| Campo | Significado |
|---|---|
| `registered_by_id` | Usuario que registra la devolución. |
| `delivered_by_id` | Usuario que entrega el objeto. |
| `received_by_id` | Usuario que lo recibe. |

El servidor deriva los identificadores. El cliente solo aporta notas y, en una versión posterior, la confirmación.

### Coincidencias

Estados: `SUGGESTED`, `CONFIRMED`, `DISMISSED`.

- No existe `INVALIDATED`.
- “Accionable” se deriva de que ambas publicaciones estén `ACTIVE`.
- Una coincidencia descartada no se reabre automáticamente.

## Consecuencias

- NestJS implementa las transiciones y las valida en cada operación.
- La base de datos debe reflejar los estados, pero la lógica de transición no se delega a restricciones informales del cliente.
- Las devoluciones requieren auditoría de actor, entrega y recepción.
- El frontend y el asistente solo muestran y solicitan operaciones; no calculan transiciones.
- Cualquier cambio de estados o reglas requiere un nuevo ADR y autorización.
