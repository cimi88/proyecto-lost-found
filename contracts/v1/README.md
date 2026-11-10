# Contratos v1

Contratos HTTP TypeScript escritos a mano para la versión 1 de la API.

## Reglas

- No se genera código automáticamente.
- No hay paquete compartido ni workspace: cada consumidor mantiene una copia sincronizada manualmente.
- Los contratos no exponen detalles internos de persistencia ni secretos.
- La coherencia de las categorías se verifica con pruebas en backend y frontend.

## Archivos

| Archivo | Contenido |
|---|---|
| `publication-category.ts` | Las nueve categorías acordadas y su guarda de tipo |
| `lost-publication.ts` | `POST /api/v1/lost-publications`: request, response y errores |
| `found-publication.ts` | `POST /api/v1/found-publications`: request, response y errores |
| `publication-search.ts` | `GET /api/v1/publications` y `GET /api/v1/publications/:id`: listado, búsqueda, filtros, orden, paginación, detalle y errores |
| `publication-matching.ts` | `GET /api/v1/publications/:id/matches`: coincidencias sugeridas, scores explicables y errores |
| `recovery-request.ts` | Solicitudes de recuperación: creación, listas, aprobación, rechazo, cancelación, estados, fechas y errores |
| `assistant.ts` | Asistente orientativo: chat, rol devuelto y contexto de identidad |

## Endpoint

### `POST /api/v1/lost-publications`

Registra una publicación de objeto perdido (`type=LOST`, `status=ACTIVE`) para el
usuario resuelto por la identidad local.

- Identidad local: encabezado `X-Demo-User-Id` con el UUID de un usuario existente.
  Solo se acepta con `AUTH_MODE=demo`; el backend rechaza `AUTH_MODE=demo` cuando
  `NODE_ENV=production`.
- Éxito: `201 Created` con `LostPublicationResponse`.
- Datos inválidos: `400` con `code=VALIDATION_ERROR` y `details[]` por campo.
- Identidad ausente: `401` con `code=DEMO_IDENTITY_REQUIRED`.
- Identidad inválida o inexistente: `401` con `code=DEMO_IDENTITY_INVALID`.

