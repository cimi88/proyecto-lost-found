# Design

## Context

Ver `proposal.md` para la motivación. El repositorio está en este estado:

- CU1–CU6 implementados y archivados. Specs principales: `publications` (27 requisitos), `publication-matching` (9) y `backend-foundation` (7). Sin cambios OpenSpec activos.
- No existe ningún módulo, tabla, contrato ni pantalla de solicitudes de recuperación. Solo están definidos el modelo de dominio (§3.2, §4.2) y el ADR 0006, que ya fijan: solo publicaciones `FOUND`, el solicitante no puede ser propietario, aprobar reserva la publicación y rechaza las demás pendientes, y cancelar una aprobada devuelve la publicación a `ACTIVE`.
- La identidad disponible es la costura demo (`DemoIdentityGuard` + `@CurrentUser`, `X-Demo-User-Id`), con un único usuario seed `demo@lostfound.local` (`USER`). `AUTH_MODE=jwt` existe como configuración, pero la integración JWT real es posterior.
- PostgreSQL tiene 3 migraciones aplicadas, 2 publicaciones de evidencia y 0 coincidencias. No hay tabla de solicitudes.
- El frontend tiene rutas `/`, `/found`, `/publications` y `/publications/:id`, con un nav de 3 enlaces. El detalle ya incluye información pública y coincidencias CU6.

## Goals / Non-Goals

**Goals:**

- Flujo completo de solicitud hasta `RESERVED`: crear, listar (propias/recibidas), aprobar, rechazar y cancelar.
- Reglas determinísticas y transaccionales, con protección ante duplicados y carreras.
- Privacidad: el propietario ve solo el nombre visible del solicitante, notas y fechas.
- UI coherente con CU5/CU6 y verificable de punta a punta.

**Non-Goals:**

- Devolución y estado `COMPLETED` (CU8).
- Cierre/edición de publicaciones propias y listado global de moderación (CU9).
- Aprobación/rechazo por ADMIN; en CU7 solo puede cancelar una `APPROVED` (ADR 0006).
- Notificaciones, correo, chat, MCP, JWT real, paginación de solicitudes y rate limiting.

## Decisions

### 1. Nueva capacidad y módulo aislado

Se crea `recovery-requests` como capacidad nueva y módulo NestJS independiente (`backend/src/recovery-requests`). Reutiliza `DemoIdentityGuard`, `@CurrentUser`, el `ValidationPipe` global y `ApiExceptionFilter`; no modifica controladores ni contratos de CU1–CU6.

**Alternativa descartada:** colgar todo de `PublicationsModule`. Mezclaría dos ciclos de vida y dificultaría las pruebas de permisos.

### 2. Esquema aditivo `recovery_requests`

Migración `AddRecoveryRequests` (timestamp posterior a CU6), reversible, sin tocar tablas existentes:

| Columna | Tipo | Regla |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `publication_id` | uuid | FK `publications(id)` `ON DELETE RESTRICT` |
| `requester_id` | uuid | FK `users(id)` `ON DELETE RESTRICT` |
| `status` | varchar(12) | `PENDING`/`APPROVED`/`REJECTED`/`CANCELLED`/`COMPLETED`; default `PENDING` |
| `notes` | varchar(500) | NULL permitido |
| `cancelled_by_id` | uuid | FK `users(id)` `ON DELETE RESTRICT`, NULL salvo cancelación |
| `cancellation_reason` | varchar(500) | NULL salvo cancelación |
| `created_at`, `updated_at` | timestamptz | defaults |

Restricciones e índices:

- `CHECK` de estados.
- `CHECK` de consistencia de cancelación: si `status='CANCELLED'`, actor y motivo no nulos; en otro estado, ambos nulos.
- Índice único parcial `(publication_id, requester_id) WHERE status IN ('PENDING','APPROVED')`.
- Índice único parcial `(publication_id) WHERE status = 'APPROVED'` para garantizar una sola aprobación por publicación.
- Índices `(publication_id, status)` y `(requester_id, status)`.
- `ON DELETE RESTRICT` en las tres FKs para preservar historial; las verificaciones eliminan primero sus propias solicitudes y luego sus publicaciones/usuarios de prueba.

