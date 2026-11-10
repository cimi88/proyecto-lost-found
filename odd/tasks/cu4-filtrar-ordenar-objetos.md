# CU4 — Filtrar y ordenar objetos

Objetivo: extender el listado público de CU3 con filtros por tipo, categoría y rango de fechas del evento, y con ordenamiento por más recientes, más antiguos y relevancia, sin duplicar la búsqueda textual ni alterar la visibilidad `ACTIVE`.
Rama: `main` (sin commits ni push por pedido del usuario). Entrega: un solo árbol de trabajo, sin slices commiteados.
Estado: implementación completada y verificada; **pendiente autorización explícita para archivar CU4**. No se hicieron commits ni push y no se inició CU5.
Runner: backend Jest 30.5.2 + ts-jest (`npm test`, `npm run test:e2e`); frontend Angular CLI/Vitest (`npm test -- --watch=false`); verificación real `scripts/verify-cu4.ps1`; regresión `scripts/verify-cu1.ps1`, `scripts/verify-cu2.ps1` y `scripts/verify-cu3.ps1`; flujo de navegador en `/publications` y `/publications/:id`.

## Estado de implementación

- Backend: 12 suites / 152 tests unitarios, 5 suites / 51 tests E2E y `npm run build` en verde.
- Frontend: 9 archivos / 60 tests y `npm run build` en verde.
- Verificación real: `verify:cu4` en verde; regresiones `verify:cu1` 14/14, `verify:cu2` 15/15 y `verify:cu3` 47/47.
- Navegador real (Chrome headless vía CDP): filtros por tipo, categoría y fecha; órdenes `recent`, `oldest` y `relevance`; URL sincronizada; relevancia deshabilitada sin `q`; detalle y navegación atrás con criterios conservados; sin errores de consola.
- PostgreSQL: `lostfound_dev` quedó con las dos filas de evidencia de CU1/CU2 y sin filas propias de CU4; no se agregaron migraciones.
- OpenSpec: `openspec validate cu4-filtrar-ordenar-objetos --strict` en verde. El cambio no se archivó.

## Specs

- **S1** — Aceptar `type` opcional (`LOST`/`FOUND`) y devolver solo publicaciones `ACTIVE` de ese tipo.
- **S2** — Aceptar `category` opcional con una de las nueve categorías acordadas.
- **S3** — Aceptar `eventDateFrom` y `eventDateTo` opcionales en `YYYY-MM-DD`, con rango inclusivo y extremos independientes.
- **S4** — Combinar todos los filtros entre sí, con `q` y con `status=ACTIVE` mediante AND; `total` y `totalPages` reflejan el conjunto filtrado.
- **S5** — Ordenar por `recent` (`createdAt DESC, id DESC`, predeterminado) y `oldest` (`createdAt ASC, id ASC`).
- **S6** — Ordenar por `relevance` solo con `q` no vacío, usando la mayor similitud trigram entre `q` y los tres campos de CU3, con desempate por fecha e `id`.
- **S7** — Rechazar `sort=relevance` sin `q` con `400 VALIDATION_ERROR`.
- **S8** — Conservar `page`/`pageSize` y la paginación estable con filtros y orden.
- **S9** — Rechazar valores inválidos, repetidos o desconocidos con `400 VALIDATION_ERROR` y `details[]`; tratar vacíos como ausentes.
- **S10** — Mantener `status` como parámetro desconocido: no se pueden consultar `RESERVED`, `RETURNED` o `CLOSED`.
- **S11** — SPA `/publications` con controles de tipo, categoría, fechas y orden, URL sincronizada, submit único, limpieza total y paginación que conserva criterios.
- **S12** — Relevancia deshabilitada o resuelta a `recent` cuando no hay `q`.
- **S13** — Sin regresión de CU1, CU2 y CU3; sin filtros ni `sort`, el listado se comporta como CU3.
- **S14** — Reutilizar los índices de CU3; no agregar migraciones ni dependencias.
- **S15** — Actualizar contratos, arquitectura, READMEs, OpenSpec y este documento en español.
- **S16** — Pruebas de cada filtro, combinaciones, ambos órdenes, relevancia con y sin `q`, paginación filtrada, parámetros inválidos/desconocidos/repetidos y regresión completa.
- **S17** — Verificación real Angular → NestJS → PostgreSQL y limpieza acotada por ID exacto, preservando las evidencias de CU1/CU2.
- **S18** — No declarar una verificación exitosa sin haber ejecutado el comando correspondiente.
- **S19** — Restricciones: no implementar en esta sesión, no ejecutar migraciones, no instalar dependencias, no modificar código funcional, no commits ni push, no iniciar CU5, no auditorías exhaustivas.
- **S20** — Presentar los siete puntos de entrega y detenerse a esperar autorización antes de materializar e implementar.

