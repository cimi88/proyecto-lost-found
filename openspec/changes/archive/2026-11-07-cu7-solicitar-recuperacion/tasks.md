# Tasks

## 1. Dominio y persistencia

- [x] 1.1 Crear el tipo de estado `RecoveryRequestStatus` (`PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`, `COMPLETED`) y sus guardas/etiquetas internas. Verificación: tests de tipos y valores válidos/inválidos.
- [x] 1.2 Crear la migración aditiva y reversible `AddRecoveryRequests` con tabla `recovery_requests`, FKs `ON DELETE RESTRICT`, `CHECK` de estados y consistencia de cancelación, índice único parcial `(publication_id, requester_id) WHERE status IN ('PENDING','APPROVED')`, índice único parcial `(publication_id) WHERE status = 'APPROVED'`, índices por publicación/solicitante y `down` que elimina solo esa tabla. Verificación: spec de migración comprueba sentencias up/down y `db:show` la lista como pendiente antes de aplicar.
- [x] 1.3 Crear la entidad `RecoveryRequest`, registrarla en `database.config.ts` y verificar metadata (columnas, nombres, precisión y relación con `Publication`/`User`). Verificación: build del backend y spec de metadata; `synchronize` sigue desactivado.

## 2. Backend y reglas de negocio

- [x] 2.1 Crear `CreateRecoveryRequestDto` (`notes` opcional, recortado, máximo 500) y `CancelRecoveryRequestDto` (`reason` obligatorio, 3–500, recortado), con rechazo de campos desconocidos. Verificación: specs de DTO cubren límites, trim y `forbidNonWhitelisted`.
- [x] 2.2 Implementar en `RecoveryRequestsService` la creación transaccional (bloqueo de publicación, solo `FOUND` `ACTIVE`, propietario no solicitante, `PENDING`, `404` para publicación no apta, mapeo de violación única a `409 RECOVERY_REQUEST_DUPLICATE`) y las listas `mine`/`received` (scope por relación, orden `createdAt DESC, id DESC`, join de nombre visible y resumen público). Verificación: unit tests de reglas, duplicado, scoping y serialización sin IDs/correo.
- [x] 2.3 Implementar aprobación, rechazo y cancelación con transacciones, orden de bloqueo publicación→solicitud y `pessimistic_write`: aprobar exige publicación `ACTIVE`, solicitud `PENDING`, ausencia de otra `APPROVED`, reserva y rechaza las demás `PENDING`; rechazar solo cambia la solicitud; cancelar exige motivo, registra actor y verifica que la publicación siga `RESERVED` y la solicitud sea la única `APPROVED` antes de reactivar; inconsistencias `409 RECOVERY_REQUEST_CONFLICT` sin reactivar; permisos `403`. Verificación: unit tests de transiciones, carreras simuladas, estados terminales, reserva inconsistente y matriz de permisos.
- [x] 2.4 Crear el controlador `RecoveryRequestsController` y registrar el módulo: `POST /publications/:id/recovery-requests`, `GET /recovery-requests/mine`, `GET /recovery-requests/received`, `POST /recovery-requests/:id/approve|reject|cancel`, con `DemoIdentityGuard`, UUID validado y contrato de errores. Verificación: e2e con repositorios mockeados cubre 201, 200, 400, 401, 403, 404 y 409, sin `PUBLICATION_NOT_AVAILABLE`, y ausencia de datos privados.
- [x] 2.5 Crear `scripts/verify-cu7.ps1` y `verify:cu7`: migración aditiva, usuarios temporales propios (solicitante/otro/admin), publicaciones propias, flujo completo (crear, duplicado, aprobar con rechazo de otras, rechazar, cancelar `PENDING` y `APPROVED`), exclusividad de una sola `APPROVED`, reserva inconsistente sin reactivación, permisos, privacidad, `404` de publicación no apta, evidencias CU1/CU2 intactas y limpieza por ID exacto; sin `db:revert` ni borrados generales. Verificación: cada fase PASS y no quedan filas propias.
- [x] 2.6 Documentar endpoints, estados, errores y limitaciones en `backend/README.md`. Verificación: ejemplos y comandos coinciden con controlador, servicio y `package.json`.

## 3. Contrato y documentación

