# publications Specification

## Purpose
Define el comportamiento del registro de publicaciones de objetos encontrados (`FOUND`) sobre el modelo de publicaciones compartido de LostFound: validación, identidad, valores controlados por el servidor, persistencia y respuesta HTTP, además del formulario Angular que lo opera.

## Requirements

### Requirement: Registro de publicación de objeto encontrado

El sistema SHALL exponer `POST /api/v1/found-publications` para registrar una publicación de objeto encontrado. El servidor MUST establecer `type=FOUND`, `status=ACTIVE` y el `ownerId` a partir del usuario resuelto por la identidad del entorno; el cliente MUST NOT poder fijar esos valores. Una solicitud válida MUST persistirse en la tabla `publications` y responder `201` con el recurso creado.

#### Scenario: Registro válido
- **WHEN** se envía una solicitud válida con la identidad de desarrollo resuelta
- **THEN** responde `201` con `type=FOUND`, `status=ACTIVE` y el `ownerId` del usuario resuelto
- **AND** la fila persistida en `publications` contiene exactamente esos valores y los datos enviados

#### Scenario: Campos controlados por el servidor
- **WHEN** la solicitud incluye `type`, `status` o `ownerId` en el cuerpo
- **THEN** responde `400` con `code=VALIDATION_ERROR`
- **AND** no persiste ninguna fila con valores elegidos por el cliente

### Requirement: Validación compartida de la solicitud

La solicitud de registro de objeto encontrado SHALL cumplir las mismas reglas de validación que el registro de objeto perdido: título de 3 a 120 caracteres, descripción de 10 a 1000, una de las nueve categorías acordadas, ubicación de 3 a 120 caracteres y fecha de evento `YYYY-MM-DD` válida y no futura. El texto MUST recortarse antes de validar.

#### Scenario: Datos inválidos
- **WHEN** falta un campo obligatorio o viola una regla compartida (longitudes, categoría fuera de las nueve, fecha futura o inválida)
- **THEN** responde `400` con `code=VALIDATION_ERROR` y `details[]` con un detalle por campo

#### Scenario: Texto con espacios extremos
- **WHEN** los campos de texto llegan con espacios al inicio o al final
- **THEN** el servidor los recorta y acepta la solicitud si el contenido recortado cumple las reglas

### Requirement: Identidad local en el registro de objetos encontrados

El registro de objetos encontrados SHALL resolver el usuario con la misma identidad local que el registro de objetos perdidos mientras no exista autenticación JWT.

#### Scenario: Identidad ausente
- **WHEN** no se envía `X-Demo-User-Id` en `AUTH_MODE=demo`
- **THEN** responde `401` con `code=DEMO_IDENTITY_REQUIRED`

#### Scenario: Identidad inválida
- **WHEN** el encabezado no es un UUID o no identifica un usuario existente
- **THEN** responde `401` con `code=DEMO_IDENTITY_INVALID`

### Requirement: Formulario de objeto encontrado en el frontend

La SPA SHALL ofrecer el registro de objetos encontrados en la ruta `/found`, reutilizando las categorías, validaciones y manejo de errores del formulario de objetos perdidos. La ruta `/lost` del CU1 MUST conservar su comportamiento y la navegación MUST permitir alternar entre ambos formularios.

#### Scenario: Registro desde la interfaz
- **WHEN** el usuario completa el formulario de `/found` con datos válidos y lo envía
- **THEN** la SPA envía `POST /api/v1/found-publications` con la identidad local y muestra la confirmación con el identificador de la publicación

#### Scenario: Errores del formulario
- **WHEN** el envío falla por validación (`400`), identidad (`401`) o conexión
- **THEN** la SPA muestra el error por campo, el mensaje de identidad o el mensaje de conexión respectivamente

#### Scenario: Rutas independientes
- **WHEN** se navega a `/` y a `/found`
- **THEN** cada ruta muestra su formulario correspondiente sin interferir con la otra

### Requirement: Sin regresión del registro de objeto perdido

El endpoint y el formulario del CU1 SHALL conservar su comportamiento tras incorporar el registro de objetos encontrados, incluida la validación compartida extraída a una definición común. Las verificaciones del CU2 MUST NOT eliminar ni modificar datos preexistentes, incluida la evidencia persistida del CU1.

#### Scenario: CU1 sin cambios
- **WHEN** se registra una publicación de objeto perdido válida después de incorporado el CU2
- **THEN** responde `201` con `type=LOST` y `status=ACTIVE` y persiste la fila igual que antes

#### Scenario: Limpieza acotada de la verificación
- **WHEN** se ejecuta la verificación real del CU2 contra PostgreSQL
- **THEN** el script elimina únicamente las filas que él mismo creó y deja intactas las filas preexistentes, incluida la evidencia del CU1

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

La SPA SHALL ofrecer el listado en `/publications` y el detalle en `/publications/:id`, con navegación desde el shell. El listado MUST mostrar estados de carga, vacío, error y resultados, MUST permitir enviar una búsqueda y MUST paginar. Las rutas `/lost` y `/found` MUST conservar su comportamiento.

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

### Requirement: Proyección pública completa del detalle

