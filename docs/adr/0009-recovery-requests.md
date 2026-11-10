# ADR 0009: Solicitudes de recuperación, reserva y devolución

- **Estado:** Aceptado
- **Fecha:** 2026-11-07

## Contexto

CU6 permite descubrir coincidencias entre publicaciones `LOST` y `FOUND`, pero
no existía un flujo para pedir la recuperación de una publicación encontrada.
CU7 incorpora ese flujo hasta que la publicación queda `RESERVED`. La devolución
física y el estado `COMPLETED` pertenecen a CU8.

La identidad disponible sigue siendo la costura demo del ADR 0008. Las reglas de
autorización se aplican igual, aunque la identidad sea simulable localmente.

> **Actualización CU8:** la devolución y el estado `COMPLETED` ya están
> implementados. La solicitud `APPROVED` puede completarse y la publicación pasa
> a `RETURNED`. No existe una tabla `devoluciones` separada: los datos de cierre
> se guardan en `recovery_requests`.

## Decisión

### Alcance

- Crear, listar propias/recibidas, aprobar, rechazar, cancelar y completar solicitudes.
- Estados: `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED` y `COMPLETED`.
- CU8 registra la devolución como finalización de la solicitud y transiciona la publicación a `RETURNED`.
- No hay relación persistida entre una coincidencia de CU6 y una solicitud.

### Persistencia

- Tabla `recovery_requests` con FKs `ON DELETE RESTRICT` a publicación,
  solicitante y actor de cancelación.
- `CHECK` de estados y de consistencia de cancelación: una solicitud `CANCELLED`
  exige actor y motivo (3–500 caracteres recortados); en otro estado ambos son
  `NULL`.
- Índice único parcial `(publication_id, requester_id) WHERE status IN
  ('PENDING','APPROVED')` para una solicitud activa por publicación/solicitante.
- Índice único parcial `(publication_id) WHERE status = 'APPROVED'` para
  garantizar una sola aprobación por publicación.
- `created_at` y `updated_at` son marcas de la fila. `updated_at` no es la fecha
  de aprobación, rechazo o cancelación.
- La finalización CU8 agrega `completed_at`, `completed_by_id` y `return_notes`
  a `recovery_requests`.

### Creación

- Solo sobre publicaciones `FOUND` `ACTIVE`; el solicitante no puede ser el
  propietario.
- `notes` es opcional, se recorta y admite hasta 500 caracteres.
- La transacción bloquea la publicación y revalida el estado antes de insertar.
- Publicación inexistente, no `ACTIVE` o no `FOUND`: `404
  PUBLICATION_NOT_FOUND`. No se define `PUBLICATION_NOT_AVAILABLE`.

### Aprobación y rechazo

- Solo el propietario aprueba o rechaza una `PENDING`; ADMIN no lo hace en CU7.
- La aprobación bloquea la publicación (`pessimistic_write`), exige `ACTIVE`,
  bloquea la solicitud, exige `PENDING`, comprueba que no exista otra `APPROVED`
  y, en la misma transacción, pasa la solicitud a `APPROVED`, la publicación a
  `RESERVED` y las demás `PENDING` a `REJECTED`.
- El índice único parcial de `APPROVED` es la garantía final ante carreras.
- Una publicación `RESERVED` no admite nuevas solicitudes ni aprobaciones.

### Cancelación

- El solicitante cancela su `PENDING`. El solicitante, el propietario o un
  ADMIN cancelan una `APPROVED`.
- Toda cancelación exige `reason` obligatorio, recortado, de 3 a 500 caracteres,
  aportado por el actor. El servidor deriva `cancelled_by_id` y guarda
  `cancellation_reason`.
- Cancelar una `APPROVED` usa una única transacción con bloqueo pesimista de la
  publicación: exige que siga `RESERVED` y que la solicitud sea la única
  `APPROVED` de la publicación. Solo entonces pasa a `CANCELLED` y la
  publicación a `ACTIVE`.
- Cualquier inconsistencia aborta sin reactivar la publicación con `409
  RECOVERY_REQUEST_CONFLICT`.

### Finalización y devolución

- Solo el propietario de la publicación puede completar la solicitud.
- Un ADMIN solo puede completar si es el propietario.
- La solicitud debe estar `APPROVED` y la publicación `RESERVED`.
- La transacción registra `completed_at`, `completed_by_id` y notas opcionales
  de devolución.
- La solicitud pasa a `COMPLETED` y la publicación a `RETURNED`.
- La confirmación del solicitante y una entidad de devolución separada quedan
  fuera de esta versión.

### Errores

- `PUBLICATION_NOT_FOUND` (404) para publicación inexistente, no `ACTIVE` o no
  `FOUND`, manteniendo el contrato de CU3/CU5.
- Códigos de solicitud: `RECOVERY_REQUEST_NOT_FOUND` (404),
  `RECOVERY_REQUEST_FORBIDDEN` (403), `RECOVERY_REQUEST_DUPLICATE`,
  `RECOVERY_REQUEST_NOT_PENDING`, `RECOVERY_REQUEST_NOT_CANCELLABLE` y
  `RECOVERY_REQUEST_CONFLICT` (409).
- Validación: `VALIDATION_ERROR` (400).

### Privacidad y frontend

- Las respuestas exponen `id`, estado, notas, motivo de cancelación, fechas,
  resumen público de la publicación y nombre visible del solicitante.
- Nunca exponen `ownerId`, `requesterId`, `cancelledById`, correo ni contacto.
- El detalle de una `FOUND` activa muestra el formulario. Las tarjetas de
  sugerencia `FOUND` enlazan a `#solicitar-recuperacion`.
- «Mis solicitudes» permite cancelar `PENDING`/`APPROVED`; «Solicitudes
  recibidas» permite aprobar/rechazar `PENDING` y cancelar `APPROVED`.
- Las fechas se etiquetan «Creada» y «Última actualización».

## Consecuencias

- Las lecturas públicas de CU3/CU6 no cambian: al reservar, la publicación
  desaparece; al cancelar la aprobada, reaparece si conserva coincidencias.
- La aprobación queda serializada por publicación y no puede dejar dos
  solicitudes `APPROVED`.
- Las listas no se paginan; es una limitación aceptada del MVP.
- La devolución se registra en un solo paso y no existe todavía confirmación del solicitante.