- [x] 3.1 Crear `contracts/v1/recovery-request.ts` con estados, creación, cancelación, respuesta, semántica de `createdAt`/`updatedAt` y códigos de error; actualizar `contracts/v1/README.md`. Verificación: tipos sincronizados con backend/frontend y pruebas E2E del shape.
- [x] 3.2 Crear ADR 0009 con las decisiones aprobadas (alcance, notas/nombre visible, 404 sin `PUBLICATION_NOT_AVAILABLE`, permisos, duplicado, exclusividad de `APPROVED`, motivo de cancelación y semántica de fechas) y actualizar `docs/domain-model.md` (§3.2/§4.2) y `docs/architecture.md` (§4, §8). Verificación: documentos describen exactamente el comportamiento cubierto por tests.

## 4. Frontend

- [x] 4.1 Crear modelos y `RecoveryRequestsService` Angular (crear, mine, received, approve, reject, cancel) y sus specs. Verificación: URL/método/body, mapeo de estados y errores.
- [x] 4.2 Integrar en el detalle de una `FOUND` activa la sección «Solicitar recuperación» con notas opcionales, estados carga/error/éxito, solicitud propia vigente, mensajes para 403/404/409, foco/scroll con fragmento `#solicitar-recuperacion` y fechas etiquetadas «Creada»/«Última actualización» (nunca como fecha de decisión). Verificación: component specs cubren los estados y la ausencia de datos privados.
- [x] 4.3 Agregar en las tarjetas de sugerencia CU6 la acción «Solicitar recuperación» solo cuando el candidato es `FOUND`, enlazando al detalle con el fragmento. Verificación: component spec confirma que aparece solo para `FOUND` y navega correctamente.
- [x] 4.4 Crear `/recovery-requests` («Mis solicitudes») con listado, etiquetas ES, fechas «Creada»/«Última actualización», estados carga/vacío/error y cancelación con motivo para `PENDING`/`APPROVED`. Verificación: page specs cubren render, acciones, validación y errores.
- [x] 4.5 Crear `/recovery-requests/received` («Solicitudes recibidas») con nombre visible del solicitante, notas, estado, fechas «Creada»/«Última actualización» y acciones aprobar/rechazar/cancelar con motivo. Verificación: page specs cubren permisos, transiciones y estados.
- [x] 4.6 Actualizar rutas y nav (5 enlaces), estilos coherentes con CU5/CU6 y `frontend/README.md`. Verificación: route/app specs actualizados; build y pruebas frontend en verde.

## 5. Verificación e integración

- [x] 5.1 Ejecutar `npm test --prefix backend`, `npm run test:e2e --prefix backend` y `npm run build --prefix backend`. Verificación: suites completas y build en verde.
- [x] 5.2 Ejecutar `npm test --prefix frontend -- --watch=false` y `npm run build --prefix frontend`. Verificación: todos los archivos de prueba y el build en verde.
- [x] 5.3 Ejecutar `npm run verify:cu7 --prefix backend` contra PostgreSQL real. Verificación: flujo completo y limpieza acotada PASS; evidencias intactas.
- [x] 5.4 Ejecutar regresiones `verify:cu1` a `verify:cu6`, incluidas las suites de detalle CU5 y coincidencias CU6. Verificación: todas en verde y evidencias CU1/CU2 conservadas.
- [x] 5.5 Verificar el flujo real de navegador: solicitud desde detalle `FOUND`, aprobación/rechazo desde «Solicitudes recibidas», cancelación desde «Mis solicitudes», publicación `RESERVED` oculta en lecturas públicas y sin admitir nuevas solicitudes/aprobaciones, regreso a `ACTIVE` al cancelar la aprobada, fechas rotuladas «Creada»/«Última actualización»; sin datos privados ni errores de consola. Verificación: resultado y limpieza registrados en ODD.
- [x] 5.6 Ejecutar `openspec validate cu7-solicitar-recuperacion --strict`. Verificación: delta `recovery-requests` sin advertencias estrictas.
- [x] 5.7 Completar `odd/tasks/cu7-solicitar-recuperacion.md` con resultados reales, archivos, migración, estados y decisiones. Verificación: ODD refleja solo verificaciones ejecutadas.

## Workflow follow-up

- Archivar CU7 y sincronizar `recovery-requests` en `openspec/specs/` solo después de la revisión y autorización explícita del usuario.
- No iniciar CU8 ni realizar commits/push sin autorización explícita.
