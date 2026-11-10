# CU3 — Buscar objetos

Objetivo: vertical slice de lectura pública (Angular → NestJS → PostgreSQL) para listar, buscar y consultar el detalle de publicaciones `ACTIVE`, reutilizando el modelo de CU1/CU2 sin regresiones.
Rama: `main` (sin commits ni push por pedido del usuario). Entrega: un solo árbol de trabajo, sin slices commiteados.
Estado: implementación completa y verificada; pendiente aprobación del usuario para archivar el cambio. Sin commits ni push.
Runner: backend Jest 30.5.2 + ts-jest (`npm test`, `npm run test:e2e`); frontend Angular CLI/Vitest (`npm test -- --watch=false`); verificación real `scripts/verify-cu3.ps1`; regresión `scripts/verify-cu1.ps1` y `scripts/verify-cu2.ps1`; flujo de navegador en `/publications` y `/publications/:id`.

## Specs

- **S1** — Exponer `GET /api/v1/publications` como listado público de publicaciones.
- **S2** — Incluir únicamente publicaciones con `status=ACTIVE`, tanto en el listado como en el detalle.
- **S3** — Aceptar `q` opcional sobre título, descripción y ubicación.
- **S4** — Búsqueda híbrida: `ILIKE` para coincidencias parciales y operador `%` de `pg_trgm` con `pg_trgm.similarity_threshold` en `0.15`, fijado de forma local a la transacción.
- **S5** — Paginación `page`/`pageSize` con predeterminados 1 y 12 y máximo 50.
- **S6** — Orden fijo y estable `createdAt DESC, id DESC`.
- **S7** — Detalle público por UUID en `GET /api/v1/publications/:id`.
- **S8** — Detalle limitado a `ACTIVE`; inexistente o no activa responden `404 PUBLICATION_NOT_FOUND`.
- **S9** — Frontend Angular con listado, estados de carga/vacío/error, paginación y búsqueda.
- **S10** — Rutas `/publications` y `/publications/:id`, con navegación desde el shell; `/` y `/found` intactas.
- **S11** — Sin regresión de CU1 y CU2.
- **S12** — Migración aditiva y reversible con índices GIN trigram (title, description, location) y B-tree (status, created_at DESC); no se ejecuta durante la planificación.
- **S13** — Fuera de alcance: filtros elegibles, orden configurable, ranking por relevancia, contacto con propietarios, solicitudes de recuperación, matching automático, chatbot/MCP, autenticación JWT real, normalización de acentos y full-text search.
- **S14** — Contratos REST, documentación, OpenSpec y este documento en español, respetando las convenciones del proyecto.
- **S15** — No reescribir especificaciones históricas de CU1, CU2 o etapa 0.2.
- **S16** — Pruebas: búsqueda por los tres campos, sin resultados, búsqueda vacía, tolerancia a typos, paginación y orden estable, exclusión de no activas en listado y detalle, validación de parámetros e identificadores, regresión CU1/CU2 y prueba funcional real.
- **S17** — Ejecutar suites, builds, validación OpenSpec, verificación real de CU3, regresión de CU1/CU2 y flujo real de navegador.
- **S18** — No declarar una verificación exitosa sin haber ejecutado el comando correspondiente.
- **S19** — Restricciones: sin dependencias nuevas, sin migraciones durante la planificación, sin cambios destructivos, sin commits ni push, preservar todos los cambios pendientes existentes.
- **S20** — Informar los seis puntos de entrega y detenerse a esperar autorización antes de implementar.

## Tasks