El detalle `GET /api/v1/publications/:id` SHALL devolver todos los campos públicos de una publicación activa: `id`, `type`, `status`, `title`, `description`, `category`, `location`, `eventDate`, `createdAt` y `updatedAt`. La respuesta MUST NOT incluir `ownerId`, datos de contacto ni información del usuario.

#### Scenario: Detalle con todos los campos públicos

- **WHEN** se solicita el detalle de una publicación `ACTIVE`
- **THEN** responde `200` con `id`, `type`, `status=ACTIVE`, `title`, `description`, `category`, `location`, `eventDate`, `createdAt` y `updatedAt`

#### Scenario: Detalle sin información privada

- **WHEN** se consulta cualquier detalle público
- **THEN** la respuesta no contiene `ownerId` ni claves de usuario o contacto

### Requirement: Presentación legible del detalle

La SPA SHALL mostrar en `/publications/:id` todos los campos públicos del detalle con etiquetas en español para tipo, categoría y estado. Las fechas MUST mostrarse en formato legible y conservar un valor de máquina en el atributo `datetime`. La vista MUST NOT mostrar `ownerId` ni datos de contacto.

#### Scenario: Detalle completo en la interfaz

- **WHEN** la consulta del detalle responde `200`
- **THEN** la vista muestra título, descripción, ubicación, tipo, categoría, estado activo, fecha del evento, fecha de creación, fecha de actualización e identificador

#### Scenario: Etiquetas y fechas legibles

- **WHEN** se presentan `type`, `category`, `status`, `eventDate`, `createdAt` y `updatedAt`
- **THEN** el tipo, la categoría y el estado usan etiquetas en español
- **AND** cada fecha muestra un texto legible y conserva su valor original en `datetime`

#### Scenario: Sin datos privados en la vista

- **WHEN** se renderiza el detalle
- **THEN** la vista no contiene `ownerId` ni datos de contacto del propietario

### Requirement: Navegación contextual entre listado y detalle

Cuando el detalle se abre desde `/publications`, la SPA SHALL conservar `q`, `type`, `category`, `eventDateFrom`, `eventDateTo`, `sort` y `page` como contexto de navegación. El enlace de regreso MUST volver a `/publications` con exactamente esos parámetros. Un acceso directo a `/publications/:id` sin contexto MUST volver a `/publications` sin parámetros agregados.

#### Scenario: Abrir el detalle desde resultados filtrados

- **WHEN** el usuario abre el detalle de un resultado con búsqueda, filtros, orden o página activos
- **THEN** el contexto de esos criterios se conserva en la navegación al detalle
- **AND** el enlace de regreso apunta a `/publications` con los mismos criterios

#### Scenario: Volver al listado con los criterios

- **WHEN** el usuario usa el enlace de regreso desde un detalle abierto con contexto
- **THEN** la SPA vuelve a `/publications` con los mismos `q`, `type`, `category`, `eventDateFrom`, `eventDateTo`, `sort` y `page`

#### Scenario: Acceso directo al detalle

- **WHEN** el usuario abre `/publications/:id` directamente sin contexto de listado
- **THEN** el enlace de regreso apunta a `/publications` sin parámetros agregados

### Requirement: Sin regresión de CU1–CU4

La incorporación de CU5 MUST conservar los endpoints, validaciones, filtros, orden, paginación y formularios de CU1–CU4. CU5 MUST NOT agregar migraciones ni modificar datos preexistentes. La verificación MUST comprobar que las filas de evidencia de los casos anteriores permanecen intactas.

#### Scenario: Regresión funcional de CU1–CU4

- **WHEN** se ejecutan las suites y verificaciones de CU1, CU2, CU3 y CU4 después de incorporar CU5
- **THEN** todas siguen en verde sin cambios de comportamiento

#### Scenario: Integridad de los datos de evidencia

- **WHEN** se ejecuta la verificación real de CU5
- **THEN** solo crea y elimina las filas que ella misma genera
- **AND** las filas preexistentes de CU1 y CU2 permanecen intactas

### Requirement: Gestión de publicaciones propias CU9

El sistema SHALL permitir al usuario autenticado consultar sus publicaciones en `/api/v1/publications/mine`, consultar el detalle propio, editar publicaciones propias `ACTIVE` y cerrarlas lógicamente. Un ADMIN SHALL poder listar y cerrar publicaciones `ACTIVE` de otros usuarios. La eliminación de publicaciones MUST NOT estar disponible.

#### Scenario: Consulta de publicaciones propias
- **WHEN** el usuario consulta `/my-publications`
- **THEN** ve sus publicaciones en todos los estados

#### Scenario: Edición de publicación propia activa
- **WHEN** el propietario edita una publicación `ACTIVE`
- **THEN** se actualizan sus campos y se regeneran sus coincidencias sugeridas

#### Scenario: Intento de editar una publicación no activa
- **WHEN** el propietario intenta editar una publicación que no está `ACTIVE`
- **THEN** responde `409 PUBLICATION_NOT_EDITABLE`

#### Scenario: Cierre lógico
- **WHEN** el propietario cierra una publicación `ACTIVE` sin solicitudes pendientes o aprobadas
- **THEN** la publicación pasa a `CLOSED` y conserva su registro

#### Scenario: Eliminación
- **WHEN** el usuario busca una acción para eliminar publicaciones
- **THEN** la aplicación no ofrece eliminación; solo cierre lógico

