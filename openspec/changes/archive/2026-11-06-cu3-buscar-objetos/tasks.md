# Tasks

## 1. Backend

- [x] 1.1 Crear `PublicationQueryDto` (`q` recortado y opcional de 1–100; `page` entero ≥1 default 1; `pageSize` entero 1–50 default 12) con transformación de tipos y spec de validación. Verificación: el spec cubre defaults, coerción de strings, límites, `q` vacío y parámetros desconocidos rechazados por `forbidNonWhitelisted`.
- [x] 1.2 Agregar `searchActivePublications` y `findActivePublicationById` a `PublicationsService`, con búsqueda híbrida `ILIKE` + `%` y umbral `0.15` fijado con `set_config(..., true)` dentro de `manager.transaction`, paginación, conteo y orden `createdAt DESC, id DESC`. Verificación: specs de servicio comprueban filtro `ACTIVE`, escape de comodines, umbral local, `skip/take`, `total`, `totalPages` y detalle activo/inexistente.
- [x] 1.3 Crear `publications-read.controller.ts` (`v1/publications`, `GET /` y `GET /:id` con `ParseUUIDPipe` y contrato `VALIDATION_ERROR`) y registrarlo en `PublicationsModule`. Verificación: `GET` responde 200/400/404 con los códigos previstos.
- [x] 1.4 Crear la migración aditiva y reversible `AddPublicationSearchIndexes` con los tres índices GIN trigram y el B-tree `(status, created_at DESC)`. Verificación: `db:show` lista la migración; `db:migrate` y `db:revert` funcionan; no se ejecuta durante la planificación.
- [x] 1.5 Crear `test/publication-search.e2e-spec.ts` con listado, búsqueda por los tres campos, typos, sin resultados, búsqueda vacía, paginación y orden, exclusión de estados no activos en listado y detalle, validaciones y 404. Verificación: la suite pasa sin modificar los e2e de CU1/CU2.
- [x] 1.6 Documentar los endpoints en `backend/README.md` y agregar `verify:cu3` a `backend/package.json`. Verificación: el comando ejecuta el script de verificación real (grupo 4).

## 2. Frontend

- [x] 2.1 Crear `publication-search.models.ts` y `PublicationSearchService` (`GET /v1/publications` con `HttpParams`, `GET /v1/publications/:id`). Verificación: el spec del servicio comprueba URL, parámetros omitidos cuando `q` está vacío y errores.
- [x] 2.2 Crear `PublicationListPageComponent` con buscador, resultados, estados de carga/vacío/error y paginación, leyendo `q` y `page` de `queryParamMap`. Verificación: `publication-list-page.component.spec.ts` cubre envío, resultados de ambos tipos, vacío, error y paginación.
- [x] 2.3 Crear `PublicationDetailPageComponent` con carga, detalle, estado `404 PUBLICATION_NOT_FOUND` y enlace de vuelta. Verificación: el spec cubre éxito, 404 y error de conexión.
- [x] 2.4 Agregar las rutas `/publications` y `/publications/:id` y el enlace "Buscar" al shell, sin tocar `/` ni `/found`. Verificación: `app.routes.spec.ts` cubre las cuatro rutas y el `app.spec.ts` existente sigue pasando.
- [x] 2.5 Documentar CU3 en `frontend/README.md`. Verificación: la sección describe rutas, búsqueda, paginación y detalle.

## 3. Contratos y documentación

- [x] 3.1 Crear `contracts/v1/publication-search.ts` (tipos de lectura, query, envelope y códigos de error) y actualizar `contracts/v1/README.md`. Verificación: el contrato refleja el request/response implementado y el README lista el archivo y los endpoints.
- [x] 3.2 Actualizar `docs/architecture.md` (§4.1, §4.2, §7, §8, §10) con listado, búsqueda, detalle, índices y evidencia del umbral `0.15`. Verificación: las secciones mencionan CU3 sin reescribir contenido histórico.
- [x] 3.3 Crear y validar este cambio OpenSpec. Verificación: `openspec validate cu3-buscar-objetos --strict` pasa.

## 4. Verificación

- [x] 4.1 Suites y builds: backend `npm test`, `npm run test:e2e`, `npm run build`; frontend `npm test -- --watch=false`, `npm run build`. Verificación: todos pasan con resultados observados y sin cambios en las suites de CU1/CU2.
- [x] 4.2 Verificación real de CU3: `npm run verify:cu3 --prefix backend` (HTTP → NestJS → PostgreSQL, búsqueda, paginación, detalle, 404, validaciones y limpieza por ID propio). Verificación: todas las comprobaciones pasan y las evidencias de CU1/CU2 siguen intactas.
- [x] 4.3 Regresión completa de CU1 y CU2: `npm run verify:cu1 --prefix backend` y `npm run verify:cu2 --prefix backend`. Verificación: 14/14 y 15/15 respectivamente.
- [x] 4.4 Flujo real Angular → NestJS → PostgreSQL en navegador: `/publications` → búsqueda → resultado → detalle. Verificación: peticiones observadas, fila recuperada, sin errores de consola.

## Workflow follow-up

- Archivar el cambio (`openspec archive`) cuando el usuario apruebe CU3; el usuario definió que no se realizan commits ni push en esta iteración.
