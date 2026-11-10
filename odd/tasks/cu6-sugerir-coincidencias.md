# CU6 — Sugerir coincidencias entre objetos perdidos y encontrados

Objetivo: implementar un matching determinístico y explicable entre publicaciones `LOST` y `FOUND` activas, con persistencia de sugerencias, backfill idempotente, consulta pública por API y presentación en el detalle Angular existente.
Rama: `main` (sin commits ni push por pedido del usuario). Entrega: un solo árbol de trabajo, sin slices commiteados.
Estado: **implementación y verificación completas; pendiente revisión y aprobación del usuario antes de archivar**. CU7 no iniciado. Sin commits, push, dependencias nuevas ni reversión ejecutada en `lostfound_dev`.

## 1. Decisiones y alcance implementados

1. **Visibilidad pública:** `GET /api/v1/publications/:id/matches` no requiere identidad y solo devuelve datos públicos; nunca `ownerId`.
2. **Persistencia y backfill:** las altas LOST/FOUND generan coincidencias en la misma transacción y un comando `matches:backfill` procesa las publicaciones `ACTIVE` preexistentes de forma idempotente.
3. **Fórmula recomendada (ADR 0005):** trigram `0.15`; pesos texto `0.50`, categoría `0.20`, fecha `0.15`, ubicación `0.15`; umbral `0.55`; máximo 10; hasta 500 candidatas.
4. **Solo sugerir:** no se implementaron confirmar/descartar; `CONFIRMED`/`DISMISSED` existen en el esquema y nunca se reabren.

## 2. Algoritmo implementado

Para una fuente `ACTIVE`:

1. PostgreSQL pre-filtra candidatas `ACTIVE` del tipo opuesto con `id <> fuente` usando `search_text % :sourceSearchText` y `set_config('pg_trgm.similarity_threshold','0.15',true)` local a la transacción.
2. SQL ordena por score textual descendente, `event_date DESC`, `id ASC` y limita a 500.
3. NestJS calcula:

```text
textScore     = max(similarity(título,título), similarity(título,descripción),
                    similarity(descripción,título), similarity(descripción,descripción))
categoryScore = categorías iguales ? 1 : 0
dateScore     = max(0, 1 - abs(días entre event_date) / 30)
locationScore = similarity(ubicación, ubicación)
score         = 0.50*textScore + 0.20*categoryScore + 0.15*dateScore + 0.15*locationScore
```

4. Solo pasan `score >= 0.55` (sobre el valor sin redondear); se persiste el score redondeado a 4 decimales y se devuelven hasta 10, ordenados por score, fecha del evento e ID.
5. `search_text` es una columna generada almacenada: minúsculas + espacios colapsados de título, descripción y ubicación (acentos preservados).
6. Cada pareja se guarda en forma canónica LOST/FOUND con estado `SUGGESTED`; el upsert (`ON CONFLICT ... DO UPDATE ... WHERE status = 'SUGGESTED'`) nunca reabre `CONFIRMED`/`DISMISSED`.
7. El backfill itera las fuentes `LOST` activas con paginación por ID; cada par canónico se calcula una sola vez.

## 3. Esquema y migración

Migración aplicada: `AddPublicationMatching1794021491744`.

- `publications.search_text` como `GENERATED ALWAYS AS (lower(regexp_replace(title || ' ' || description || ' ' || location, '[[:space:]]+', ' ', 'g'))) STORED`.
- Índice GIN `publications_search_text_trgm_idx` (`gin_trgm_ops`).
- Tabla `publication_matches`: `id`, `lost_publication_id`, `found_publication_id`, `status` (`SUGGESTED`/`CONFIRMED`/`DISMISSED`), `score numeric(5,4)`, `created_at`, `updated_at`.
- Restricciones: pareja única `(lost,found)`, publicaciones distintas, score en `[0,1]`, FKs con `ON DELETE CASCADE` (las coincidencias son derivadas de la publicación).
- Índices `(lost_publication_id, status, score DESC)` y `(found_publication_id, status, score DESC)`.
- Se conservaron intactos los índices de CU3/CU4 (`title`/`description`/`location` trgm, `(status, created_at DESC)`, owner). `synchronize` sigue deshabilitado.
- La migración se aplicó de forma aditiva. **No se ejecutó `db:revert` en `lostfound_dev`**: la reversibilidad del `down` está cubierta por pruebas unitarias con `QueryRunner` simulado (sentencias exactas).

