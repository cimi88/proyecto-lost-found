# Proposal

## Why

CU3 entregó el listado público `ACTIVE` con búsqueda textual, paginación y detalle. Hoy el usuario puede buscar, pero no puede acotar los resultados por tipo, categoría o rango de fechas del evento, ni elegir un orden distinto del fijo `createdAt DESC, id DESC`. El caso de uso 4 aprobado —«Filtrar y ordenar resultados»— sigue sin cubrirse.

CU4 agrega filtros y ordenamiento sobre la misma superficie de lectura, reutilizando el endpoint, el predicado de búsqueda y la visibilidad `ACTIVE` de CU3. No crea un endpoint nuevo ni duplica la lógica de búsqueda.

## What Changes

- Extender `GET /api/v1/publications` con filtros opcionales: `type` (`LOST`/`FOUND`), `category` (una de las nueve categorías), `eventDateFrom` y `eventDateTo` (`YYYY-MM-DD`, inclusivos). Todos se combinan mediante AND con `q` y con `status=ACTIVE`.
- Agregar `sort` opcional con `recent` (predeterminado), `oldest` y `relevance`. `relevance` solo se acepta con `q` no vacío y ordena por la mayor similitud trigram entre `q` y `title`, `description` o `location`, con desempate `createdAt DESC, id DESC`.
- Mantener `q`, `page`, `pageSize` y el envelope `{ items, page, pageSize, total, totalPages }`. `total` y `totalPages` reflejan el conjunto filtrado.
- Validar enums, fechas, parámetros repetidos y desconocidos, y las reglas cruzadas `eventDateFrom <= eventDateTo` y `sort=relevance` requiere `q`. Los errores usan `400 VALIDATION_ERROR` con `details[]`.
- Mantener la regla de CU3: ninguna consulta pública puede exponer `RESERVED`, `RETURNED` o `CLOSED`. `status` sigue siendo un parámetro desconocido y se rechaza.
- Extender la SPA `/publications` con controles de tipo, categoría, rango de fechas y orden; sincronizar los criterios con la URL; reiniciar a la página 1 al aplicar; conservar los criterios al paginar; limpiar todos los filtros; deshabilitar o resolver a `recent` la relevancia cuando no haya `q`. El detalle `/publications/:id` no cambia.
- Actualizar contratos TypeScript, arquitectura, READMEs, pruebas y `scripts/verify-cu4.ps1`. No se agrega una migración: se reutilizan los índices de CU3.
- Ajustar las aserciones de CU3 que hoy tratan `type`, `category` o `sort` como parámetros desconocidos, porque CU4 los incorpora al contrato. Es un cambio de contrato intencional, no una regresión funcional.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `publications`: se agregan requisitos de filtrado y ordenamiento sobre el listado público. Los requisitos de registro de CU1/CU2, la búsqueda textual, la paginación, la visibilidad `ACTIVE` y el detalle de CU3 se conservan.

## Impact

- Backend: `backend/src/publications/dto/publication-query.dto.ts`, `backend/src/publications/domain/**`, `backend/src/publications/publications.service.ts`, validadores compartidos de fecha, specs de DTO/servicio y e2e de filtros/orden, `backend/README.md` y `backend/package.json`.
- Frontend: `frontend/src/app/publications/models/publication-search.models.ts`, `frontend/src/app/publications/services/publication-search.service.ts`, `frontend/src/app/publications/pages/publication-list-page.component.{ts,html,scss,spec.ts}`, `frontend/README.md`.
- Contratos: `contracts/v1/publication-search.ts` y `contracts/v1/README.md`.
- Documentación y verificación: `docs/architecture.md`, `scripts/README.md`, `scripts/verify-cu4.ps1` (nuevo), `scripts/verify-cu3.ps1` (ajuste de parámetro desconocido), `openspec/changes/cu4-filtrar-ordenar-objetos/**` y `odd/tasks/cu4-filtrar-ordenar-objetos.md`.
- Base de datos: sin cambios de esquema, columnas, restricciones, datos ni migraciones. Se reutilizan `publications_status_created_at_idx` y los tres índices GIN trigram de CU3.
- Fuera de alcance: filtro por estado, filtro por propietario, filtro por ubicación separado de `q`, orden por fecha del evento, orden por categoría, paginación por cursor, autenticación JWT, matching, chatbot/MCP, CU5, commits y push.
