# CU2 — Registrar objeto encontrado

Objetivo: vertical slice completo (Angular → NestJS → PostgreSQL) para registrar una publicación `FOUND`, reutilizando la estructura de CU1 sin regresiones.
Rama: `main` (sin commits ni push por pedido del usuario). Entrega: un solo árbol de trabajo, sin slices commiteados.
Runner: backend Jest 30.5.2 + ts-jest (`npm test`, `npm run test:e2e`); frontend Angular CLI (`npm test -- --watch=false`); verificación real `scripts/verify-cu2.ps1`, flujo de navegador en `/found` y regresión completa con `scripts/verify-cu1.ps1`.

## Specs

- **S1** — Incorporar el endpoint `POST /api/v1/found-publications`.
- **S2** — Registrar publicaciones con `type = FOUND` y `status = ACTIVE`.
- **S3** — Obtener el propietario desde la identidad autenticada mediante el mecanismo actual (`DemoIdentityGuard` y `@CurrentUser()`).
- **S4** — Incorporar el formulario Angular en `/found`.
- **S5** — Mantener intacto el flujo de CU1 en `/`.
- **S6** — Reutilizar las categorías, validaciones y reglas existentes.
- **S7** — No duplicar validaciones: extraer o reutilizar un DTO común y verificar que la herencia funcione correctamente con `class-validator` y `class-transformer`.
- **S8** — El backend debe establecer `FOUND`, `ACTIVE` y `ownerId` utilizando valores del servidor. Nunca debe confiar en esos campos enviados por el cliente.
- **S9** — Probar expresamente que enviar `type = LOST`, `status = CLOSED` u otro `ownerId` no permita manipular los valores persistidos.
- **S10** — Reutilizar componentes y validadores de Angular. Extraer elementos compartidos únicamente cuando sea sencillo y necesario. No hacer refactorizaciones generales de CU1.
- **S11** — El endpoint y la interfaz de CU1 deben seguir funcionando sin regresiones.
- **S12** — No agregar migraciones si el esquema actual ya soporta el tipo `FOUND`.
- **S13** — El script `scripts/verify-cu2.ps1` debe limpiar exclusivamente los registros que él mismo haya creado. No debe eliminar ni modificar datos de CU1, incluida la publicación E2E que conservamos como evidencia.
- **S14** — Crear y validar el cambio OpenSpec correspondiente a CU2. Actualizar los contratos TypeScript y la documentación que corresponda. Crear o actualizar `odd/tasks/cu2-registrar-objeto-encontrado.md`. Mantener la documentación en español, respetando las convenciones existentes del proyecto.
- **S15** — No modificar ni reescribir especificaciones históricas de CU1 o de la etapa 0.2.
- **S16** — Pruebas: DTO y validaciones; persistencia de `FOUND`, `ACTIVE` y propietario correcto; rechazo de datos inválidos; protección frente a la manipulación de campos controlados por el servidor; respuestas HTTP 201, 400 y 401 según corresponda; formulario Angular (validaciones, envío correcto, confirmación y errores); funcionamiento independiente de las rutas `/` y `/found`.
- **S17** — Ejecutar: pruebas unitarias y de integración del backend; pruebas del frontend; builds de backend y frontend; validación OpenSpec; verificación real de CU2 contra PostgreSQL; regresión completa de CU1, incluyendo `scripts/verify-cu1.ps1`.
- **S18** — No declarar una verificación exitosa si no se ejecutó realmente el comando correspondiente.
- **S19** — Restricciones: no implementar CU3 ni ningún otro caso de uso; no desarrollar el chatbot, el matching ni el servidor MCP propio; no instalar dependencias innecesarias; no realizar cambios destructivos en PostgreSQL; no modificar ni eliminar la evidencia persistida de CU1; no realizar commits ni push; preservar todos los cambios pendientes existentes en Git, aunque no estén relacionados con CU2.
- **S20** — Al terminar, informar los ocho puntos de entrega (archivos, endpoint/comportamiento, interfaz, pruebas reales, regresión CU1, estado de PostgreSQL, OpenSpec/documentación, pendientes) y detenerse a esperar revisión antes de avanzar.

## Tasks