**Alternativa descartada:** `ON DELETE CASCADE`. Borraría historial de solicitudes si se elimina una publicación o usuario. No hay borrado de publicaciones en la aplicación, así que RESTRICT es más seguro.

### 3. Transiciones y transacciones

```text
PENDING -> APPROVED   (propietario; publicación ACTIVE -> RESERVED; otras PENDING -> REJECTED)
PENDING -> REJECTED   (propietario)
PENDING -> CANCELLED  (solicitante; motivo obligatorio)
APPROVED -> CANCELLED (solicitante, propietario o ADMIN; publicación RESERVED -> ACTIVE; motivo obligatorio)
APPROVED -> COMPLETED (CU8; fuera de alcance)
```

- **Orden de bloqueo:** creación, aprobación y cancelación de una `APPROVED` bloquean primero la publicación (`pessimistic_write`) y luego la solicitud; `reject` y cancelación de `PENDING` bloquean solo la solicitud. Se mantiene el mismo orden para evitar deadlocks.
- **Creación:** dentro de la transacción se bloquea la publicación y se verifica que siga `FOUND`/`ACTIVE`; luego se comprueba el duplicado y se inserta. Una publicación `RESERVED` responde `404 PUBLICATION_NOT_FOUND`.
- **Aprobación:** bloquear la publicación; exigir `ACTIVE` (si no, `404 PUBLICATION_NOT_FOUND`); bloquear la solicitud; exigir `PENDING`; verificar que no exista una `APPROVED` para la publicación (si existe, `409 RECOVERY_REQUEST_CONFLICT`); pasar la solicitud a `APPROVED`, la publicación a `RESERVED` y las demás `PENDING` a `REJECTED`. El índice único parcial de `APPROVED` es la garantía final.
- **Cancelación de `APPROVED`:** bloquear la publicación; exigir `RESERVED`; bloquear la solicitud; exigir `APPROVED`; consultar con bloqueo las `APPROVED` de la publicación y exigir exactamente una, que sea la solicitud objetivo. Solo entonces pasar a `CANCELLED` y la publicación a `ACTIVE`. Cualquier inconsistencia aborta con `409 RECOVERY_REQUEST_CONFLICT` sin reactivar la publicación.
- **Motivo de cancelación:** el ADR 0006 exige registrar actor y motivo; por eso `reason` es obligatorio en toda cancelación (`PENDING` y `APPROVED`), lo proporciona el actor que cancela, se recorta y valida entre 3 y 500 caracteres (`400 VALIDATION_ERROR`, campo `reason`). El servidor deriva `cancelled_by_id`; nunca lo envía el cliente.
- Los estados terminales no se reabren; una `COMPLETED`, `REJECTED` o `CANCELLED` no se cancela.

### 4. Matriz de permisos

| Acción | Solicitante | Propietario | ADMIN | Otros autenticados |
|---|---|---|---|---|
| Crear sobre `FOUND` activa | Sí (si no es propietario) | No (`403`) | Sí (si no es propietario) | Sí |
| Ver `mine` | Solo sus solicitudes | — | — | — |
| Ver `received` | — | Solo sus publicaciones | No en CU7 | — |
| Aprobar / rechazar `PENDING` | No (`403`) | Sí | No (`403`) | No (`403`) |
| Cancelar `PENDING` | Sí | No (`403`) | No (`403`) | No (`403`) |
| Cancelar `APPROVED` | Sí | Sí | Sí | No (`403`) |

El rol `ADMIN` no obtiene listado global ni aprobación/rechazo en CU7; eso queda para CU9. En modo demo la identidad es spoofeable; las reglas se aplican igual y se documenta la limitación (ADR 0008).

### 5. API y contrato de errores