## Tasks

| ID | Descripción | Specs | Ruta | Estado |
|---|---|---|---|---|
| T1 | Artefactos de planificación: cambio OpenSpec `cu4-filtrar-ordenar-objetos` y este documento | S15, S20 | inline (modo Plan) | Completada (borrador validado) |
| T2 | Backend: `PublicationSort` y `PublicationQueryDto` con filtros, enums, fechas y defaults | S1–S3, S9 | delegated (writer backend) | Completada |
| T3 | Backend: validador de fecha `YYYY-MM-DD` real y reglas cruzadas | S3, S7, S9 | delegated (writer backend) | Completada |
| T4 | Backend: filtros combinados con `q` y `ACTIVE` en `searchActivePublications` | S1–S4, S10 | delegated (writer backend) | Completada |
| T5 | Backend: orden `recent`/`oldest`/`relevance` y relevancia con alias | S5–S8 | delegated (writer backend) | Completada |
| T6 | Backend: specs de DTO y servicio | S16 | delegated (writer backend) | Completada |
| T7 | Backend: e2e de filtros y orden + ajuste de aserciones de CU3 | S9, S13, S16 | delegated (writer backend) | Completada |
| T8 | Backend: README y `verify:cu4` en `package.json` | S15, S17 | delegated (writer backend) | Completada |
| T9 | Frontend: modelos y servicio con filtros/orden | S11, S12 | delegated (writer frontend) | Completada |
| T10 | Frontend: componente de listado con controles, URL, submit, limpieza y paginación | S11, S12 | delegated (writer frontend) | Completada |
| T11 | Frontend: plantilla, estilos y pruebas del listado | S11, S12, S16 | delegated (writer frontend) | Completada |
| T12 | Frontend: README | S15 | delegated (writer frontend) | Completada |
| T13 | Contratos v1: `publication-search.ts` y README | S15 | inline | Completada |
| T14 | Documentación: arquitectura, scripts y `verify-cu4.ps1` | S14, S15, S17 | inline | Completada |
| T15 | Verificación: suites, builds y OpenSpec estricto | S16, S18 | inline | Completada |
| T16 | Verificación real `verify:cu4` y regresión CU1/CU2/CU3 | S13, S17, S18 | inline | Completada |
| T17 | Flujo real de navegador con filtros, orden, relevancia y detalle | S17 | inline | Completada |
| T18 | Cierre del ODD y reporte de entrega | S20 | inline | Completada |

## Log

### L1 — Solicitud de planificación (verbatim)

