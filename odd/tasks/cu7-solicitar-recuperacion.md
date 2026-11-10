# CU7 — Solicitar recuperación

Objetivo: implementar el flujo completo de solicitud de recuperación sobre
publicaciones `FOUND` activas, desde la creación hasta la decisión del
propietario, con publicación `RESERVED` al aprobar y trazabilidad del
actor/motivo de cancelación.

Rama: `main` (sin commits ni push por pedido del usuario). Entrega: un solo árbol
de trabajo, sin slices commiteados.

Estado: **implementado y verificado**. La devolución y `COMPLETED` no se
implementaron: pertenecen a CU8. No se inició CU8 ni se modificaron las
evidencias de CU1–CU6.

## 1. Estado previo inspeccionado

- Specs principales antes de CU7: `publications` (27 requisitos),
  `publication-matching` (9) y `backend-foundation` (7).
- CU1–CU6 archivados; CU6 en
  `openspec/changes/archive/2026-11-07-cu6-sugerir-coincidencias/`.
- Identidad disponible: `DemoIdentityGuard` + `@CurrentUser` con
  `X-Demo-User-Id`; `AUTH_MODE=jwt` previsto sin implementar (ADR 0008).
- No existía módulo, tabla, contrato ni pantalla de solicitudes.
- PostgreSQL tenía 3 migraciones, 2 publicaciones de evidencia, 0 coincidencias
  y 1 usuario demo `USER`.

## 2. Decisiones implementadas

1. **Alcance:** crear, listar propias/recibidas, aprobar, rechazar y cancelar
   `PENDING`/`APPROVED`; `COMPLETED` y devolución quedan para CU8.
2. **Datos y privacidad:** `notes` opcional (máx. 500, recortado); el propietario
   ve nombre visible del solicitante, notas, estado y fechas; nunca correo ni
   IDs internos (`ownerId`, `requesterId`, `cancelledById`).
3. **Publicación no apta:** `404 PUBLICATION_NOT_FOUND` para inexistente, no
   `ACTIVE` o no `FOUND`, también al aprobar. No existe
   `PUBLICATION_NOT_AVAILABLE`.
4. **Permisos:** aprobar/rechazar solo el propietario; cancelar `PENDING` solo el
   solicitante; cancelar `APPROVED` solicitante, propietario o ADMIN; ADMIN no
   aprueba/rechaza en CU7.
5. **Duplicados:** una sola `PENDING`/`APPROVED` por publicación y solicitante;
   tras `REJECTED`/`CANCELLED` se puede crear otra.
6. **Exclusividad de aprobación:** una sola `APPROVED` por publicación mediante
   índice único parcial y verificación transaccional; una `RESERVED` no admite
   solicitudes ni aprobaciones.
7. **Cancelación de `APPROVED`:** una única transacción con bloqueo pesimista de
   la publicación; exige que siga `RESERVED` y que la solicitud sea la única
   `APPROVED` que justifica la reserva. Ante inconsistencia aborta con `409
   RECOVERY_REQUEST_CONFLICT` sin reactivar.
8. **Motivo de cancelación:** obligatorio para `PENDING` y `APPROVED` (ADR 0006),
   aportado por el actor, recortado y validado entre 3 y 500 caracteres; se
   almacenan `cancelled_by_id` y `cancellation_reason`.
9. **Fechas:** `createdAt` es la creación y `updatedAt` la última modificación de
   la fila; no son fechas de decisión y no se agregaron timestamps de decisión.
10. **Interfaz:** formulario en detalle `FOUND`, CTA en sugerencias `FOUND`,
    «Mis solicitudes», «Solicitudes recibidas» y nav de 5 enlaces.

## 3. Máquina de estados implementada

```text
PENDING -> APPROVED   (propietario; publicación ACTIVE -> RESERVED; otras PENDING -> REJECTED)
PENDING -> REJECTED   (propietario)
PENDING -> CANCELLED  (solicitante; motivo obligatorio)
APPROVED -> CANCELLED (solicitante, propietario o ADMIN; publicación RESERVED -> ACTIVE; motivo obligatorio)
APPROVED -> COMPLETED (fuera de CU7; CU8)
```

Los estados terminales no se reabren. El orden de bloqueo es publicación →
solicitud para creación, aprobación y cancelación de `APPROVED`; rechazo y
cancelación de `PENDING` bloquean solo la solicitud.

## 4. Persistencia implementada

Migración `AddRecoveryRequests1794100000000`, aditiva y reversible; `down`
elimina solo `recovery_requests`.

- `id` uuid PK, `publication_id`/`requester_id`/`cancelled_by_id` con FKs
  `ON DELETE RESTRICT`.
