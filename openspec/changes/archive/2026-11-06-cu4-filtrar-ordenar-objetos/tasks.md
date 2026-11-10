# Tasks

## 1. Backend — contrato de consulta

- [x] 1.1 Agregar `PublicationSort` (`recent`/`oldest`/`relevance`) al dominio y extender `PublicationQueryDto` con `type`, `category`, `eventDateFrom`, `eventDateTo` y `sort`, recortando opcionales vacíos y aplicando enums, formato de fecha y defaults. Verificación: el spec del DTO cubre defaults, valores válidos, vacíos, inválidos, repetidos y parámetros desconocidos.
- [x] 1.2 Crear un validador reutilizable de fecha `YYYY-MM-DD` real (sin la restricción de “no futura” del registro) y su spec. Verificación: acepta fechas válidas y rechaza formato inválido, días inexistentes y valores no textuales.
- [x] 1.3 Validar en el servicio las reglas cruzadas `eventDateFrom <= eventDateTo` y `sort=relevance` requiere `q`, devolviendo `400 VALIDATION_ERROR` con `details[]`. Verificación: specs de servicio comprueban ambos errores y que no se abre la transacción.

## 2. Backend — consulta y orden

- [x] 2.1 Extender `searchActivePublications` con filtros exactos de `type`, `category`, `eventDateFrom` y `eventDateTo`, combinados mediante AND con `status=ACTIVE` y con el predicado de búsqueda de CU3. Verificación: specs de servicio comprueban cada filtro, combinaciones, `total`/`totalPages` y que `status` no se expone.
- [x] 2.2 Implementar `sort=recent` (predeterminado), `oldest` y `relevance`, con desempates `id` y orden aplicado antes de `skip`/`take`. Verificación: specs de servicio comprueban `orderBy`/`addOrderBy`, paginación y estabilidad.
- [x] 2.3 Implementar la relevancia reutilizando el predicado de CU3 y ordenando por `GREATEST(similarity(...))` con alias `relevanceScore`, sin duplicar la búsqueda textual. Verificación: specs comprueban el `addSelect`, el orden y que `q` sigue usando `ILIKE`/`%` y el umbral local.
- [x] 2.4 Mantener el controlador y el envelope sin cambios; solo cambia el DTO aceptado por `GET /api/v1/publications`. Verificación: el detalle y las rutas de CU3 no se modifican.

## 3. Backend — pruebas y documentación

- [x] 3.1 Ampliar `publications-search.service.spec.ts` con filtros individuales, combinaciones, orden reciente/antiguo, relevancia con y sin `q`, paginación filtrada, reglas cruzadas y no regresión del orden de CU3. Verificación: la suite pasa sin modificar las pruebas de creación de CU1/CU2.
- [x] 3.2 Crear `backend/test/publication-filter-sort.e2e-spec.ts` con cada filtro, combinaciones, ambos órdenes, relevancia, paginación, parámetros inválidos/desconocidos/repetidos y exclusión de estados no activos. Verificación: la suite pasa con el `ValidationPipe` global y el filtro de errores reales.
- [x] 3.3 Actualizar en `publication-query.dto.spec.ts`, `publication-search.e2e-spec.ts` y `scripts/verify-cu3.ps1` las aserciones que hoy esperan que `type` sea desconocido, usando un parámetro realmente desconocido (por ejemplo `ownerId`) y manteniendo la cobertura de `status` rechazado. Verificación: CU3 sigue pasando como regresión.
- [x] 3.4 Actualizar `backend/README.md` con parámetros, semántica, ejemplos, errores, relevancia e índices reutilizados; agregar `verify:cu4` a `backend/package.json`. Verificación: el comando ejecuta el script real.

## 4. Frontend

- [x] 4.1 Extender `publication-search.models.ts` con `PublicationSort`, etiquetas y parámetros de filtro; actualizar `PublicationSearchService` para enviar solo criterios no vacíos y omitir `sort=recent`. Verificación: el spec del servicio cubre todos los parámetros, omisiones y errores.
- [x] 4.2 Extender `PublicationListPageComponent` con controles de tipo, categoría, fechas y orden, hidratación desde `queryParamMap`, submit único, limpieza total, paginación que conserva criterios y regla de relevancia sin `q`. Verificación: el spec del componente cubre cada control, URL, submit, limpieza, paginación y relevancia.
- [x] 4.3 Extender la plantilla y los estilos de `/publications` con los controles, etiquetas accesibles, estados de carga/vacío/error y textos de filtros, sin romper los `data-testid` de CU3. Verificación: las pruebas de CU3 siguen pasando y las nuevas cubren el DOM.
- [x] 4.4 Actualizar `frontend/README.md` con filtros, orden, URL y comportamiento de relevancia. Verificación: la sección describe los parámetros y las rutas.

## 5. Contratos, documentación y verificación real

- [x] 5.1 Actualizar `contracts/v1/publication-search.ts` con `PublicationSort`, filtros, constantes y comentarios de semántica; actualizar `contracts/v1/README.md`. Verificación: el contrato refleja el request/response implementado y no expone `ownerId`.
- [x] 5.2 Actualizar `docs/architecture.md` (§4.1, §4.2, §7, §8) con filtros, orden, relevancia, reutilización de índices y ausencia de migración. Verificación: las secciones mencionan CU4 sin reescribir contenido histórico.
- [x] 5.3 Crear `scripts/verify-cu4.ps1` con filas propias, tokens únicos, fechas y `created_at` controlados, pruebas de cada filtro/orden/relevancia/paginación/errores, limpieza por ID exacto y preservación de evidencias. Verificación: el script pasa contra PostgreSQL real y deja el conteo inicial.
- [x] 5.4 Actualizar `scripts/README.md` con el uso y la cobertura de `verify-cu4.ps1`. Verificación: el README describe el comando y la limpieza acotada.

## 6. Verificación

- [x] 6.1 Backend: `npm test`, `npm run test:e2e` y `npm run build`. Verificación: todas las suites y el build pasan con resultados observados.
- [x] 6.2 Frontend: `npm test -- --watch=false` y `npm run build`. Verificación: todas las pruebas y el build pasan.
- [x] 6.3 Verificación real de CU4: `npm run verify:cu4 --prefix backend`. Verificación: todas las comprobaciones pasan y las evidencias de CU1/CU2 siguen intactas.
- [x] 6.4 Regresión completa: `npm run verify:cu1 --prefix backend`, `npm run verify:cu2 --prefix backend` y `npm run verify:cu3 --prefix backend`. Verificación: 14/14, 15/15 y las comprobaciones de CU3 pasan.
- [x] 6.5 Flujo real Angular → NestJS → PostgreSQL en navegador: `/publications` → filtros y orden → resultados → detalle → volver con los criterios. Verificación: peticiones observadas, resultados correctos y sin errores de consola.
- [x] 6.6 OpenSpec estricto y cierre del documento ODD. Verificación: `openspec validate cu4-filtrar-ordenar-objetos --strict` pasa y el ODD refleja el estado real.

## Workflow follow-up

- Materializar los artefactos en el repositorio y archivar CU4 solo con autorización explícita del usuario. No se realizan commits ni push en esta iteración. No iniciar CU5.