| ID | Descripción | Specs | Ruta | Estado |
|---|---|---|---|---|
| T1 | Artefactos de planificación: cambio OpenSpec `cu3-buscar-objetos` y este documento | S14 | inline (modo Plan) | Completada (materializada y validada) |
| T2 | Backend: `PublicationQueryDto` con transformación y validación + spec | S3, S5, S16 | delegated (writer backend) | Completada |
| T3 | Backend: `searchActivePublications` y `findActivePublicationById` con búsqueda híbrida y umbral local | S1, S2, S4, S6, S7, S8 | delegated (writer backend) | Completada |
| T4 | Backend: controlador de lectura `v1/publications` + registro en el módulo | S1, S7, S8, S16 | delegated (writer backend) | Completada |
| T5 | Backend: migración aditiva `AddPublicationSearchIndexes` (3 GIN + 1 B-tree) | S12 | delegated (writer backend) | Completada |
| T6 | Backend: e2e de listado, búsqueda, paginación, detalle y validaciones | S16 | delegated (writer backend) | Completada |
| T7 | Backend: README y script `verify:cu3` en `package.json` | S14, S17 | delegated (writer backend) | Completada |
| T8 | Frontend: modelos y `PublicationSearchService` | S3, S5, S7 | delegated (writer frontend) | Completada |
| T9 | Frontend: página de listado con búsqueda, estados y paginación | S9 | delegated (writer frontend) | Completada |
| T10 | Frontend: página de detalle con estado 404 | S8, S9 | delegated (writer frontend) | Completada |
| T11 | Frontend: rutas `/publications` y `/publications/:id`, navegación y specs de rutas | S10, S11 | delegated (writer frontend) | Completada |
| T12 | Frontend: README | S14 | delegated (writer frontend) | Completada |
| T13 | Contratos v1: `publication-search.ts` y README de contratos | S14 | inline | Completada |
| T14 | `docs/architecture.md` y `scripts/README.md` | S14 | inline | Completada |
| T15 | Verificación completa: suites, builds, OpenSpec estricto, `verify:cu3` real, regresión CU1/CU2 y flujo real | S11, S16, S17, S18 | inline | Completada |
| T16 | Cierre: este documento, espejo Engram y reporte de entrega | S20 | inline | Completada |

## Log

### L1 — Solicitud de planificación (verbatim)

> ### Alcance funcional aprobado
>
> 1. Listar publicaciones de objetos perdidos y encontrados.
> 2. Mostrar únicamente publicaciones con estado `ACTIVE`.
> 3. Búsqueda opcional por título, descripción y ubicación.
> 4. Búsqueda híbrida mediante `ILIKE` y similitud trigram de PostgreSQL.
> 5. Paginación mediante `page` y `pageSize`, con valores predeterminados 1 y 12, y máximo 50.
> 6. Orden fijo y estable por `createdAt DESC, id DESC`.
> 7. Detalle público de una publicación mediante su UUID.
> 8. El detalle también debe mostrar únicamente publicaciones `ACTIVE`. Las inexistentes o no activas deben responder `404 PUBLICATION_NOT_FOUND`.
> 9. Frontend Angular con listado, estados de carga, vacío y error, paginación y página de detalle.
> 10. Navegación mediante `/publications` y `/publications/:id`.
>
> ### Dos decisiones técnicas obligatorias
>
> **1. Índices trigram y búsqueda por similitud**
>
> La arquitectura ya establece un umbral de similitud de `0.15`.
>
> No uses únicamente `similarity(columna, :q) >= 0.15` suponiendo que eso aprovechará los índices GIN.
>
> Diseñá la búsqueda para utilizar el operador `%` de PostgreSQL, configurando `pg_trgm.similarity_threshold` en `0.15` de forma segura y acotada a la transacción correspondiente.
>
> Combiná esa condición con `ILIKE` para coincidencias parciales.
>
> La migración debe ser aditiva y reversible:
>
> - Índice GIN trigram para title.
> - Índice GIN trigram para description.
> - Índice GIN trigram para location.
> - Índice B-tree para status y created_at.
>
> No ejecutes todavía la migración.
>
> **2. Visibilidad de publicaciones**
>
> Tanto el listado como el detalle deben filtrar `status = ACTIVE`.
>
> Una publicación RESERVED, RETURNED o CLOSED no debe exponerse mediante consultas públicas, incluso si se conoce su UUID.
>
> ### Límites de CU3
>
> No incluir:
>
> - Filtros elegibles por el usuario.
> - Ordenamiento configurable.
> - Ranking por relevancia.
> - Contacto con propietarios.
> - Solicitudes de recuperación.
> - Matching automático.
> - Chatbot o MCP.
> - Autenticación JWT real.
> - Normalización de acentos ni full-text search.
>
> Estos temas corresponden a otros casos de uso o etapas.
>
> ### Pruebas previstas
>
> Diseñá pruebas para:
>
> - Búsqueda por título, descripción y ubicación.
> - Búsqueda sin resultados y búsqueda vacía.
> - Tolerancia a errores de tipeo.
> - Paginación y orden estable.
> - Exclusión de publicaciones no activas tanto en listado como en detalle.
> - Validación de parámetros e identificadores.
> - Regresión de CU1 y CU2.
> - Prueba funcional real Angular → NestJS → PostgreSQL.
>
> ### Restricciones
>
> - No implementes código funcional.
> - No ejecutes migraciones.
> - No instales dependencias.
> - No modifiques archivos existentes fuera de los artefactos de planificación estrictamente necesarios.
> - No hagas commits ni push.
> - No avances a CU4.
> - No realices auditorías independientes exhaustivas.

