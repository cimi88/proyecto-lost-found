# Spec Delta

## ADDED Requirements

### Requirement: Listado público de publicaciones activas

El sistema SHALL exponer `GET /api/v1/publications` como listado público de publicaciones. La respuesta MUST incluir únicamente publicaciones con `status=ACTIVE` y MUST incluir los tipos `LOST` y `FOUND` sin exigir identidad ni autenticación.

#### Scenario: Listado con publicaciones de ambos tipos

- **WHEN** existen publicaciones `LOST` y `FOUND` con `status=ACTIVE`
- **THEN** el listado devuelve ambas, sin requerir `X-Demo-User-Id`

#### Scenario: Exclusión de publicaciones no activas

- **WHEN** existen publicaciones `RESERVED`, `RETURNED` o `CLOSED`
- **THEN** el listado no las incluye en `items` ni en el total

### Requirement: Búsqueda por texto sobre tres campos

El listado SHALL aceptar un parámetro opcional `q`, recortado, de 1 a 100 caracteres, que MUST buscar sobre `title`, `description` y `location`. La búsqueda MUST ser insensible a mayúsculas y MUST escapar los comodines `%`, `_` y `\` en el patrón `ILIKE`. Sin `q`, el listado MUST devolver las publicaciones activas más recientes.

#### Scenario: Coincidencia por título, descripción o ubicación

- **WHEN** se busca un término presente en el título, la descripción o la ubicación de una publicación activa
- **THEN** la publicación aparece en los resultados

#### Scenario: Sin resultados

- **WHEN** ningún registro activo coincide con el término
- **THEN** responde `200` con `items: []`, `total: 0` y `totalPages: 0`

#### Scenario: Búsqueda vacía

- **WHEN** no se envía `q`, o se envía vacío o solo con espacios
- **THEN** responde `200` con las publicaciones activas ordenadas por `createdAt DESC, id DESC`

### Requirement: Similitud trigram con umbral local

La búsqueda por texto MUST combinar las coincidencias parciales `ILIKE` con el operador trigram `%` de `pg_trgm`, con `pg_trgm.similarity_threshold` fijado en `0.15` de forma local a la transacción de la consulta. Con términos de 1 o 2 caracteres MUST omitirse la rama `%` y usarse solo `ILIKE`.

#### Scenario: Tolerancia a errores de tipeo

- **WHEN** el término difiere levemente de una palabra del título o la ubicación y la similitud trigram alcanza `0.15`
- **THEN** la publicación aparece en los resultados

#### Scenario: Término corto

- **WHEN** `q` tiene 1 o 2 caracteres
- **THEN** la consulta usa solo `ILIKE` y responde `200` con las coincidencias parciales

### Requirement: Paginación y orden estable

El listado SHALL aceptar `page` (entero, mínimo 1, predeterminado 1) y `pageSize` (entero, mínimo 1, máximo 50, predeterminado 12). La respuesta MUST incluir `items`, `page`, `pageSize`, `total` y `totalPages`. El orden MUST ser fijo y estable: `createdAt DESC, id DESC`. Una página posterior a la última MUST devolver `items: []` sin error.

#### Scenario: Valores predeterminados

- **WHEN** se solicita el listado sin `page` ni `pageSize`
- **THEN** responde con `page: 1`, `pageSize: 12` y `totalPages` calculado sobre `total`

#### Scenario: Paginación sin solapamiento

- **WHEN** se solicitan dos páginas consecutivas con el mismo `pageSize`
- **THEN** los identificadores no se repiten y el orden se mantiene entre páginas

#### Scenario: Página fuera de rango

- **WHEN** `page` supera `totalPages`
- **THEN** responde `200` con `items: []` y los totales reales

### Requirement: Detalle público de publicación activa

El sistema SHALL exponer `GET /api/v1/publications/:id`. El detalle MUST devolver únicamente publicaciones con `status=ACTIVE`. Si la publicación no existe o no está activa, MUST responder `404` con `code=PUBLICATION_NOT_FOUND`, sin revelar si el identificador existe con otro estado.

#### Scenario: Detalle de publicación activa

- **WHEN** se solicita el detalle de una publicación activa por su UUID
- **THEN** responde `200` con los datos de la publicación

#### Scenario: Publicación inexistente o no activa

- **WHEN** el UUID no existe o corresponde a una publicación `RESERVED`, `RETURNED` o `CLOSED`
- **THEN** responde `404` con `code=PUBLICATION_NOT_FOUND`

### Requirement: Validación de parámetros e identificadores

Los parámetros del listado y el identificador del detalle SHALL validarse con el contrato de errores existente. Valores inválidos o parámetros desconocidos MUST responder `400` con `code=VALIDATION_ERROR` y `details[]` por campo; un identificador que no sea UUID MUST responder `400` con detalle del campo `id`.

#### Scenario: Parámetros inválidos

- **WHEN** `page=0`, `pageSize=51`, `q` supera 100 caracteres o se envía un parámetro no admitido
- **THEN** responde `400` con `code=VALIDATION_ERROR` y `details[]`

#### Scenario: Identificador inválido

- **WHEN** el identificador del detalle no es un UUID
- **THEN** responde `400` con `code=VALIDATION_ERROR` y detalle del campo `id`

### Requirement: Interfaz de búsqueda y detalle

La SPA SHALL ofrecer el listado en `/publications` y el detalle en `/publications/:id`, con navegación desde el shell. El listado MUST mostrar estados de carga, vacío, error y resultados, MUST permitir enviar una búsqueda y MUST paginar. La ruta `/` y la ruta `/found` MUST conservar su comportamiento.

#### Scenario: Búsqueda desde la interfaz

- **WHEN** el usuario envía un término en `/publications`
- **THEN** la SPA consulta `GET /api/v1/publications` con `q`, `page` y `pageSize` y muestra los resultados

#### Scenario: Acceso al detalle

- **WHEN** el usuario selecciona un resultado
- **THEN** navega a `/publications/:id` y muestra el detalle público

#### Scenario: Estados del listado

- **WHEN** la consulta está en curso, no devuelve resultados o falla
- **THEN** la SPA muestra carga, vacío o error respectivamente

#### Scenario: Rutas independientes

- **WHEN** se navega a `/`, `/found`, `/publications` y `/publications/:id`
- **THEN** cada ruta muestra su página sin interferir con las demás

### Requirement: Sin regresión y verificación acotada

La incorporación del listado y el detalle MUST conservar el comportamiento de CU1 y CU2. La verificación real de CU3 MUST eliminar únicamente las filas que ella misma crea y MUST dejar intactas las filas preexistentes, incluidas las evidencias persistidas de CU1 y CU2.

#### Scenario: CU1 y CU2 sin cambios

- **WHEN** se registran publicaciones perdidas y encontradas después de incorporar CU3
- **THEN** ambos endpoints responden `201` y persisten igual que antes

#### Scenario: Limpieza acotada

- **WHEN** se ejecuta `scripts/verify-cu3.ps1`
- **THEN** elimina solo las filas creadas por el script, por ID exacto, y el conteo vuelve al valor inicial