- `status` varchar(12) con `CHECK` de estados y default `PENDING`.
- `notes` varchar(500) nullable.
- `cancellation_reason` varchar(500) nullable y `CHECK` de consistencia:
  `CANCELLED` exige actor y motivo (3–500 recortados); otro estado los mantiene
  nulos.
- `created_at`/`updated_at` timestamptz.
- Índice único parcial `(publication_id, requester_id) WHERE status IN
  ('PENDING','APPROVED')`.
- Índice único parcial `(publication_id) WHERE status = 'APPROVED'`.
- Índices `(publication_id, status)` y `(requester_id, status)`.

La migración se aplicó realmente en `lostfound_dev`; `db:show` la lista como
ejecutada y `synchronize` sigue desactivado.

## 5. API implementada

| Método y ruta | Acceso | Resultado |
|---|---|---|
| `POST /api/v1/publications/:id/recovery-requests` | autenticado, no propietario | `201` `PENDING`; `404` publicación no apta; `403` propietario; `409` duplicado; `400` validación |
| `GET /api/v1/recovery-requests/mine` | autenticado | `200` solicitudes propias |
| `GET /api/v1/recovery-requests/received` | autenticado | `200` solicitudes de publicaciones propias |
| `POST /api/v1/recovery-requests/:id/approve` | propietario | `200` `APPROVED`; publicación `RESERVED`; demás `PENDING` `REJECTED`; `404` publicación no `ACTIVE`; `409` no `PENDING`/otra `APPROVED` |
| `POST /api/v1/recovery-requests/:id/reject` | propietario | `200` `REJECTED`; publicación sin cambios |
| `POST /api/v1/recovery-requests/:id/cancel` | solicitante `PENDING`; solicitante/propietario/ADMIN `APPROVED` | `200` `CANCELLED`; motivo obligatorio; verificación transaccional de reserva; `409 RECOVERY_REQUEST_CONFLICT` ante inconsistencia |

Respuesta sin datos privados: `id`, `status`, `notes`, `cancellationReason`,
`createdAt`, `updatedAt`, resumen público de la publicación y
`requesterDisplayName`. Códigos nuevos: `RECOVERY_REQUEST_FORBIDDEN`,
`RECOVERY_REQUEST_NOT_FOUND`, `RECOVERY_REQUEST_DUPLICATE`,
`RECOVERY_REQUEST_NOT_PENDING`, `RECOVERY_REQUEST_NOT_CANCELLABLE` y
`RECOVERY_REQUEST_CONFLICT`.

## 6. Archivos creados/modificados

### Backend

- `backend/src/recovery-requests/domain/recovery-request-status.ts` + spec.
- `backend/src/recovery-requests/recovery-request.entity.ts` + spec.
- `backend/src/recovery-requests/dto/create-recovery-request.dto.ts`.
- `backend/src/recovery-requests/dto/cancel-recovery-request.dto.ts` + spec.
- `backend/src/recovery-requests/recovery-request-response.ts`.
- `backend/src/recovery-requests/recovery-requests.service.ts` + spec.
- `backend/src/recovery-requests/recovery-requests.controller.ts`.
- `backend/src/recovery-requests/recovery-requests.module.ts`.
- `backend/src/database/migrations/1794100000000-AddRecoveryRequests.ts` + spec.
- `backend/test/recovery-requests.e2e-spec.ts`.
- `backend/src/config/database.config.ts`.
- `backend/src/app.module.ts`.
- `backend/package.json` (`verify:cu7`, alias `verify:cu5`).
- `backend/README.md`.

### Contrato y documentación

- `contracts/v1/recovery-request.ts`.
- `contracts/v1/README.md`.
- `docs/adr/0009-recovery-requests.md`.
- `docs/adr/README.md`.
- `docs/domain-model.md`.
- `docs/architecture.md`.
- `odd/tasks/cu7-solicitar-recuperacion.md`.

### Frontend

- `frontend/src/app/recovery-requests/models/recovery-request.models.ts`.
- `frontend/src/app/recovery-requests/services/recovery-requests.service.ts` +
  spec.
- `frontend/src/app/recovery-requests/components/recovery-request-panel.component.{ts,html,scss,spec.ts}`.
- `frontend/src/app/recovery-requests/pages/my-recovery-requests-page.component.{ts,html,spec.ts}`.
- `frontend/src/app/recovery-requests/pages/received-recovery-requests-page.component.{ts,html,spec.ts}`.
- `frontend/src/app/recovery-requests/pages/recovery-requests-page.scss`.
- `frontend/src/app/publications/pages/publication-detail-page.component.{ts,html,scss,spec.ts}`.
- `frontend/src/app/publications/models/publication-search.models.ts`.
- `frontend/src/app/app.routes.ts`, `frontend/src/app/app.html`,
  `frontend/src/app/app.routes.spec.ts`.
- `frontend/README.md`.

### Verificación

- `scripts/verify-cu7.ps1`.

