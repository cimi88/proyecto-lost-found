# Design

## Context

CU1 y CU2 entregaron el registro de publicaciones `LOST` y `FOUND` sobre la tabla `publications`, con validación compartida, identidad demo (ADR 0008) y contrato de errores `{ statusCode, code, message, details? }`. La API solo expone `POST`; no existe ninguna consulta de lectura, paginación ni detalle. La SPA solo ofrece los formularios de `/` y `/found`.

El `ValidationPipe` global usa `whitelist: true`, `forbidNonWhitelisted: true` y `transform: true`, por lo que los parámetros de consulta deben declararse en un DTO explícito y cualquier parámetro no admitido se rechaza. El filtro global normaliza los errores y permite códigos propios.

`InitialSchema` crea `CREATE EXTENSION IF NOT EXISTS pg_trgm`, pero no crea índices trigram ni un índice para el filtro por estado y el orden por fecha. La documentación de arquitectura (§7 y §10) declara el umbral `0.15` y los índices trigram como parte del diseño, pero la migración base no los materializa.

## Goals / Non-Goals

**Goals:**

- Listado público de publicaciones `ACTIVE` de ambos tipos, con búsqueda opcional y paginación.
- Detalle público por UUID, también limitado a `ACTIVE`.
- Búsqueda híbrida que aproveche índices GIN trigram reales mediante el operador `%`.
- Índices aditivos y reversibles; sin cambios de esquema ni de datos.
- UI de búsqueda y detalle sin tocar el comportamiento de CU1 y CU2.
- Contrato, documentación, OpenSpec y verificación real de punta a punta.

**Non-Goals:**

- Filtros elegibles por el usuario, ordenamiento configurable y ranking por relevancia (CU4).
- Contacto con propietarios, solicitudes de recuperación, matching automático, chatbot o MCP.
- Autenticación JWT real, normalización de acentos o full-text search.
- Paginación por cursor, caché o búsqueda federada.

## Decisions

1. **Endpoints de lectura dedicados y públicos.** `GET /api/v1/publications` y `GET /api/v1/publications/:id` en un controlador nuevo (`publications-read.controller.ts`), sin `DemoIdentityGuard`. La lectura de un tablero público no requiere identidad; el interceptor del frontend puede seguir enviando `X-Demo-User-Id`, que el backend ignora en estas rutas. Alternativa descartada: exigir identidad demo en lecturas, que agregaría fricción sin aportar autorización real.

2. **Visibilidad `ACTIVE` únicamente, también en el detalle.** El listado filtra `status = 'ACTIVE'`; el detalle devuelve `404 PUBLICATION_NOT_FOUND` tanto para un UUID inexistente como para uno `RESERVED`, `RETURNED` o `CLOSED`. Se usa `404` y no `403` para no filtrar la existencia de publicaciones ocultas. Alternativa descartada: detalle de cualquier estado, que expondría publicaciones cerradas por enlace directo.