> ## PARTE 2 — Planificación de CU4
>
> Una vez confirmado el archivado, cambiá al modo Plan.
>
> Prepará el análisis de CU4 — Filtrar y ordenar objetos.
>
> ### Objetivo funcional
>
> Permitir que el usuario refine los resultados obtenidos en CU3 mediante filtros y opciones de ordenamiento.
>
> Analizá la implementación de:
>
> **Filtros:**
> - Tipo de publicación: LOST / FOUND.
> - Categoría.
> - Rango de fechas del evento.
> - Cualquier otro filtro que esté contemplado en los casos de uso originales y resulte coherente con la arquitectura.
>
> **Ordenamiento:**
> - Más recientes.
> - Más antiguos.
> - Relevancia cuando exista un término de búsqueda.
> - Otras opciones únicamente si están justificadas por los requisitos.
>
> ### Consideraciones técnicas
>
> - Reutilizar el endpoint GET `/api/v1/publications` y su servicio de búsqueda cuando sea conveniente.
> - Mantener la paginación y búsqueda textual de CU3.
> - Validar y parametrizar todos los filtros en backend.
> - Mantener consultas eficientes aprovechando los índices existentes.
> - Actualizar contratos TypeScript y documentación.
> - Implementar controles de filtros y ordenamiento en Angular.
> - Mantener sincronizados los parámetros de búsqueda con la URL cuando corresponda.
> - Preservar la compatibilidad con CU1, CU2 y CU3.
>
> **Importante sobre los estados:**
>
> CU3 estableció que las consultas públicas solo muestran publicaciones ACTIVE. No cambies esa regla ni permitas consultar publicaciones RESERVED, RETURNED o CLOSED mediante filtros, salvo que encuentres un requisito original que indique expresamente lo contrario. En ese caso, señalá el conflicto y esperá mi decisión.
>
> ### Separación de responsabilidades
>
> No vuelvas a implementar la búsqueda textual de CU3.
>
> CU4 debe agregar filtros y ordenamiento sobre la funcionalidad existente, sin duplicar servicios ni lógica innecesariamente.
>
> ### Pruebas previstas
>
> Proponé pruebas para:
> - Cada filtro individual.
> - Combinaciones de filtros.
> - Orden ascendente y descendente.
> - Relevancia con y sin término de búsqueda.
> - Paginación combinada con filtros.
> - Parámetros inválidos y desconocidos.
> - Regresión completa de CU1, CU2 y CU3.
> - Funcionamiento real desde Angular hasta PostgreSQL.
>
> ### Restricciones
>
> - No implementar CU4.
> - No ejecutar migraciones.
> - No instalar dependencias.
> - No modificar código funcional.
> - No hacer commits ni push.
> - No iniciar CU5.
> - No realizar auditorías independientes exhaustivas.
>
> ### Resultado esperado
>
> Presentame:
> 1. Confirmación verificable del archivado de CU3.
> 2. Alcance funcional propuesto para CU4.
> 3. Filtros y ordenamientos definitivos recomendados.
> 4. Endpoints y contratos afectados.
> 5. Archivos que habría que crear o modificar.
> 6. Estrategia de pruebas y regresiones.
> 7. Riesgos, conflictos o decisiones que requieran mi aprobación.
>
> Creá los artefactos de planificación OpenSpec y ODD en el borrador permitido por el modo Plan y validalos en modo estricto.
>
> Detenete al terminar la planificación. Esperá mi autorización explícita antes de materializar los artefactos en el repositorio e implementar CU4.

### L2 — Planificación y decisiones (2026-11-06)