## 4. Archivos implementados

### Backend y contrato

- `backend/src/config/env.validation.ts` — `MatchingConfig`, defaults ADR y validación de rangos/suma de pesos.
- `backend/src/config/configuration.ts`; `backend/src/config/configuration.spec.ts`; `backend/src/config/runtime-env.validation.spec.ts`; `backend/.env.example`.
- `backend/src/publications/publication.entity.ts` — `searchText` mapeado a la columna generada.
- `backend/src/publications/domain/publication-match-status.ts`.
- `backend/src/publications/matching/publication-match.entity.ts`.
- `backend/src/publications/matching/publication-matching.service.ts` — pre-filtro, cálculo, generación transaccional y backfill.
- `backend/src/publications/matching/matching-score.ts` — componentes, score, umbral y orden.
- `backend/src/publications/matching/publication-matching-response.ts`.
- `backend/src/publications/matching/publication-matches.controller.ts` — `GET /api/v1/publications/:id/matches`.
- `backend/src/publications/matching/publication-match.entity.spec.ts`, `publication-matching.service.spec.ts`, `matching-score.spec.ts`.
- `backend/src/publications/publications.service.ts` — alta LOST/FOUND dentro de `manager.transaction`, recarga de `searchText` y generación antes del commit.
- `backend/src/publications/publications.module.ts` — servicio/controlador de matching y repositorio.
- `backend/src/config/database.config.ts` — entidad `PublicationMatch` registrada.
- `backend/src/commands/backfill-publication-matches.ts` — comando `matches:backfill`.
- `backend/src/database/migrations/1794021491744-AddPublicationMatching.ts` y su spec.
- `backend/package.json` — `matches:backfill`, `verify:cu6`.
- `backend/test/publication-matching.e2e-spec.ts`; ajustes de stubs de matching y `searchText` en `lost-publications`, `found-publications`, `publication-search` y `publication-filter-sort`.
- `contracts/v1/publication-matching.ts`; `contracts/v1/README.md`.
- `docs/adr/0005-matching-engine.md`, `docs/domain-model.md`, `docs/architecture.md`.
- `backend/README.md`.

### Frontend

- `frontend/src/app/publications/models/publication-matching.models.ts`.
- `frontend/src/app/publications/services/publication-matching.service.ts` y su spec.
- `frontend/src/app/publications/pages/publication-detail-page.component.ts` — carga independiente de coincidencias, error/reintento local.
- `frontend/src/app/publications/pages/publication-detail-page.component.html` — sección «Coincidencias sugeridas» con cards, porcentaje, motivos y enlace.
- `frontend/src/app/publications/pages/publication-detail-page.component.scss` — estilos coherentes con CU5.
- `frontend/src/app/publications/pages/publication-detail-page.component.spec.ts` — 7 tests (campos, contexto, 404, error, coincidencias, error local/reintento).
- `frontend/src/app/app.routes.spec.ts` — flush del endpoint de coincidencias.
- `frontend/README.md`.

### Verificación y documentación

- `scripts/verify-cu6.ps1` — verificación real segura (detalle abajo).
- `scripts/README.md` — sección CU6 y ajuste de la descripción de CU4.
- `scripts/verify-cu3.ps1` y `scripts/verify-cu4.ps1` — ajuste mínimo: la comprobación «última migración» pasó a «la migración de CU3 sigue aplicada», porque CU6 agrega una migración legítima posterior. No cambia el comportamiento de CU1–CU5.
- `openspec/changes/cu6-sugerir-coincidencias/*` y este ODD.

## 5. Pruebas ejecutadas y resultados

### Suites y builds

- Backend unitario: **16 suites / 177 tests** aprobados.
- Backend E2E: **6 suites / 56 tests** aprobados.
- Build backend: **OK**.
- Frontend: **10 archivos / 66 tests** aprobados.
- Build frontend: **OK**.

### Regresiones CU1–CU5

- `verify:cu1`: **14/14**.
- `verify:cu2`: **15/15** (una ejecución concurrente accidental produjo un conteo transitorio; se repitió aislada y pasó; la base terminó limpia).
- `verify:cu3`: **47/47**.
- `verify:cu4`: **46/46**.
- Detalle CU5: cubierto por las suites backend de detalle y los tests del componente Angular, en verde.

### `verify:cu6` contra PostgreSQL real