3. **Búsqueda híbrida con el operador `%`, no con `similarity(...) >= 0.15`.** `similarity()` es una función y PostgreSQL no puede resolverla con un índice GIN; evaluarla por fila fuerza un recorrido secuencial. El operador `%` es la forma indexable de `pg_trgm` con `gin_trgm_ops`:

   - Umbral: `SELECT set_config('pg_trgm.similarity_threshold', $1, true)` con `'0.15'`. El tercer argumento `true` hace el ajuste local a la transacción; la consulta se ejecuta dentro de `manager.transaction(...)`, que fija una conexión, de modo que el umbral no se filtra a otras consultas del pool.
   - Predicado: `status = 'ACTIVE' AND (title ILIKE :like OR description ILIKE :like OR location ILIKE :like OR title % :q OR description % :q OR location % :q)`.
   - La rama `%` se incluye solo cuando el término recortado tiene entre 3 y 100 caracteres; con 1–2 caracteres la similitud trigram no es selectiva y se usa únicamente `ILIKE`.
   - `q` se recorta; un valor vacío o solo espacios se trata como ausente (explorar). El patrón `ILIKE` escapa `\`, `%` y `_`; el operador `%` recibe el término crudo parametrizado.
   - `getManyAndCount()` se ejecuta sobre el mismo `manager` de la transacción para que filas y total compartan umbral y filtros.

4. **Paginación offset con orden fijo.** `page` (≥1, default 1), `pageSize` (1–50, default 12); respuesta `{ items, page, pageSize, total, totalPages }` con `totalPages = total === 0 ? 0 : ceil(total / pageSize)`. Orden `createdAt DESC, id DESC` como desempate estable. Una página posterior a la última devuelve `items: []` con los totales reales. Alternativa descartada: cursor, innecesario para el volumen y el alcance actual.

5. **DTO de consulta explícito.** `PublicationQueryDto` con `@Transform` para recortar `q` y convertir `page`/`pageSize` a número (`@Type(() => Number)`), `@IsOptional`, `@IsString`, `@MaxLength(100)`, `@IsInt`, `@Min`, `@Max`. Gracias a `forbidNonWhitelisted`, parámetros como `type`, `sort` o `category` responden `400 VALIDATION_ERROR`: la frontera con CU4 queda fijada por contrato.

6. **Identificador inválido = error de validación.** `@Get(':id')` usa `ParseUUIDPipe` con un `exceptionFactory` que devuelve el contrato del proyecto (`code=VALIDATION_ERROR`, `details[{ field: 'id' }]`). Un UUID válido inexistente o no activo responde `404 PUBLICATION_NOT_FOUND`. Se evita que un UUID mal formado llegue a PostgreSQL.

7. **Respuestas de lectura sin `ownerId`.** `PublicationSummary` incluye `id`, `type`, `status`, `title`, `description`, `category`, `location`, `eventDate` y `createdAt`; el detalle agrega `updatedAt`. No se expone `ownerId` en lecturas públicas. Los contratos de creación de CU1/CU2 no cambian.

8. **Migración aditiva y reversible.** `AddPublicationSearchIndexes` crea:

   ```sql
   CREATE INDEX "publications_title_trgm_idx" ON "publications" USING gin ("title" gin_trgm_ops);
   CREATE INDEX "publications_description_trgm_idx" ON "publications" USING gin ("description" gin_trgm_ops);
   CREATE INDEX "publications_location_trgm_idx" ON "publications" USING gin ("location" gin_trgm_ops);
   CREATE INDEX "publications_status_created_at_idx" ON "publications" ("status", "created_at" DESC);
   ```

   `down` elimina los cuatro índices en orden inverso. No hay cambios de columnas, restricciones ni datos. La migración no se ejecuta durante la planificación.

9. **Frontend con rutas y parámetros de URL.** `/publications` lee `q` y `page` de `queryParamMap`, de modo que la búsqueda es compartible y el botón "atrás" funciona; el formulario navega con `Router.navigate` al enviar. `/publications/:id` lee el parámetro con `ActivatedRoute.paramMap`. No se modifica `app.config.ts`: se usa la API de rutas ya disponible. Se agregar modelos, servicio y dos componentes nuevos; no se refactorizan las páginas de CU1/CU2 ni se extraen componentes compartidos.

10. **Verificación real acotada.** `scripts/verify-cu3.ps1` crea sus propias filas con los endpoints `POST` de CU1/CU2, captura sus IDs y las elimina por ID exacto, también en `finally`. Antes y después comprueba que las evidencias de CU1 y CU2 siguen presentes. No ejecuta `DELETE` sin ID y no modifica publicaciones ajenas.

## Risks / Trade-offs

- [El operador `%` con términos muy cortos o muy comunes puede no ser selectivo] → La rama trigram se habilita desde 3 caracteres; el resto se resuelve con `ILIKE` y el índice GIN también puede asistir a `ILIKE '%…%'`.
- [La normalización de acentos queda fuera de alcance] → Se documenta la limitación; `pg_trgm` no normaliza y agregar `unaccent` exigiría otra extensión e índices de expresión.
- [La paginación offset puede duplicar u omitir filas ante inserciones concurrentes] → Aceptado para CU3; el desempate por `id` mantiene el orden determinista y un cursor queda para una etapa posterior.
- [La lectura pública expone el texto libre de las publicaciones] → Se omite `ownerId`; el contenido es el que el usuario decidió publicar. No se agregan datos de contacto ni PII adicional.
- [El índice B-tree `(status, created_at DESC)` no cubre `id`] → El desempate se resuelve en memoria sobre páginas acotadas; si el volumen crece, se evaluará ampliar el índice.
- [La migración de índices bloquea escrituras brevemente] → El volumen actual es mínimo; los índices son `CREATE INDEX` no concurrentes, reversibles y sin cambios de datos.
- [Deriva entre contratos, backend y frontend] → Contrato manual único en `contracts/v1/publication-search.ts`, pruebas de componente contra la URL y el payload reales y verificación HTTP de punta a punta.

## Migration Plan

1. Implementar y probar sin ejecutar la migración.
2. `npm run db:migrate` aplica `AddPublicationSearchIndexes` (solo índices).
3. `npm run db:revert` la deshace si fuera necesario.
4. Reversión funcional: quitar rutas, controlador y páginas; los índices pueden permanecer sin afectar a CU1/CU2, pero la migración soporta su eliminación.

## Open Questions

Ninguna bloqueante. La semántica de búsqueda, la visibilidad `ACTIVE`, la paginación, el orden fijo y las rutas fueron fijados en el alcance aprobado.