### L2 — Planificación y decisiones (2026-11-06)

- Cambio OpenSpec `cu3-buscar-objetos` (schema `spec-driven`) con delta de requisitos **ADDED** sobre la capability existente `publications` (creada al archivar CU2). No se modifican requisitos de registro de CU1/CU2.
- **Endpoints**: `GET /api/v1/publications` (listado y búsqueda) y `GET /api/v1/publications/:id` (detalle), públicos, sin `DemoIdentityGuard`. Envelope `{ items, page, pageSize, total, totalPages }`.
- **Visibilidad**: `status=ACTIVE` en listado y detalle. UUID inexistente o no activo → `404 PUBLICATION_NOT_FOUND`, sin revelar existencia de otros estados. Se prefiere 404 a 403 para no filtrar información.
- **Búsqueda**: `ILIKE` sobre `title`/`description`/`location` combinado con el operador trigram `%`. Umbral `0.15` fijado con `SELECT set_config('pg_trgm.similarity_threshold', $1, true)` dentro de `manager.transaction(...)`; `set_config(..., true)` y la conexión fijada por la transacción evitan filtrar el umbral al pool. No se usa `similarity(...) >= 0.15` como predicado porque no aprovecha índices GIN.
- **Términos cortos**: la rama `%` se habilita desde 3 caracteres; con 1–2 se usa solo `ILIKE`. `q` se recorta; vacío o solo espacios equivale a explorar. El patrón `ILIKE` escapa `\`, `%` y `_`.
- **Paginación y orden**: `page` ≥1 (default 1), `pageSize` 1–50 (default 12), orden fijo `createdAt DESC, id DESC`, `totalPages = 0` si `total = 0`; página fuera de rango devuelve `items: []`.
- **Contrato de errores**: `400 VALIDATION_ERROR` con `details[]` para parámetros inválidos, parámetros desconocidos y UUID mal formado (`ParseUUIDPipe` con `exceptionFactory`); `404 PUBLICATION_NOT_FOUND` para detalle inexistente o no activo. `ownerId` no se expone en lecturas.
- **Índices**: migración aditiva y reversible `AddPublicationSearchIndexes` con GIN trigram en `title`, `description`, `location` y B-tree en `(status, created_at DESC)`. La extensión `pg_trgm` ya existe; la migración **no se ejecuta** en la planificación.
- **Frontend**: `/publications` y `/publications/:id`, enlace "Buscar" en el shell, búsqueda por parámetros de URL (`q`, `page`), estados carga/vacío/error, paginación y detalle con 404. No se refactorizan CU1/CU2 ni se extraen componentes compartidos.
- **Pronóstico de autoría**: ~1100–1400 líneas (backend ~450, frontend ~550, contratos/documentación/OpenSpec/scripts ~400). Excede el heurístico de ~400 por slice, pero el usuario prohibió commits y la entrega es un único árbol de trabajo, igual que CU1/CU2.
- **Restricción de modo Plan**: los artefactos se redactaron y validaron en `C:\Users\pcboxuser\.opencode\plan\cu3-artifacts`. Con autorización del usuario se materializaron byte a byte en `openspec/changes/cu3-buscar-objetos/` y este documento; los seis SHA256 coinciden y `openspec validate cu3-buscar-objetos --strict` pasó 1/1 en el repositorio.
- **Línea base de regresión**: backend 9 suites/70 pruebas y 3 suites/12 e2e; frontend 6 archivos/23 pruebas; `verify:cu1` 14/14; `verify:cu2` 15/15. Evidencias a preservar en `lostfound_dev`: CU1 `82d35348-d8b3-4149-9ac7-4a8cbb0fe1ec` y CU2 `12702eca-9ef6-4a03-9421-e980ae06e0c4`.
- **Riesgos registrados**: selectividad baja del operador `%` con términos cortos o comunes; ausencia de normalización de acentos; deriva de la paginación offset ante inserciones concurrentes; bloqueo breve al crear índices; exposición del texto libre publicado.
- **Pendiente**: aprobación explícita del usuario para archivar el cambio y avanzar a CU4. Sin commits, sin push y sin avanzar a CU4.

### L3 — Implementación (2026-11-06)

- **Backend**: `PublicationQueryDto` con transformación/validación; `searchActivePublications` y `findActivePublicationById` con `ILIKE` + `%`, umbral `0.15` local por `set_config(..., true)`, paginación, orden y filtro `ACTIVE`; controlador público `v1/publications`; migración `AddPublicationSearchIndexes`; specs de DTO/servicio y e2e “no database”; README y `verify:cu3`.
- **Frontend**: modelos y `PublicationSearchService`; listado URL-driven con búsqueda, estados y paginación; detalle con 404; rutas `/publications` y `/publications/:id`; enlace “Buscar”; specs y README.
- **Contratos y documentación**: `contracts/v1/publication-search.ts`, README de contratos, `docs/architecture.md` (§4.1, §4.2, §4.5, §7, §8, §10), `scripts/verify-cu3.ps1` y `scripts/README.md`.
- **Bug real detectado en navegador**: el `<form>` del listado no tenía directiva de formulario, por lo que `(ngSubmit)` no se emitía y el submit nativo recargaba la página sin `q`. Se reemplazó por `(submit)="submit($event)"` con `preventDefault()` y se agregó un test de regresión que despacha un `submit` real.

### L4 — Verificación (2026-11-06)

- **Migración**: `db:migrate` aplicó `AddPublicationSearchIndexes1762400000000`; `db:revert` la revirtió y `db:migrate` la reaplicó correctamente. Los tres índices GIN trigram y el B-tree `(status, created_at DESC)` existen.
- **Backend**: 11 suites / 94 pruebas; 4 suites / 29 e2e; `npm run build` sin errores.
- **Frontend**: 9 archivos / 49 pruebas; `npm run build` sin errores (265.64 kB iniciales).
- **OpenSpec**: `openspec validate cu3-buscar-objetos --strict` → 1/1, 0 fallos.
- **`verify:cu3`**: 47/47 comprobaciones; crea y limpia sus propias filas por ID; evidencias de CU1 y CU2 intactas.
- **Regresión**: `verify:cu1` 14/14 y `verify:cu2` 15/15.
- **Flujo real**: Chrome headless vía CDP sobre Angular → NestJS → PostgreSQL: `/publications` → búsqueda con `q` → 1 resultado → detalle; se observaron `GET /api/v1/publications?...&q=...` y `GET /api/v1/publications/:id`; 0 errores de consola y 0 requests fallidos. La fila sembrada se eliminó y la base quedó con solo las dos evidencias.
- **Git**: sin commits ni push.