**34/34 verificaciones PASS.** Cubre: migración aplicada; `search_text` generado; tabla e índices; forma original de respuestas POST de CU1/CU2; normalización de `search_text`; generación transaccional (una pareja por alta relacionada); sugerencia con score/desglose/diferencia de días; consulta bidireccional; exclusión de cerradas y no relacionadas; candidato sin `ownerId`; `404` para origen cerrado/inexistente; `400` para UUID inválido; backfill dos veces sin duplicar parejas, sin reabrir `DISMISSED` y con total estable; restauración exacta de la tabla de coincidencias; evidencias intactas.

Protocolo seguro aplicado: snapshot de UUIDs de coincidencias preexistentes; eliminación exclusiva por UUID de lo creado por la ejecución; sin `DELETE` sin `WHERE`; fixtures propios eliminados por ID exacto con cascada; evidencias comparadas columna a columna (incluidas marcas temporales).

### Navegador real (Chrome headless vía CDP)

**PASS.** Sobre el par propio LOST/FOUND:

- Detalle LOST → tarjeta de la FOUND con `87%`-equivalente (score real de la pareja), motivos (Texto, Categoría: coincide, días de diferencia, Ubicación), aviso de que no confirma identidad y enlace al detalle.
- El enlace navega al detalle FOUND y allí aparece la sugerencia recíproca hacia la LOST (bidireccional).
- Estado vacío correcto en una publicación de evidencia sin coincidencias.
- Sin `ownerId` renderizado y **0 errores de consola**.

Incidencias de la prueba (solo del script temporal, no de la app): el JSON de fixtures se escribió con BOM UTF-8 y se corrigió con `.replace(/^\uFEFF/, '')`; una aserción esperaba «días» y la app usa singular «día». Ambas corregidas en el verificador temporal.

### Limpieza final

- Se comprobó que los cuatro UUID eran los fixtures propios (Bidon y Parluz) antes de borrarlos por ID exacto, con guarda por token de título.
- Las dos coincidencias asociadas se eliminaron por `ON DELETE CASCADE`.
- Resultado: `publications = 2` (solo evidencias), `publication_matches = 0`, **evidencias idénticas** (firma completa con marcas temporales).
- Procesos de la prueba detenidos tras validar PID y línea de comandos: API `21948`, Angular `12304`, Chrome `15300`. Puertos 3000/4200/9223 libres.

### OpenSpec

`openspec validate cu6-sugerir-coincidencias --strict`: **válido, 0 fallos**. El cambio permanece activo con **23/23 tareas**.

## 6. Estado de PostgreSQL final

- Migraciones aplicadas: `InitialSchema1762300000000`, `AddPublicationSearchIndexes1762400000000`, `AddPublicationMatching1794021491744`.
- `publications`: **2 filas**, las evidencias de CU1/CU2:
  - `82d35348-d8b3-4149-9ac7-4a8cbb0fe1ec` — LOST / ACTIVE / BAGS.
  - `12702eca-9ef6-4a03-9421-e980ae06e0c4` — FOUND / ACTIVE / BAGS.
- `publication_matches`: **0 filas** (los backfills de la verificación se restauraron por UUID).
- No se modificó ni eliminó ninguna fila preexistente; no se ejecutó `db:revert`.

## 7. Problemas encontrados y resoluciones

- **Script de verificación inseguro en el borrador:** contenía un ciclo `db:revert`/re-migrate y `DELETE FROM publication_matches` sin `WHERE`. Se reemplazó por snapshot/restauración por UUID, se eliminó la reversión real y se mantuvo el `down` cubierto por tests unitarios.
- **Concurrencia accidental de `verify:cu2`:** dos ejecuciones simultáneas compartieron puerto y base, produciendo un delta de 2 filas. Se repitió aislada (15/15); no quedaron residuos.
- **BOM UTF-8 en los fixtures temporales del navegador:** corregido con `\uFEFF`; no afectó a la aplicación.
- **Aserciones de «última migración» en `verify:cu3`/`verify:cu4`:** se cambiaron por comprobaciones de existencia de la migración de CU3, ya que CU6 agrega una migración posterior legítima. Documentado en `scripts/README.md`.
- **CU1 sin carpeta archivada:** condición preexistente del checkout; no se altera.

## 8. Pendientes

- Revisión y aprobación del usuario.
- Archivar CU6 y sincronizar `publication-matching` en `openspec/specs/` (no ejecutado).
- No iniciar CU7. No commits ni push.
