# Proposal

## Why

CU1 y CU2 permiten registrar publicaciones `LOST` y `FOUND`, pero hoy no existe ninguna forma de consultarlas: la API solo expone `POST` y la SPA solo ofrece formularios. Sin un listado público con búsqueda y detalle, las publicaciones registradas son inaccesibles para quien busca un objeto y los casos de uso posteriores (filtros, recuperación, coincidencias) no tienen una superficie de lectura sobre la cual construirse.

## What Changes

- Dos endpoints públicos de lectura: `GET /api/v1/publications` (listado y búsqueda paginada) y `GET /api/v1/publications/:id` (detalle).
- Visibilidad restringida a `status=ACTIVE` en ambas operaciones. Las publicaciones `RESERVED`, `RETURNED` o `CLOSED` no se exponen y el detalle responde `404 PUBLICATION_NOT_FOUND`, sin revelar si el identificador existe con otro estado.
- Búsqueda opcional `q` sobre `title`, `description` y `location`, híbrida: `ILIKE` para coincidencias parciales y el operador trigram `%` de `pg_trgm` con `pg_trgm.similarity_threshold` fijado en `0.15` de forma local a la transacción de la consulta.
- Paginación `page`/`pageSize` (predeterminados 1 y 12, máximo 50) y orden fijo y estable `createdAt DESC, id DESC`, con `total` y `totalPages` en la respuesta.
- Migración aditiva y reversible: índices GIN trigram sobre `title`, `description` y `location`, y un índice B-tree sobre `(status, created_at DESC)`. La extensión `pg_trgm` ya existe en la migración base.
- Frontend Angular: `/publications` (buscador, resultados, estados de carga, vacío y error, paginación) y `/publications/:id` (detalle), con navegación "Buscar" en el shell. Las rutas `/` y `/found` quedan intactas.
- Contrato manual `contracts/v1/publication-search.ts`, actualización de arquitectura y READMEs, y `scripts/verify-cu3.ps1` con limpieza acotada a las filas que crea.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `publications`: se agregan requisitos de listado público, búsqueda por texto, paginación, detalle y validación de parámetros. Los requisitos de registro de CU1 y CU2 no se modifican.

## Impact

- Backend: `backend/src/publications/**` (DTO de consulta, controlador de lectura, servicio, respuestas, módulo), `backend/src/database/migrations/**` (índices), `backend/test/` (e2e de búsqueda y detalle), `backend/package.json` (script `verify:cu3`), `backend/README.md`.
- Frontend: `frontend/src/app/**` (modelos, servicio, páginas de listado y detalle, rutas, navegación), `frontend/README.md`.
- Contratos: `contracts/v1/publication-search.ts` (nuevo) y `contracts/v1/README.md`.
- Base de datos: índices nuevos; sin cambios de columnas, restricciones ni datos.
- Documentación: `docs/architecture.md`, `scripts/README.md`, `openspec/changes/cu3-buscar-objetos/**`, `odd/tasks/cu3-buscar-objetos.md`.
