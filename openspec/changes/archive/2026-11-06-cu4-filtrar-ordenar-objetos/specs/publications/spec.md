# Spec Delta

## ADDED Requirements

### Requirement: Filtro por tipo de publicación

El listado `GET /api/v1/publications` SHALL aceptar un parámetro opcional `type` con valores `LOST` o `FOUND`. Cuando se envía, la respuesta MUST incluir únicamente publicaciones `ACTIVE` de ese tipo y MUST combinar el filtro con `q`, categoría, rango de fechas y paginación mediante AND. Un valor distinto MUST responder `400` con `code=VALIDATION_ERROR`.

#### Scenario: Filtro por publicaciones perdidas

- **WHEN** se solicita `type=LOST`
- **THEN** la respuesta incluye solo publicaciones `LOST` con `status=ACTIVE`

#### Scenario: Filtro por publicaciones encontradas

- **WHEN** se solicita `type=FOUND`
- **THEN** la respuesta incluye solo publicaciones `FOUND` con `status=ACTIVE`

#### Scenario: Tipo inválido

- **WHEN** se envía un `type` distinto de `LOST` o `FOUND`
- **THEN** responde `400` con `code=VALIDATION_ERROR` y un detalle para el campo `type`

### Requirement: Filtro por categoría

El listado SHALL aceptar un parámetro opcional `category` con una de las nueve categorías acordadas. Cuando se envía, MUST incluir únicamente publicaciones `ACTIVE` de esa categoría y MUST combinarse mediante AND con los demás criterios. Un valor fuera de las nueve categorías MUST responder `400` con `code=VALIDATION_ERROR`.

#### Scenario: Filtro por categoría existente

- **WHEN** se solicita una categoría válida
- **THEN** la respuesta incluye solo publicaciones `ACTIVE` de esa categoría

#### Scenario: Categoría inválida

- **WHEN** se envía una categoría que no pertenece a las nueve acordadas
- **THEN** responde `400` con `code=VALIDATION_ERROR` y un detalle para el campo `category`

### Requirement: Filtro por rango de fechas del evento

El listado SHALL aceptar `eventDateFrom` y `eventDateTo` opcionales en formato `YYYY-MM-DD`. El rango MUST ser inclusivo sobre `event_date`; cada extremo MUST poder usarse solo y ambos MUST combinarse mediante AND. Una fecha inexistente, un formato inválido o `eventDateFrom > eventDateTo` MUST responder `400` con `code=VALIDATION_ERROR`.

#### Scenario: Rango inclusivo

- **WHEN** se envían `eventDateFrom` y `eventDateTo` válidos
- **THEN** la respuesta incluye las publicaciones cuya `event_date` está entre ambos extremos, incluidos los extremos

#### Scenario: Solo fecha inicial

- **WHEN** se envía únicamente `eventDateFrom`
- **THEN** la respuesta incluye las publicaciones con `event_date` mayor o igual a esa fecha

#### Scenario: Solo fecha final

- **WHEN** se envía únicamente `eventDateTo`
- **THEN** la respuesta incluye las publicaciones con `event_date` menor o igual a esa fecha

#### Scenario: Fecha inválida o rango invertido

- **WHEN** una fecha no existe, no cumple `YYYY-MM-DD` o `eventDateFrom` es posterior a `eventDateTo`
- **THEN** responde `400` con `code=VALIDATION_ERROR` y un detalle para el campo de fecha correspondiente

### Requirement: Combinación de filtros y búsqueda

Los filtros de tipo, categoría y fechas MUST combinarse entre sí, con `q` y con la visibilidad `status=ACTIVE` mediante AND. `total` y `totalPages` MUST calcularse sobre el conjunto filtrado. Las publicaciones `RESERVED`, `RETURNED` y `CLOSED` MUST seguir excluidas; un parámetro `status` MUST rechazarse como desconocido.

#### Scenario: Todos los filtros con búsqueda

- **WHEN** se combinan `q`, `type`, `category`, `eventDateFrom` y `eventDateTo`
- **THEN** la respuesta incluye solo publicaciones que cumplen todos los criterios y `total` refleja ese conjunto

#### Scenario: Combinación sin resultados

- **WHEN** la combinación de filtros no coincide con ninguna publicación activa
- **THEN** responde `200` con `items: []`, `total: 0` y `totalPages: 0`

#### Scenario: Estado no activo excluido

- **WHEN** existen publicaciones `RESERVED`, `RETURNED` o `CLOSED` que cumplen los filtros
- **THEN** no aparecen en `items` ni en `total`

#### Scenario: Intento de filtrar por estado

- **WHEN** se envía `status=RESERVED`, `status=RETURNED` o `status=CLOSED`
- **THEN** responde `400` con `code=VALIDATION_ERROR` por parámetro desconocido

### Requirement: Ordenamiento por fecha de creación

El listado SHALL aceptar un parámetro opcional `sort` con valores `recent` (predeterminado) y `oldest`. `recent` MUST ordenar por `createdAt DESC, id DESC`; `oldest` MUST ordenar por `createdAt ASC, id ASC`. El orden MUST ser estable y MUST aplicarse después de los filtros y antes de la paginación.

#### Scenario: Orden predeterminado

- **WHEN** no se envía `sort`
- **THEN** la respuesta usa `createdAt DESC, id DESC`

#### Scenario: Orden más antiguos primero

- **WHEN** se envía `sort=oldest`
- **THEN** la respuesta usa `createdAt ASC, id ASC`

#### Scenario: Orden estable entre páginas

- **WHEN** se solicitan páginas consecutivas con el mismo `sort` y `pageSize`
- **THEN** los identificadores no se repiten y el orden se mantiene entre páginas

### Requirement: Ordenamiento por relevancia