## 7. Verificaciones ejecutadas realmente

### Backend

- `npm test -- --runInBand`: **21 suites, 203 tests, 0 fallos**.
- `npm run test:e2e -- --runInBand`: **7 suites, 62 tests, 0 fallos**.
- `npm run build`: **verde**.
- `npm run db:migrate`: aplicó `AddRecoveryRequests1794100000000`.
- `npm run db:show`: 4 migraciones `[X]`, incluida
  `AddRecoveryRequests1794100000000`.
- `npm run verify:cu7`: **47 verificaciones PASS** contra PostgreSQL real.
  Cubrió migración, tabla, índices, constraints, creación, duplicado, listas,
  permisos, aprobación con rechazo de otras, exclusividad de una sola
  `APPROVED` (incluida prueba SQL del índice), rechazo, cancelación `PENDING` y
  `APPROVED`, reserva inconsistente sin reactivación, privacidad, `404` de
  publicación no apta, evidencias intactas y limpieza por ID exacto.

### Frontend

- `npm test -- --watch=false`: **14 archivos, 89 tests, 0 fallos**.
- `npm run build`: **verde**.

### Regresiones reales

Todas ejecutadas contra PostgreSQL:

- `verify:cu1`: 14 PASS.
- `verify:cu2`: 15 PASS.
- `verify:cu3`: 47 PASS.
- `verify:cu4`: 46 PASS.
- `verify:cu5`: 47 PASS (alias documentado a la cobertura de CU3/CU5).
- `verify:cu6`: 34 PASS.

Las evidencias de CU1/CU2 y la tabla de coincidencias quedaron intactas.

### Navegador real

El conector de navegador de OpenCode no tenía un navegador conectado. Se ejecutó
una prueba real con **Chrome 156 headless** vía DevTools Protocol (CDP), sin
dependencias nuevas. Resultado: **11 controles PASS**:

1. «Solicitudes recibidas» muestra nombre visible, estado y fechas sin correo.
2. Nav con 5 enlaces correctos.
3. Aprobación deja la publicación `Reservada`.
4. La publicación reservada responde «no encontrada» en el detalle público.
5. Cancelar la aprobada reactiva la publicación.
6. El detalle `FOUND` activo muestra el formulario.
7. El fragmento `#solicitar-recuperacion` enfoca la sección.
8. La solicitud creada muestra estado `Pendiente` y fechas.
9. Cancelar una `PENDING` desde «Mis solicitudes» registra motivo.
10. Tras cancelar, el detalle vuelve a ofrecer el formulario.
11. Sin errores de consola no esperados (solo el 404 esperado de la publicación
    reservada).

Capturas en
`C:\Users\pcboxuser\AppData\Local\Temp\cu7-browser-evidence\`:
`01-received-approved.png`, `02-received-cancelled.png`,
`03-detail-request-created.png`, `04-my-requests-cancelled.png`.
Los fixtures de navegador se eliminaron por ID exacto.

### OpenSpec

- `openspec validate cu7-solicitar-recuperacion --strict`: **válido, 0 fallos**.
- Delta `recovery-requests`: 14 requisitos `ADDED`, 43 escenarios.
- `tasks.md`: 24/24 tareas completadas.

## 8. Estado final de PostgreSQL

- Migraciones: 4 (`InitialSchema`, `AddPublicationSearchIndexes`,
  `AddPublicationMatching`, `AddRecoveryRequests`).
- Publicaciones: 2 (las evidencias de CU1/CU2).
- Solicitudes de recuperación: 0.
- Coincidencias: 0.
- Usuarios: 1 (demo).
- No se ejecutó `db:revert` ni borrados generales; las limpiezas usaron IDs
  exactos.

## 9. Estado de Git y OpenSpec

- Rama `main`, HEAD `b76f358f496fef0659759d6ff420bdfd04dd56e1`.
- Sin commits ni push.
- CU7 archivado en `openspec/changes/archive/2026-11-07-cu7-solicitar-recuperacion/`
  y spec `recovery-requests` sincronizada en `openspec/specs/` con 14 requisitos.
- CU8 no iniciado.

## 10. Riesgos y limitaciones vigentes

- La identidad demo es spoofeable; no equivale a autenticación real hasta JWT.
- Tras `RESERVED`, la publicación no tiene detalle público; el propietario la ve
  en «Solicitudes recibidas» hasta CU9.
- Sin notificaciones ni correo.
- Listas sin paginación en el MVP.
- Reintentos tras rechazo/cancelación permitidos; sin rate limiting.
- No hay vínculo persistido entre la coincidencia CU6 y la solicitud.
- El propietario que abre el detalle de su propia `FOUND` activa ve el
  formulario y recibe `403` si intenta solicitar; no se expone `ownerId` para
  ocultarlo. Limitación de UX aceptada para CU7.
