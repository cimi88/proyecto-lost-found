# Design

## Context

CU3 entregó `GET /api/v1/publications` y `GET /api/v1/publications/:id` como lecturas públicas. El listado ya resuelve:

- Visibilidad estricta `status=ACTIVE` en listado y detalle.
- Búsqueda opcional `q` sobre `title`, `description` y `location`, combinando `ILIKE` con el operador trigram `%` y `pg_trgm.similarity_threshold=0.15` local a la transacción.
- Paginación `page`/`pageSize` con predeterminados 1/12 y máximo 50.
- Orden fijo `createdAt DESC, id DESC`.
- Envelope `{ items, page, pageSize, total, totalPages }` y respuestas de lectura sin `ownerId`.

El `PublicationQueryDto` actual solo declara `q`, `page` y `pageSize`. El `ValidationPipe` global usa `whitelist: true`, `forbidNonWhitelisted: true` y `transform: true`, por lo que `type`, `category` y `sort` hoy responden `400`. La migración de CU3 creó los índices GIN trigram de `title`, `description` y `location`, y el B-tree `(status, created_at DESC)`.

La SPA `/publications` lee `q` y `page` de `queryParamMap`, muestra resultados y pagina. No tiene controles de filtro ni de orden.

## Goals / Non-Goals

**Goals:**

- Filtrar el listado público por tipo, categoría y rango de fechas del evento.
- Ordenar por más recientes, más antiguos y relevancia cuando exista `q`.
- Mantener `ACTIVE` como única visibilidad pública y rechazar cualquier intento de filtrar por estado.
- Conservar la búsqueda, la paginación y el envelope de CU3.
- Validar todos los parámetros en backend y mantener consultas eficientes con los índices existentes.
- Sincronizar filtros y orden con la URL y conservar los criterios al paginar.
- Cubrir cada filtro, combinaciones, órdenes, relevancia, paginación, errores y regresión de CU1/CU2/CU3.

**Non-Goals:**

- Nuevo endpoint, nuevo servicio de búsqueda o duplicación del predicado de CU3.
- Filtro por `status`, `ownerId`, ubicación separada de `q`, fecha de creación u otros campos no pedidos.
- Orden por fecha del evento, categoría, ubicación o título.
- Paginación por cursor, caché, full-text search o normalización de acentos.
- Migraciones, cambios de esquema o instalación de dependencias.
- CU5, matching, solicitudes, devoluciones, autenticación JWT real, chatbot o MCP.
- Refactorizar las páginas de CU1/CU2 o el detalle de CU3.

## Decisions

1. **Un solo endpoint y un solo predicado de búsqueda.** CU4 extiende `GET /api/v1/publications` y `PublicationQueryDto`; no crea un endpoint de filtros. `searchActivePublications` sigue siendo el único punto que arma la consulta. La búsqueda textual de CU3 se conserva en un método privado y los filtros se agregan con `andWhere`; no se copia el `ILIKE`/`%` en otro servicio.

2. **Filtros exactos y combinados con AND.** `type` y `category` son enums de un solo valor; `eventDateFrom`/`eventDateTo` son fechas `YYYY-MM-DD`. La consulta resultante es:

   ```sql
   status = 'ACTIVE'
   AND (title ILIKE :like OR description ILIKE :like OR location ILIKE :like
        [OR title % :term OR description % :term OR location % :term])
   AND [type = :type]
   AND [category = :category]
   AND [event_date >= :eventDateFrom]
   AND [event_date <= :eventDateTo]
   ```

   `status` no se expone como parámetro: sigue siendo desconocido y responde `400`. No se puede consultar `RESERVED`, `RETURNED` ni `CLOSED`.

3. **Nombres de parámetros explícitos.** Se usan `eventDateFrom` y `eventDateTo` para evitar ambigüedad con `createdAt` y para alinearse con el campo `eventDate`. El rango es inclusivo en ambos extremos. Cada extremo puede enviarse solo. `eventDateFrom > eventDateTo` responde `400 VALIDATION_ERROR` con detalle en `eventDateTo`.

4. **Ordenamiento con tres valores.** `sort` acepta `recent`, `oldest` y `relevance`; el predeterminado es `recent`, que reproduce exactamente el orden de CU3. `oldest` usa `createdAt ASC, id ASC`. `recent` usa `createdAt DESC, id DESC`. El orden se aplica después de los filtros y antes de `skip`/`take`, y el desempate por `id` mantiene la paginación determinista.

5. **Relevancia solo con `q`.** `sort=relevance` requiere `q` no vacío después de recortar; sin `q` responde `400 VALIDATION_ERROR` con detalle en `sort`. La relevancia no reemplaza la búsqueda: primero se aplica el predicado de CU3 y luego se ordenan las filas que ya coincidieron. El puntaje propuesto es:

   ```sql
   GREATEST(
     similarity(publication.title, :term),
     similarity(publication.description, :term),
     similarity(publication.location, :term)
   ) DESC,
   publication.created_at DESC,
   publication.id DESC
   ```

   Se implementa con `addSelect(...)` y un alias (`relevanceScore`) para que TypeORM no cite mal la expresión, y se ordena por ese alias. `similarity()` no usa índice, pero se evalúa solo sobre las filas que ya pasaron el filtro textual y la paginación es acotada. Alternativa descartada: `ts_rank` o full-text search, que introduciría otro mecanismo de búsqueda no previsto.