El listado SHALL aceptar `sort=relevance` únicamente cuando `q` tenga contenido después de recortar. La relevancia MUST ordenar por la mayor similitud trigram entre `q` y `title`, `description` o `location`, en orden descendente, y MUST desempatar por `createdAt DESC, id DESC`. Sin `q`, MUST responder `400` con `code=VALIDATION_ERROR`. La relevancia MUST reutilizar el predicado de búsqueda de CU3 y MUST NOT reimplementarlo.

#### Scenario: Relevancia con término de búsqueda

- **WHEN** se envía `q` no vacío y `sort=relevance`
- **THEN** la respuesta ordena primero las publicaciones con mayor similitud trigram y desempata por fecha e identificador

#### Scenario: Relevancia sin término

- **WHEN** se envía `sort=relevance` sin `q` o con `q` vacío
- **THEN** responde `400` con `code=VALIDATION_ERROR` y un detalle para el campo `sort`

#### Scenario: Relevancia con empate

- **WHEN** dos publicaciones tienen la misma similitud trigram
- **THEN** se ordenan por `createdAt DESC` y luego por `id DESC`

### Requirement: Paginación con filtros y orden

La paginación `page`/`pageSize` de CU3 MUST conservarse con sus predeterminados 1/12 y máximo 50. `total` MUST reflejar el conjunto filtrado y `totalPages` MUST calcularse sobre ese total. Una página posterior a la última MUST devolver `items: []` sin error, manteniendo filtros y orden.

#### Scenario: Paginación filtrada

- **WHEN** se solicitan dos páginas consecutivas con filtros y el mismo `pageSize`
- **THEN** `total` y `totalPages` corresponden al conjunto filtrado y las páginas no se solapan

#### Scenario: Página fuera de rango con filtros

- **WHEN** `page` supera `totalPages` con filtros activos
- **THEN** responde `200` con `items: []` y los totales reales

### Requirement: Validación de parámetros de filtro y orden

Los parámetros de filtro y orden MUST validarse con el contrato de errores existente. Valores inválidos, repetidos o desconocidos MUST responder `400` con `code=VALIDATION_ERROR` y `details[]` por campo. Los valores opcionales vacíos o solo con espacios MUST tratarse como ausentes.

#### Scenario: Parámetro desconocido

- **WHEN** se envía un parámetro no admitido, como `ownerId` o `status`
- **THEN** responde `400` con `code=VALIDATION_ERROR` y un detalle para ese campo

#### Scenario: Valor inválido de filtro u orden

- **WHEN** `type`, `category`, `sort` o una fecha tienen un valor inválido
- **THEN** responde `400` con `code=VALIDATION_ERROR` y un detalle para el campo correspondiente

#### Scenario: Valor opcional vacío

- **WHEN** `type`, `category`, `eventDateFrom`, `eventDateTo` o `sort` llegan vacíos o solo con espacios
- **THEN** se tratan como ausentes y la respuesta no falla por ese campo

#### Scenario: Parámetro repetido

- **WHEN** un filtro de valor único se envía más de una vez
- **THEN** responde `400` con `code=VALIDATION_ERROR` para ese campo

### Requirement: Interfaz de filtros y ordenamiento

La SPA SHALL ofrecer en `/publications` controles para tipo, categoría, rango de fechas del evento y orden. Al aplicar, MUST navegar con `q`, `page`, filtros y `sort` en la URL, MUST reiniciar a la página 1 y MUST conservar los criterios al paginar. La acción de limpiar MUST restablecer todos los criterios. La opción de relevancia MUST deshabilitarse o resolverse a `recent` cuando no haya `q`.

#### Scenario: Aplicar filtros y orden

- **WHEN** el usuario selecciona tipo, categoría, fechas u orden y envía el formulario
- **THEN** la SPA consulta `GET /api/v1/publications` con todos los criterios y `page=1`

#### Scenario: URL compartible y navegación atrás

- **WHEN** el usuario aplica filtros y recarga o comparte la URL
- **THEN** la SPA reconstruye los controles y repite la consulta con los mismos criterios

#### Scenario: Limpiar criterios

- **WHEN** el usuario activa la acción de limpiar
- **THEN** la SPA elimina `q`, filtros y `sort` de la URL y vuelve a la página 1

#### Scenario: Paginación con criterios

- **WHEN** el usuario avanza o retrocede de página con filtros activos
- **THEN** la SPA conserva `q`, filtros y `sort` en la URL y en la consulta

#### Scenario: Relevancia sin término

- **WHEN** no hay `q` y el usuario intenta seleccionar relevancia
- **THEN** la opción no se aplica y el orden efectivo es `recent`

### Requirement: Sin regresión de CU4 y verificación acotada

CU4 MUST conservar el comportamiento de CU1, CU2 y CU3. Sin filtros ni `sort`, el listado MUST producir la misma respuesta que CU3, incluido el orden `createdAt DESC, id DESC`. La verificación real de CU4 MUST eliminar únicamente las filas que crea, por ID exacto, y MUST preservar las evidencias de CU1 y CU2.

#### Scenario: Listado de CU3 sin cambios

- **WHEN** se solicita el listado solo con `q`, `page` y `pageSize`
- **THEN** la respuesta y el orden son equivalentes a CU3

#### Scenario: Regresión de CU1 y CU2

- **WHEN** se ejecutan las verificaciones de CU1 y CU2 después de CU4
- **THEN** ambas siguen pasando y sus filas de evidencia permanecen intactas

#### Scenario: Limpieza acotada de CU4

- **WHEN** se ejecuta `scripts/verify-cu4.ps1`
- **THEN** elimina solo las filas creadas por el script, por ID exacto, y el conteo vuelve al valor inicial