- `POST /api/v1/publications/:id/recovery-requests` → `201`; body `{notes?}`.
- `GET /api/v1/recovery-requests/mine` → `200` con arreglo ordenado `createdAt DESC, id DESC`.
- `GET /api/v1/recovery-requests/received` → `200` con arreglo ordenado.
- `POST /api/v1/recovery-requests/:id/approve` → `200`.
- `POST /api/v1/recovery-requests/:id/reject` → `200`.
- `POST /api/v1/recovery-requests/:id/cancel` → `200`; body `{reason}` (3..500, recortado).

Códigos nuevos, manteniendo `{ statusCode, code, message, details? }`:

| Situación | HTTP | `code` |
|---|---|---|
| Publicación inexistente, no `ACTIVE` o no `FOUND` | 404 | `PUBLICATION_NOT_FOUND` |
| Solicitud inexistente | 404 | `RECOVERY_REQUEST_NOT_FOUND` |
| Operación no permitida para el actor | 403 | `RECOVERY_REQUEST_FORBIDDEN` |
| Duplicado activo | 409 | `RECOVERY_REQUEST_DUPLICATE` |
| Aprobar/rechazar fuera de `PENDING` | 409 | `RECOVERY_REQUEST_NOT_PENDING` |
| Cancelar estado no cancelable | 409 | `RECOVERY_REQUEST_NOT_CANCELLABLE` |
| Inconsistencia de reserva o aprobación | 409 | `RECOVERY_REQUEST_CONFLICT` |
| Validación | 400 | `VALIDATION_ERROR` |
| Identidad demo | 401 | `DEMO_IDENTITY_REQUIRED` / `DEMO_IDENTITY_INVALID` |

`POST /publications/:id/recovery-requests` y la aprobación devuelven `404 PUBLICATION_NOT_FOUND` para publicación inexistente, no `ACTIVE` o no `FOUND`, sin revelar el estado. No existe un código `PUBLICATION_NOT_AVAILABLE`: la indisponibilidad de la publicación se mantiene bajo el contrato de CU3/CU5.

### 6. Respuesta y privacidad

`RecoveryRequestResponse`:

```json
{
  "id": "…",
  "status": "PENDING",
  "notes": "…",
  "cancellationReason": null,
  "createdAt": "…",
  "updatedAt": "…",
  "publication": {
    "id": "…",
    "type": "FOUND",
    "status": "ACTIVE",
    "title": "…",
    "description": "…",
    "category": "BAGS",
    "location": "…",
    "eventDate": "2024-05-10",
    "createdAt": "…"
  },
  "requesterDisplayName": "Usuario Demo"
}
```

- Sin `ownerId`, `requesterId` ni `cancelledById`; sin correo ni datos de contacto.
- `requesterDisplayName` se obtiene por join a `users` y es el único dato de identidad expuesto.
- `publication.status` permite al propietario y al solicitante entender el efecto de la aprobación incluso cuando el detalle público ya responde `404` por estar `RESERVED`.
- `createdAt` es la fecha de creación de la solicitud; `updatedAt` es la última modificación de la fila y **no** representa la fecha de aprobación, rechazo o cancelación. La UI usa «Creada» y «Última actualización»; no se agregan marcas de decisión.
- Las listas no se paginan en CU7 (MVP); se ordenan y se documenta la limitación. Las consultas se limitan por rol/relación, nunca devuelven solicitudes ajenas.

### 7. Relación con CU6 y lecturas públicas

- No se agrega relación persistida entre `publication_matches` y `recovery_requests`: la solicitud nace de una publicación, no de una sugerencia, y la coincidencia conserva su estado.
- En el detalle de una `FOUND` activa se muestra el formulario. En las tarjetas de sugerencia, solo si el candidato es `FOUND`, se agrega «Solicitar recuperación» hacia `/publications/:candidateId#solicitar-recuperacion`.
- Aprobar deja la publicación `RESERVED`; el listado, el detalle y `GET /publications/:id/matches` ya filtran `ACTIVE`, por lo que desaparece sin cambios adicionales en CU3/CU6.
- Cancelar una `APPROVED` devuelve `ACTIVE`; si conserva filas de coincidencias `SUGGESTED`, vuelven a mostrarse.

### 8. Frontend