Ejemplo de error de validación:

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Invalid request data",
  "details": [
    {
      "field": "title",
      "message": "El título debe tener entre 3 y 120 caracteres."
    }
  ]
}
```

### `POST /api/v1/found-publications`

Registra una publicación de objeto encontrado (`type=FOUND`, `status=ACTIVE`)
para el usuario resuelto por la identidad local. El servidor fija `type`,
`status` y `ownerId`: si llegan en el cuerpo, la solicitud se rechaza con `400`.

- Identidad local: encabezado `X-Demo-User-Id` con el UUID de un usuario existente.
  Solo se acepta con `AUTH_MODE=demo`; el backend rechaza `AUTH_MODE=demo` cuando
  `NODE_ENV=production`.
- Éxito: `201 Created` con `FoundPublicationResponse`.
- Datos inválidos o campos controlados por el servidor (`type`, `status`,
  `ownerId`): `400` con `code=VALIDATION_ERROR` y `details[]` por campo.
- Identidad ausente: `401` con `code=DEMO_IDENTITY_REQUIRED`.
- Identidad inválida o inexistente: `401` con `code=DEMO_IDENTITY_INVALID`.

### `GET /api/v1/publications`

Lista y busca publicaciones activas. Es una lectura pública: no requiere
`X-Demo-User-Id`.

- Solo devuelve publicaciones con `status=ACTIVE`. `status` no es un parámetro
  aceptado y no se puede usar para exponer estados no activos.
- Parámetros opcionales: `q` (1–100 caracteres; busca sobre título, descripción
  y ubicación), `type` (`LOST` o `FOUND`), `category` (una de las nueve
  categorías), `eventDateFrom` y `eventDateTo` (`YYYY-MM-DD`, inclusivos),
  `sort` (`recent`, `oldest` o `relevance`), `page` (entero ≥1, predeterminado
  1) y `pageSize` (entero 1–50, predeterminado 12).
- `q` y todos los filtros se combinan con AND.
- Orden predeterminado `recent`: `createdAt DESC, id DESC`. `oldest` usa
  `createdAt ASC, id ASC`. `relevance` ordena por la mayor similitud trigram
  contra título, descripción o ubicación, con desempate
  `createdAt DESC, id DESC`; requiere un `q` no vacío.
- Éxito: `200` con `PublicationSearchResponse`
  (`items`, `page`, `pageSize`, `total`, `totalPages`).
- Parámetros inválidos o desconocidos: `400` con `code=VALIDATION_ERROR` y
  `details[]` por campo. `sort=relevance` sin `q` devuelve el detalle en
  `sort`.

### `GET /api/v1/publications/:id`

Devuelve el detalle público de una publicación activa.

- Solo devuelve publicaciones con `status=ACTIVE`; `RESERVED`, `RETURNED` y
  `CLOSED` no se exponen, aunque se conozca el UUID.
- Identificador que no es UUID: `400` con `code=VALIDATION_ERROR` y detalle de
  `id`.
- Publicación inexistente o no activa: `404` con
  `code=PUBLICATION_NOT_FOUND`.
- Éxito: `200` con `PublicationDetail`, sin `ownerId`.

### `GET /api/v1/publications/:id/matches`

Devuelve sugerencias públicas para una publicación activa. El origen `LOST`
solo se compara con candidatas `FOUND` activas y viceversa. La respuesta no
requiere identidad y no incluye `ownerId` ni datos privados.

- Éxito: `200` con `PublicationMatchesResponse`; `items` contiene hasta 10
  coincidencias `SUGGESTED`, cada una con resumen público, score `0..1`,
  `scoreBreakdown` y `eventDateDifferenceDays`.
- Sin coincidencias: `200` con `items: []`.
- UUID inválido: `400` con `code=VALIDATION_ERROR` y detalle de `id`.
- Origen inexistente o no `ACTIVE`: `404` con `code=PUBLICATION_NOT_FOUND`.
- Solo se presentan coincidencias cuyo origen y candidata siguen `ACTIVE`.

El score usa las señales y pesos documentados en ADR 0005. La categoría es una
señal blanda, no una condición de elegibilidad.

### Solicitudes de recuperación (CU7)

Todos los endpoints requieren `X-Demo-User-Id` mientras `AUTH_MODE=demo` y
devuelven `401` con `DEMO_IDENTITY_REQUIRED` o `DEMO_IDENTITY_INVALID` si falta
la identidad o no identifica un usuario.

- `POST /api/v1/publications/:id/recovery-requests` (`{ notes? }`): crea una
  solicitud `PENDING` sobre una publicación `FOUND` `ACTIVE`. Responde `201`.
  Publicación inexistente, no `ACTIVE` o no `FOUND`: `404
  PUBLICATION_NOT_FOUND`. Propietario: `403 RECOVERY_REQUEST_FORBIDDEN`.
  Duplicado activo: `409 RECOVERY_REQUEST_DUPLICATE`.
- `GET /api/v1/recovery-requests/mine`: solicitudes propias, ordenadas por
  `createdAt DESC, id DESC`. Devuelve un arreglo.
- `GET /api/v1/recovery-requests/received`: solicitudes de publicaciones
  propias, mismo orden. Devuelve un arreglo con `requesterDisplayName`.
- `POST /api/v1/recovery-requests/:id/approve`: solo el propietario. Reserva la
  publicación y rechaza las demás `PENDING` en la misma transacción. Una
  publicación `RESERVED` responde `404 PUBLICATION_NOT_FOUND`; ya existe otra
  `APPROVED`: `409 RECOVERY_REQUEST_CONFLICT`.
- `POST /api/v1/recovery-requests/:id/reject`: solo el propietario. Pasa a
  `REJECTED`; fuera de `PENDING`: `409 RECOVERY_REQUEST_NOT_PENDING`.
- `POST /api/v1/recovery-requests/:id/cancel` (`{ reason }`): el solicitante
  cancela `PENDING`; el solicitante, el propietario o un ADMIN cancelan
  `APPROVED`. `reason` es obligatorio (3–500, recortado). Cancelar una
  `APPROVED` verifica en una transacción que la publicación siga `RESERVED` y
  que esa solicitud sea la única `APPROVED`; si no, `409
  RECOVERY_REQUEST_CONFLICT` sin reactivar. Estados terminales: `409
  RECOVERY_REQUEST_NOT_CANCELLABLE`.

Las respuestas incluyen `createdAt` (creación) y `updatedAt` (última
modificación); `updatedAt` no representa la fecha de aprobación, rechazo o
cancelación. No se exponen `ownerId`, `requesterId`, `cancelledById`, correo ni
contacto. No existe `PUBLICATION_NOT_AVAILABLE`.

### Asistente orientativo (CU10)

- `GET /api/v1/assistant/context` (NestJS): requiere `X-Demo-User-Id` y devuelve
  `{ "role": "USER" | "ADMIN" }`. No expone IDs, correo ni datos de contacto.
- `POST /chat` (FastAPI): recibe `{ message, history[] }` y devuelve
  `{ reply, role }`. El rol lo determina NestJS; el modelo no puede cambiarlo.
- El asistente solo explica cómo usar LostFound. No busca publicaciones, no
  consulta ni crea solicitudes, no modifica datos y no tiene memoria persistente.
- Errores: 400 `VALIDATION_ERROR`, 401 `DEMO_IDENTITY_REQUIRED`/`DEMO_IDENTITY_INVALID`,
  502 `ASSISTANT_UPSTREAM_ERROR`, 503 `ASSISTANT_UNAVAILABLE`.

## Sincronización manual

Cualquier cambio en estos contratos debe reflejarse en:

- `backend/src/publications/domain/publication-category.ts`
- `backend/src/publications/dto/create-publication.dto.ts` (base compartida lost/found)
- `backend/src/publications/dto/create-lost-publication.dto.ts`
- `backend/src/publications/dto/create-found-publication.dto.ts`
- `backend/src/publications/lost-publication-response.ts`
- `backend/src/publications/found-publication-response.ts`
- `backend/src/publications/dto/publication-query.dto.ts`
- `backend/src/publications/domain/publication-sort.ts`
- `backend/src/publications/publications.service.ts`
- `backend/src/publications/publication-read-response.ts`
- `backend/src/publications/publications-read.controller.ts`
- `backend/src/publications/matching/publication-matching.service.ts`
- `contracts/v1/publication-matching.ts`
- `backend/src/recovery-requests/`
- `backend/src/assistant/`
- `frontend/src/app/recovery-requests/`
- `frontend/src/app/assistant/`
- `ai-service/app/`
- `ai-service/mcp_server/`
- `frontend/src/app/publications/domain/publication-category.ts`
- `frontend/src/app/publications/models/lost-publication.models.ts`
- `frontend/src/app/publications/models/found-publication.models.ts`
- `frontend/src/app/publications/models/publication-search.models.ts`
- `frontend/src/app/publications/services/publication-search.service.ts`
- `frontend/src/app/publications/services/publication-matching.service.ts`

Las pruebas de coherencia de categorías viven en el backend
(`create-publication.dto.spec.ts`, matriz compartida lost/found) y en el
frontend (`create-lost-publication-page.component.spec.ts`).