6. **Validación en dos capas.** El DTO valida forma, enums, formato de fecha y valores vacíos. El servicio valida las reglas cruzadas (`eventDateFrom <= eventDateTo` y `sort=relevance` requiere `q`) antes de abrir la transacción. Ambas capas producen `BadRequestException` con `code=VALIDATION_ERROR` y `details[]`, usando el filtro global existente. Los valores opcionales vacíos o solo con espacios se transforman a `undefined` para que un formulario limpio no genere un error.

7. **Sin migración nueva.** Los índices de CU3 cubren la visibilidad `ACTIVE`, el orden por `createdAt` y la búsqueda trigram. Los filtros de tipo, categoría y fecha se aplican sobre el conjunto ya acotado por `status` y, cuando corresponde, por el predicado textual. Con el volumen actual no se justifican índices compuestos adicionales; si el volumen crece, un cambio posterior puede evaluar `(status, type, created_at DESC)`, `(status, category, created_at DESC)` o `(status, event_date)`. CU4 no ejecuta migraciones.

8. **Frontend con un formulario de criterios y URL como fuente de verdad.** `/publications` lee `q`, `page`, `type`, `category`, `eventDateFrom`, `eventDateTo` y `sort` de `queryParamMap`. El formulario aplica todos los criterios en un solo submit, navega a la página 1 y omite de la URL los valores vacíos y `sort=recent`. Paginar conserva los criterios. «Limpiar» restablece todos los controles y vuelve a `/publications?page=1`. La opción «Relevancia» se deshabilita cuando `q` está vacío; si el usuario limpia `q` con relevancia seleccionada, el submit resuelve a `recent`. Los valores inválidos en la URL se normalizan a ausente/predeterminado y el backend sigue siendo la autoridad del contrato.

9. **Compatibilidad explícita con CU3.** Sin filtros y sin `sort`, la petición y la respuesta deben ser equivalentes a CU3. El frontend no envía `sort=recent` ni filtros vacíos. Las únicas aserciones de CU3 que cambian son las que hoy esperan que `type`, `category` o `sort` sean parámetros desconocidos: pasan a usar un parámetro realmente desconocido (por ejemplo `ownerId`) y se agrega cobertura de que `status` sigue rechazado.

10. **Verificación real acotada.** `scripts/verify-cu4.ps1` crea sus propias filas con tokens únicos, captura sus IDs y, si necesita un orden determinista, ajusta `created_at` únicamente en esas filas propias. Prueba cada filtro, combinaciones, ambos órdenes por fecha, relevancia con y sin `q`, paginación filtrada, errores y exclusión de no activas. Limpia por ID exacto en `finally` y comprueba que las evidencias de CU1/CU2 sigan intactas.

## Risks / Trade-offs

- [La relevancia con `similarity()` no usa índice y se calcula sobre todas las filas que pasaron el filtro textual] → Aceptado para el volumen actual; la paginación es acotada y el filtro textual reduce el conjunto. Si el volumen crece, se evaluará un índice o un enfoque de ranking distinto en un cambio propio.
- [No se agregan índices para `type`, `category` o `event_date`] → Los filtros se aplican sobre el conjunto `ACTIVE` y, cuando hay `q`, sobre las coincidencias trigram. Se documentan los índices candidatos para una etapa posterior.
- [La paginación offset puede duplicar u omitir filas ante inserciones concurrentes] → Se mantiene el desempate por `id`; un cursor queda fuera de CU4.
- [El operador `%` puede ser amplio con términos comunes] → Es el comportamiento heredado de CU3; CU4 no lo cambia. La relevancia ordena, no amplía, el conjunto.
- [La URL puede contener filtros inválidos] → El frontend normaliza valores desconocidos y el backend responde `400 VALIDATION_ERROR` si la petición llega inválida. La autoridad del contrato queda en NestJS.
- [Cambiar `type` de parámetro desconocido a válido altera aserciones de CU3] → Es un cambio de contrato intencional y acotado. Se actualizan el spec de DTO, el e2e de CU3 y `verify-cu3.ps1` para usar un parámetro realmente desconocido; no se cambia el comportamiento de búsqueda, paginación ni detalle.
- [Relevancia sin `q` como error puede sorprender] → Se elige `400` para no devolver un orden que no significa nada. La UI deshabilita la opción y resuelve a `recent` para evitar el error desde el flujo normal.
- [Deriva entre contrato, backend y frontend] → Contrato manual único en `contracts/v1/publication-search.ts`, pruebas de servicio/componente contra la URL y el payload reales, y verificación HTTP de punta a punta.

## Migration Plan

1. Implementar y probar sin ejecutar migraciones.
2. No hay migración de esquema: se reutilizan los índices de CU3.
3. Reversión funcional: quitar los parámetros y controles de CU4; el listado vuelve al contrato de CU3 sin cambios de datos.
4. La verificación real `verify:cu4` solo crea y elimina filas propias; no modifica las evidencias de CU1/CU2.

## Open Questions

Ninguna bloqueante. Las decisiones que se recomiendan para aprobación explícita son:

- Nombres `eventDateFrom`/`eventDateTo` y rango inclusivo.
- `sort=relevance` sin `q` responde `400` en lugar de caer a `recent`.
- Relevancia basada en `GREATEST(similarity(...))` con desempate por fecha e `id`.
- Sin migración nueva en CU4; índices compuestos diferidos.
- Aplicación de filtros mediante submit explícito y no en cada cambio de control.