| ID | Descripción | Specs | Ruta | Estado |
|---|---|---|---|---|
| T1 | Documento de feature CU2 y espejo Engram | S14 | inline | Completada |
| T2 | Backend: DTO común `CreatePublicationDto`, `CreateFoundPublicationDto`, herencia verificada | S6, S7 | delegated (writer paralelo) | Completada |
| T3 | Backend: `FoundPublicationResponse`, `createFoundPublication` con helper privado compartido | S2, S6, S8 | delegated (writer paralelo) | Completada |
| T4 | Backend: controlador `v1/found-publications` con `DemoIdentityGuard` + registro en módulo | S1, S3 | delegated (writer paralelo) | Completada |
| T5 | Backend: pruebas DTO/servicio/e2e incl. anti-spoof de `type`/`status`/`ownerId` | S7, S9, S16 | delegated (writer paralelo) | Completada |
| T6 | Backend: README (endpoint found + `verify:cu2`) y script en `package.json` | S14 | delegated (writer paralelo) | Completada |
| T7 | Frontend: modelos y servicio found (`/v1/found-publications`) | S6 | delegated (writer paralelo) | Completada |
| T8 | Frontend: página `/found` + navegación del shell, CU1 intacto en `/` | S4, S5, S10 | delegated (writer paralelo) | Completada |
| T9 | Frontend: pruebas de componente y de rutas independientes | S16 | delegated (writer paralelo) | Completada |
| T10 | Frontend: README | S14 | delegated (writer paralelo) | Completada |
| T11 | Contratos v1: `found-publication.ts`, README de contratos, comentario de sincronización del contrato lost | S14 | inline | Completada |
| T12 | `docs/architecture.md`: endpoint, ruta `/found` y reutilización de la costura demo | S14 | inline | Completada |
| T13 | Cambio OpenSpec `cu2-registrar-objeto-encontrado` (proposal/specs/design/tasks) + validación | S14, S15 | inline | Completada |
| T14 | `scripts/verify-cu2.ps1` (limpieza acotada a sus filas) + `scripts/README.md` | S13 | inline | Completada |
| T15 | Verificación completa: suites backend/frontend, builds, OpenSpec, `verify:cu2` real, regresión CU1 con `verify:cu1`, flujo real `/found` | S11, S17, S18 | inline | Completada |
| T16 | Cierre: feature doc, espejo Engram y reporte final de entrega | S20 | inline | Completada |

### Evidencia observada (2026-11-06)

- Backend: `npm test` 9 suites / 70 pruebas PASS; `npm run test:e2e` 3 suites / 12 pruebas PASS; `npm run build` OK.
- Frontend: `npm test -- --watch=false` 6 archivos / 23 pruebas PASS; `npm run build` OK (chunks lazy de lost y found).
- OpenSpec: `openspec validate cu2-registrar-objeto-encontrado --strict` válido.
- PostgreSQL real: `verify:cu2` 15/15 PASS (incluye anti-spoof y limpieza por ID propio); `verify:cu1` 14/14 PASS.
- Flujo real `/found`: POST `201` con `X-Demo-User-Id`, fila `12702eca-9ef6-4a03-9421-e980ae06e0c4` (FOUND/ACTIVE/demo) persistida y recuperada, sin errores de consola; evidencia CU1 `82d35348-d8b3-4149-9ac7-4a8cbb0fe1ec` intacta.
- Verificación independiente (`gentle-ai-verify`): sin blockers; S1–S16, S18 y S19 en `cumple`; S17/S20 no verificables por su alcance read-only (builds y scripts reales los ejecutó el orquestador).

## Log

### L1 — Solicitud de implementación (verbatim)