- Detalle `/publications/:id`: si `type === 'FOUND'` y `status === 'ACTIVE'`, sección «Solicitar recuperación» con `notes` opcional (máx. 500), envío, estados de carga/error/éxito y el estado de la solicitud propia vigente. Si el fragmento es `#solicitar-recuperacion`, se enfoca/desplaza a la sección.
- `/recovery-requests` («Mis solicitudes»): listado, etiquetas ES (`Pendiente`, `Aprobada`, `Rechazada`, `Cancelada`, `Completada`), cancelación con motivo para `PENDING`/`APPROVED`.
- `/recovery-requests/received` («Solicitudes recibidas»): listado con nombre visible del solicitante, notas, estado y acciones aprobar/rechazar (`PENDING`) y cancelar (`APPROVED`) con motivo.
- Las fechas se etiquetan «Creada» y «Última actualización»; el estado actual comunica la decisión. No se muestra `updatedAt` como fecha de aprobación, rechazo o cancelación.
- Nav de 5 enlaces: Perdí, Encontré, Buscar, Mis solicitudes, Recibidas. Se actualizan los tests de rutas.
- Estados vacío/carga/error con reintento; sin exponer correo ni IDs internos; estilos coherentes con CU5/CU6.

### 9. Verificación

- Unitarias de servicio, DTOs, mapeo y migración; E2E con repositorios mockeados para todos los códigos y permisos.
- Frontend: servicios, detalle, ambas páginas, nav y rutas.
- `verify-cu7.ps1` real: migración aditiva, usuarios temporales propios (solicitante/otro/admin), publicaciones propias, flujo completo, duplicado, permisos, transiciones, privacidad, evidencias intactas y limpieza por ID exacto; sin `db:revert`.
- Regresiones `verify:cu1`–`verify:cu6` y suites de CU5/CU6.
- Navegador real con identidad demo (propietario y solicitante según fixtures) y limpieza.
- `openspec validate --strict`.

## Risks / Trade-offs

- **Identidad demo spoofeable:** no es autenticación real; las reglas de propietario/ADMIN se aplican pero pueden simularse localmente. Mitigación: documentarlo y mantener la costura reemplazable por JWT.
- **Publicación reservada sin detalle público:** tras aprobar, el propietario/solicitante la ven en sus listas, pero no en `/publications/:id` (404 por diseño). La vista de publicación propia queda para CU9.
- **Sin notificaciones:** ambas partes deben consultar sus páginas. Fuera de alcance.
- **Listas sin paginación:** válido para MVP; se documenta y se puede agregar en CU9.
- **Reintentos tras rechazo/cancelación:** permitidos; sin rate limiting podría haber spam. Fuera de alcance.
- **Cancelación exige motivo:** el ADR 0006 exige registrar actor y motivo; se aplica a `PENDING` y `APPROVED` con `reason` de 3 a 500 caracteres, sin excepciones.
- **Exclusividad de aprobación:** se refuerza con índice único parcial de `APPROVED` y verificación transaccional; ante inconsistencia, `409 RECOVERY_REQUEST_CONFLICT` y no se toca la publicación.
- **ADMIN limitado:** solo cancela `APPROVED`; aprobar/rechazar y moderación global quedan para CU9.

## Migration Plan

1. Aplicar `AddRecoveryRequests` (aditiva) y verificar tabla, checks, índice único parcial por publicación+solicitante, índice único parcial de una `APPROVED` por publicación e índices de consulta.
2. Desplegar backend y frontend; no hay migración de datos.
3. Rollback: `down` elimina únicamente `recovery_requests`; no afecta publicaciones, usuarios, coincidencias ni evidencias. La verificación real no ejecuta `db:revert` sobre la base de desarrollo.
4. Ejecutar `verify:cu7` y regresiones; limpiar fixtures propios por ID exacto.

## Open Questions

Ninguna bloqueante. Las seis decisiones funcionales fueron confirmadas por el usuario: flujo completo hasta `RESERVED`; notas opcionales y nombre visible; 404 para publicación no apta; propietario decide y ADMIN solo cancela; una solicitud activa por usuario/publicación; detalle más dos páginas con dos enlaces de nav.