- Cambio OpenSpec `cu4-filtrar-ordenar-objetos` (schema `spec-driven`) con delta de requisitos **ADDED** sobre la capability existente `publications`. No se modifican los requisitos de registro de CU1/CU2 ni los de búsqueda, paginación, detalle y visibilidad de CU3.
- **Endpoint**: se reutiliza `GET /api/v1/publications`. No hay endpoint nuevo. El envelope `{ items, page, pageSize, total, totalPages }` no cambia.
- **Filtros definitivos**: `type` (`LOST`/`FOUND`), `category` (nueve categorías), `eventDateFrom` y `eventDateTo` (`YYYY-MM-DD`, inclusivos). Se combinan con AND con `q` y `status=ACTIVE`.
- **Filtros descartados**: `status` (prohibido por la regla de visibilidad de CU3), `ownerId` (no se expone en lecturas públicas), ubicación separada de `q` (duplicaría la búsqueda textual), fecha de creación y otros campos no pedidos.
- **Órdenes definitivos**: `recent` (`createdAt DESC, id DESC`, predeterminado), `oldest` (`createdAt ASC, id ASC`) y `relevance` (mayor similitud trigram, luego fecha e `id`). Se descartan orden por fecha del evento, categoría, ubicación o título por no estar pedidos.
- **Relevancia**: solo con `q` no vacío; sin `q` responde `400 VALIDATION_ERROR` con detalle en `sort`. Se calcula con `GREATEST(similarity(title, :q), similarity(description, :q), similarity(location, :q))` sobre las filas que ya pasaron el predicado de CU3; no se reimplementa la búsqueda. Alternativa descartada: full-text/`ts_rank`.
- **Validación**: DTO para enums, formato de fecha y valores vacíos; servicio para `eventDateFrom <= eventDateTo` y `sort=relevance` requiere `q`. Errores con `code=VALIDATION_ERROR` y `details[]` por campo. Parámetros repetidos y desconocidos se rechazan.
- **Índices**: no se agrega migración. Se reutilizan `publications_status_created_at_idx` y los tres índices GIN trigram de CU3. Los índices compuestos para `type`, `category` o `event_date` quedan como candidatos futuros si el volumen lo justifica.
- **Frontend**: `/publications` incorpora controles de tipo, categoría, fechas y orden; el formulario aplica todo junto, reinicia a página 1, sincroniza la URL, conserva criterios al paginar y limpia todo. La relevancia se deshabilita sin `q` o se resuelve a `recent`. El detalle `/publications/:id` no cambia.
- **Compatibilidad**: sin filtros ni `sort`, la petición y la respuesta son equivalentes a CU3. Se actualizan las aserciones de CU3 que hoy esperan que `type` sea desconocido; `status` sigue rechazado.
- **Pronóstico de autoría**: ~900–1200 líneas (backend ~450, frontend ~450, contratos/documentación/OpenSpec/scripts ~300). Es un único árbol de trabajo, sin commits, igual que CU1/CU2/CU3.
- **Restricción de modo Plan**: los artefactos se redactaron y validaron en `C:\Users\pcboxuser\.opencode\plan\cu4-artifacts` (no se modificó el repositorio). La materialización en `openspec/changes/cu4-filtrar-ordenar-objetos/` y `odd/tasks/cu4-filtrar-ordenar-objetos.md` queda pendiente para el agente de implementación, al recibir autorización.
- **Línea base de regresión**: backend 11 suites/94 pruebas y 4 suites/29 e2e; frontend 9 archivos/49 pruebas; `verify:cu1` 14/14; `verify:cu2` 15/15; `verify:cu3` 47/47. Evidencias a preservar en `lostfound_dev`: CU1 `82d35348-d8b3-4149-9ac7-4a8cbb0fe1ec` y CU2 `12702eca-9ef6-4a03-9421-e980ae06e0c4`.
- **Riesgos registrados**: relevancia sin índice y calculada sobre el conjunto filtrado; ausencia de índices compuestos para filtros; deriva de la paginación offset; amplitud del operador `%` con términos comunes; normalización de valores inválidos en la URL; cambio intencional de aserciones de CU3.
- **Pendiente**: autorización explícita del usuario para materializar los artefactos e implementar CU4. Sin commits, sin push y sin avanzar a CU5.

### L3 — Decisiones propuestas para aprobación

1. Nombres `eventDateFrom`/`eventDateTo` y rango inclusivo en ambos extremos.
2. `sort=relevance` sin `q` responde `400 VALIDATION_ERROR` en lugar de caer silenciosamente a `recent`.
3. Relevancia basada en `GREATEST(similarity(...))` con desempate `createdAt DESC, id DESC`.
4. Sin migración nueva en CU4; índices compuestos diferidos.
5. Aplicación de filtros mediante submit explícito, no en cada cambio de control.
6. La opción de relevancia se deshabilita sin `q` y el submit resuelve a `recent` si el usuario limpia el término.