> Implementá el **Caso de Uso 2 (CU2): Registrar objeto encontrado**, siguiendo estrictamente la propuesta que acabamos de analizar y las decisiones de arquitectura del proyecto.
>
> La implementación está autorizada. Podés crear y modificar los archivos necesarios para CU2, ejecutar comandos y pruebas.
>
> **Alcance funcional**
>
> 1. Incorporar el endpoint `POST /api/v1/found-publications`.
> 2. Registrar publicaciones con `type = FOUND` y `status = ACTIVE`.
> 3. Obtener el propietario desde la identidad autenticada mediante el mecanismo actual (`DemoIdentityGuard` y `@CurrentUser()`).
> 4. Incorporar el formulario Angular en `/found`.
> 5. Mantener intacto el flujo de CU1 en `/`.
> 6. Reutilizar las categorías, validaciones y reglas existentes.
>
> **Reglas obligatorias**
>
> - No duplicar validaciones: extraé o reutilizá un DTO común y verificá que la herencia funcione correctamente con `class-validator` y `class-transformer`.
> - El backend debe establecer `FOUND`, `ACTIVE` y `ownerId` utilizando valores del servidor. Nunca debe confiar en esos campos enviados por el cliente.
> - Probá expresamente que enviar `type = LOST`, `status = CLOSED` u otro `ownerId` no permita manipular los valores persistidos.
> - Reutilizá componentes y validadores de Angular. Extraé elementos compartidos únicamente cuando sea sencillo y necesario. No hagas refactorizaciones generales de CU1.
> - El endpoint y la interfaz de CU1 deben seguir funcionando sin regresiones.
> - No agregues migraciones si el esquema actual ya soporta el tipo `FOUND`.
> - El script `scripts/verify-cu2.ps1` debe limpiar exclusivamente los registros que él mismo haya creado. No debe eliminar ni modificar datos de CU1, incluida la publicación E2E que conservamos como evidencia.
>
> **Documentación y especificaciones**
>
> - Crear y validar el cambio OpenSpec correspondiente a CU2.
> - Actualizar los contratos TypeScript y la documentación que corresponda.
> - Crear o actualizar `odd/tasks/cu2-registrar-objeto-encontrado.md`.
> - Mantener la documentación en español, respetando las convenciones existentes del proyecto.
> - No modificar ni reescribir especificaciones históricas de CU1 o de la etapa 0.2.
>
> **Pruebas y verificaciones**
>
> Implementá pruebas para:
>
> - DTO y validaciones.
> - Persistencia de `FOUND`, `ACTIVE` y propietario correcto.
> - Rechazo de datos inválidos.
> - Protección frente a la manipulación de campos controlados por el servidor.
> - Respuestas HTTP 201, 400 y 401 según corresponda.
> - Formulario Angular: validaciones, envío correcto, confirmación y errores.
> - Funcionamiento independiente de las rutas `/` y `/found`.
>
> Después ejecutá:
>
> - Pruebas unitarias y de integración del backend.
> - Pruebas del frontend.
> - Builds de backend y frontend.
> - Validación OpenSpec.
> - Verificación real de CU2 contra PostgreSQL.
> - Regresión completa de CU1, incluyendo `scripts/verify-cu1.ps1`.
>
> No declares una verificación exitosa si no ejecutaste realmente el comando correspondiente.
>
> **Restricciones de alcance**
>
> - No implementar CU3 ni ningún otro caso de uso.
> - No desarrollar el chatbot, el matching ni el servidor MCP propio.
> - No instalar dependencias innecesarias.
> - No realizar cambios destructivos en PostgreSQL.
> - No modificar ni eliminar la evidencia persistida de CU1.
> - No realizar commits ni push.
> - Preservar todos los cambios pendientes existentes en Git, aunque no estén relacionados con CU2.
>
> **Entrega**
>
> Al terminar, informame:
>
> 1. Archivos creados y modificados.
> 2. Endpoint y comportamiento implementados.
> 3. Cambios en la interfaz.
> 4. Pruebas ejecutadas y resultados reales.
> 5. Resultado de la regresión de CU1.
> 6. Estado de PostgreSQL y registros de prueba.
> 7. Estado de OpenSpec y documentación.
> 8. Problemas pendientes o verificaciones que no hayan podido realizarse.
>
> Implementá exclusivamente CU2. Al finalizar, detenete y esperá mi revisión antes de avanzar.

### L2 — Planificación y rutas (2026-11-05)

- Propuesta aprobada en la fase de análisis: endpoint simétrico `POST /api/v1/found-publications`, DTO base compartido (`CreatePublicationDto`), respuesta `FoundPublicationResponse`, ruta Angular `/found` con CU1 intacto en `/`, navegación simple en el shell, sin migraciones (el `CHECK` `publications_type_check` ya acepta `FOUND`), verificación separada `verify-cu2.ps1` con limpieza acotada a sus propias filas.
- Rutas de implementación: T2–T6 (backend) y T7–T10 (frontend) se delegan como dos writers paralelos por la regla de escritores paralelos: dos unidades independientes de comportamiento con superficies de edición disjuntas y varios archivos cada una. T11–T16 inline en el orquestador. El orquestador es dueño de git; los writers no ejecutan formateadores globales, generadores ni installs.
- Pronóstico de líneas de autoría: ~1700 (backend ~500, frontend ~650, contratos/docs/OpenSpec/scripts ~550). Excede el heurístico de ~400 por slice, pero el usuario prohibió commits y push: la entrega es un único árbol de trabajo sin slices commiteados, igual que en CU1.
- Nota de verificación diferencial: el commit base (`b76f358f496fef0659759d6ff420bdfd04dd56e1`) no contiene CU1 (todo CU1 está sin confirmar en el árbol), por lo que la prueba de no-regresión de CU1 se realiza con las suites existentes sin modificar + `verify:cu1.ps1` de punta a punta + verificación real del flujo en `/`, en lugar de un diferencial contra el commit base.
- Evidencia de CU1 a preservar en `lostfound_dev`: publicación `82d35348-d8b3-4149-9ac7-4a8cbb0fe1ec` (LOST/ACTIVE, demo). `verify-cu2.ps1` solo elimina filas que él mismo crea, por ID exacto.
- Skills: no existe `.atl/skill-registry.md`; los skills instalados aplicables son los de OpenSpec (usados por el orquestador para T13). Ningún skill instalado aplica a la implementación backend/frontend de los writers.

### L3 — Implementación (2026-11-05/06)

- Dos writers paralelos con superficies disjuntas completaron T2–T6 (backend) y T7–T10 (frontend), con RED→GREEN observado en ambos. Backend: DTO base `CreatePublicationDto` + subclases vacías, `FoundPublicationResponse`, `createFoundPublication` sobre helper privado `persistPublication`, `FoundPublicationsController` con `DemoIdentityGuard` y `@CurrentUser()`, registro en `PublicationsModule`, e2e found con anti-spoof y README/script `verify:cu2`. Frontend: `found-publication.models.ts`, `FoundPublicationsService`, página found (TS/HTML/SCSS/spec), ruta `/found`, navegación del shell y `app.routes.spec.ts`, README.
- El orquestador completó T11–T14: contrato `contracts/v1/found-publication.ts`, README de contratos (tabla, endpoint, lista de sincronización y nota de coherencia), `docs/architecture.md` (§4.1, §4.2, §6.4, §8), cambio OpenSpec completo y `scripts/verify-cu2.ps1` + `scripts/README.md`.
- Sin migraciones: `InitialSchema` ya declara `CHECK (type IN ('LOST','FOUND'))` y `CHECK (status IN ('ACTIVE','CLOSED'))`; ninguna fila ni especificación histórica fue reescrita.

### L4 — Batería de verificación observada (2026-11-06)

- Backend `npm test`: 9 suites / 70 pruebas PASS; `npm run test:e2e`: 3 suites / 12 pruebas PASS; `npm run build`: OK. Frontend `npm test -- --watch=false`: 6 archivos / 23 pruebas PASS; `npm run build`: OK con chunks lazy de ambas páginas.
- `openspec validate cu2-registrar-objeto-encontrado --strict`: válido.
- Suites de CU1 presentes y verdes sin ediciones: lost DTO spec, lost e2e, lost component spec (4 pruebas), `event-date.validator.spec.ts` (7), `publication-category.spec.ts` (2), `app.spec.ts` (1).

### L5 — Hallazgo real en `verify-cu2` y corrección de herramientas

- Primera corrida: 12/15. El caso "POST con fecha futura" devolvió `201` porque el script calculaba "mañana" en hora local (`Get-Date`), y a las 22:31 local (01:31 UTC del día siguiente) esa fecha era igual al "hoy" UTC que usa el validador compartido. La fila creada por ese caso quedó en la base (`f407d49b-7e56-4e56-a037-11b1356e2865`, FOUND) porque la limpieza solo conocía el ID del POST válido; se eliminó por ID exacto (la evidencia CU1 `82d35348` permaneció intacta, count=1).
- Corrección en `verify-cu2.ps1`: fecha futura determinista con `UTC + 2 días`; registro de todo ID creado (incluida captura defensiva si un caso inválido devolviera `201`); limpieza por ID exacto en el flujo normal y como respaldo en `finally`.
- Ajuste mínimo equivalente en `verify-cu1.ps1` (misma línea de fecha, `UTC + 2 días`) para que la regresión sea determinista; no cambia comportamiento de producto de CU1 ni sus datos. Se deja constancia explícita del cambio.
- Segunda corrida: `verify:cu2` 15/15 PASS; `verify:cu1` 14/14 PASS.

### L6 — Flujo real de navegador `/found`

- Chrome 156 headless vía CDP, backend compilado + `ng serve`: nav con `Perdí un objeto` (`/`, inactivo) y `Encontré un objeto` (`/found`, activo); formulario completo; `POST http://localhost:3000/api/v1/found-publications` con `X-Demo-User-Id: 00000000-0000-4000-8000-000000000001` → `201`; respuesta `FOUND`/`ACTIVE`/owner demo; panel de éxito con identificador; sin errores de consola.
- Fila persistida y recuperada: `12702eca-9ef6-4a03-9421-e980ae06e0c4` (FOUND, ACTIVE, owner demo, categoría BAGS, `event_date` 2026-11-01). Se conserva como evidencia de CU2, igual que la evidencia de CU1.

### L7 — RDD, verificación independiente y cierre

- `gentle-ai review mode status`: RDD activo por default. `gentle-ai review assess`: `risk=high` con razón `unassessable` (el candidato de worktree requiere declaración de untracked y no hay commits porque el usuario los prohibió; el worktree incluiría todo CU1). No se inicia una ceremonia de review sobre un candidato sin frontera de commit; se activa el verificador independiente por el ítem de alto riesgo nombrado (item 3: DTO base compartido que también usa CU1).
- Verificador independiente (`gentle-ai-verify`): veredicto PARTIAL, **sin blockers**; S1–S16, S18 y S19 `cumple`; S17/S20 no verificables por su alcance read-only. Advisories: tildar tasks/actualizar Log (hecho) y limpieza de `verify-cu2.ps1` fuera de `finally` (corregido con respaldo idempotente).
- Pendiente: revisión del usuario. Sin commits ni push. La fila de evidencia CU2 queda en `lostfound_dev` y puede eliminarse si se solicita.
