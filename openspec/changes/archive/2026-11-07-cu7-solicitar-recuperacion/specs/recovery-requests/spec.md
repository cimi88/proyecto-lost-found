# Spec Delta

## Purpose

Permite a un usuario autenticado solicitar la recuperación de una publicación `FOUND` activa y al propietario gestionar la solicitud hasta reservar la publicación, sin exponer datos privados ni alterar las lecturas públicas existentes.

## ADDED Requirements

### Requirement: Creación de solicitud sobre publicación encontrada activa

El sistema SHALL permitir a un usuario autenticado crear una solicitud sobre una publicación `FOUND` con `status=ACTIVE` mediante `POST /api/v1/publications/:id/recovery-requests`. El servidor MUST fijar el solicitante desde la identidad resuelta y el estado inicial `PENDING`, y MUST aceptar `notes` opcional de hasta 500 caracteres recortados. El propietario MUST NOT poder solicitarla.

#### Scenario: Creación válida
- **WHEN** un usuario autenticado que no es propietario solicita una `FOUND` activa
- **THEN** responde `201` con la solicitud en `PENDING`, el solicitante resuelto y la publicación asociada
- **AND** la fila se persiste con las notas recortadas o en `NULL` si no se enviaron

#### Scenario: Publicación no apta
- **WHEN** el identificador no existe, no está `ACTIVE` o no corresponde a una `FOUND`
- **THEN** responde `404` con `code=PUBLICATION_NOT_FOUND` y no persiste ninguna solicitud

#### Scenario: Publicación reservada no admite nuevas solicitudes
- **WHEN** la publicación está `RESERVED`, `RETURNED` o `CLOSED`
- **THEN** responde `404` con `code=PUBLICATION_NOT_FOUND` y no persiste la solicitud

#### Scenario: El propietario intenta solicitar
- **WHEN** el propietario de la publicación envía la solicitud
- **THEN** responde `403` con `code=RECOVERY_REQUEST_FORBIDDEN` y no persiste ninguna solicitud

#### Scenario: Datos inválidos
- **WHEN** `notes` supera 500 caracteres o el cuerpo incluye campos desconocidos
- **THEN** responde `400` con `code=VALIDATION_ERROR` y `details[]` por campo

### Requirement: Identidad y campos controlados por el servidor

Los endpoints de solicitudes MUST requerir la identidad resuelta por la costura vigente. Sin identidad o con identidad inválida MUST responder `401` con `DEMO_IDENTITY_REQUIRED` o `DEMO_IDENTITY_INVALID`. El cliente MUST NOT fijar `requesterId`, `status`, `cancelledById` ni el propietario de la publicación.

#### Scenario: Identidad ausente
- **WHEN** se llama a un endpoint de solicitudes sin `X-Demo-User-Id` en modo demo
- **THEN** responde `401` con `code=DEMO_IDENTITY_REQUIRED`

#### Scenario: Identidad inválida
- **WHEN** el encabezado no es un UUID o no identifica un usuario existente
- **THEN** responde `401` con `code=DEMO_IDENTITY_INVALID`

#### Scenario: Intento de fijar campos del servidor
- **WHEN** el cuerpo incluye `requesterId`, `status` o `ownerId`
- **THEN** responde `400` con `code=VALIDATION_ERROR` y un detalle por campo

### Requirement: Solicitud activa única por publicación y solicitante

El sistema SHALL impedir más de una solicitud `PENDING` o `APPROVED` para la misma pareja publicación/solicitante mediante una restricción única parcial. Un segundo intento MUST responder `409` con `code=RECOVERY_REQUEST_DUPLICATE`. Tras una solicitud `REJECTED` o `CANCELLED`, el usuario MUST poder crear una nueva.

#### Scenario: Intento duplicado
- **WHEN** el mismo usuario ya tiene una solicitud `PENDING` o `APPROVED` sobre esa publicación
- **THEN** responde `409` con `code=RECOVERY_REQUEST_DUPLICATE` y no crea otra fila

#### Scenario: Distintos solicitantes
- **WHEN** dos usuarios distintos solicitan la misma publicación activa
- **THEN** ambas solicitudes se crean en `PENDING`

#### Scenario: Nueva solicitud tras rechazo o cancelación
- **WHEN** la solicitud anterior está `REJECTED` o `CANCELLED` y el usuario vuelve a solicitar
- **THEN** responde `201` con una nueva solicitud `PENDING`

### Requirement: Consulta de solicitudes propias y recibidas

`GET /api/v1/recovery-requests/mine` SHALL devolver las solicitudes del solicitante autenticado. `GET /api/v1/recovery-requests/received` SHALL devolver las solicitudes de publicaciones cuyo propietario es el usuario autenticado. Ambas MUST ordenar por `createdAt DESC, id DESC`, incluir el resumen público de la publicación y MUST NOT incluir `ownerId`, correo ni identificadores internos de usuario.

#### Scenario: Mis solicitudes
- **WHEN** el solicitante autenticado consulta `mine`
- **THEN** recibe solo sus solicitudes, con publicación, estado, notas y fechas

#### Scenario: Solicitudes recibidas
- **WHEN** el propietario consulta `received`
- **THEN** recibe solo las solicitudes de sus publicaciones, con nombre visible del solicitante, estado, notas y fechas

#### Scenario: Sin solicitudes
- **WHEN** el usuario no tiene solicitudes propias o recibidas
- **THEN** responde `200` con un arreglo vacío

### Requirement: Aprobación transaccional de la solicitud

El propietario SHALL poder aprobar una solicitud `PENDING` en una transacción con bloqueo pesimista de publicación y solicitud. MUST verificar `ACTIVE` y `PENDING`; luego la solicitud pasa a `APPROVED`, la publicación a `RESERVED` y las demás `PENDING` a `REJECTED`. Si la publicación no está `ACTIVE`, responde `404 PUBLICATION_NOT_FOUND`; si la solicitud no está `PENDING`, `409 RECOVERY_REQUEST_NOT_PENDING`. Sin cambios ante error.

#### Scenario: Aprobación con otras solicitudes pendientes
- **WHEN** el propietario aprueba una solicitud pendiente y existen otras `PENDING` para la misma publicación
- **THEN** la solicitud elegida pasa a `APPROVED`, la publicación a `RESERVED` y las demás a `REJECTED`

#### Scenario: Solicitud no pendiente
- **WHEN** se intenta aprobar una solicitud `APPROVED`, `REJECTED`, `CANCELLED` o `COMPLETED`
- **THEN** responde `409` con `code=RECOVERY_REQUEST_NOT_PENDING` y no cambia estados

#### Scenario: Publicación no disponible
- **WHEN** la publicación ya no está `ACTIVE` al aprobar
- **THEN** responde `404` con `code=PUBLICATION_NOT_FOUND` y no reserva ni cambia la solicitud

#### Scenario: Aprobación por otro usuario
- **WHEN** un usuario distinto del propietario intenta aprobar
- **THEN** responde `403` con `code=RECOVERY_REQUEST_FORBIDDEN`

#### Scenario: Aprobaciones concurrentes
- **WHEN** dos aprobaciones compiten por la misma publicación
- **THEN** solo una deja la publicación `RESERVED` y una única solicitud `APPROVED`
- **AND** la otra aborta sin cambios con `404 PUBLICATION_NOT_FOUND` o `409 RECOVERY_REQUEST_NOT_PENDING`

### Requirement: Exclusividad de aprobación por publicación

El sistema MUST garantizar como máximo una solicitud `APPROVED` por publicación mediante un índice único parcial sobre `publication_id WHERE status='APPROVED'` y la verificación transaccional. Si al aprobar ya existe una `APPROVED` para la publicación, MUST abortar con `409 RECOVERY_REQUEST_CONFLICT` sin cambios. Una publicación `RESERVED` MUST NOT admitir nuevas solicitudes ni aprobaciones.

#### Scenario: Segunda aprobación bloqueada
- **WHEN** una publicación ya tiene una solicitud `APPROVED` y se intenta aprobar otra
- **THEN** responde `409` con `code=RECOVERY_REQUEST_CONFLICT` y solo queda una `APPROVED`

#### Scenario: Publicación reservada
- **WHEN** la publicación está `RESERVED` y se intenta crear o aprobar una solicitud
- **THEN** responde `404` con `code=PUBLICATION_NOT_FOUND` y no crea ni aprueba nada

### Requirement: Rechazo de solicitud pendiente

El propietario SHALL poder rechazar una solicitud `PENDING`. La solicitud MUST pasar a `REJECTED` y la publicación MUST permanecer `ACTIVE`. Una solicitud que no esté `PENDING` MUST responder `409` con `code=RECOVERY_REQUEST_NOT_PENDING`; un usuario que no sea el propietario MUST recibir `403`.

#### Scenario: Rechazo válido
- **WHEN** el propietario rechaza una solicitud pendiente
- **THEN** la solicitud pasa a `REJECTED` y la publicación sigue `ACTIVE`

#### Scenario: Rechazo de solicitud no pendiente
- **WHEN** el propietario intenta rechazar una solicitud que ya no está `PENDING`
- **THEN** responde `409` con `code=RECOVERY_REQUEST_NOT_PENDING`

#### Scenario: Rechazo por otro usuario
- **WHEN** un usuario distinto del propietario intenta rechazar
- **THEN** responde `403` con `code=RECOVERY_REQUEST_FORBIDDEN`

### Requirement: Cancelación con actor y motivo

El solicitante SHALL poder cancelar su solicitud `PENDING`; el solicitante, el propietario o un ADMIN SHALL poder cancelar una `APPROVED`. Toda cancelación MUST exigir un `reason` recortado de 3 a 500 caracteres, aportado por el actor, y MUST registrar `cancelled_by_id` y `cancellation_reason` al pasar a `CANCELLED`. Estados terminales MUST responder `409 RECOVERY_REQUEST_NOT_CANCELLABLE`.

#### Scenario: Cancelar una solicitud pendiente propia
- **WHEN** el solicitante cancela su solicitud `PENDING` con un motivo válido
- **THEN** la solicitud pasa a `CANCELLED` y registra actor y motivo

#### Scenario: Cancelar una solicitud aprobada
- **WHEN** el solicitante, el propietario o un ADMIN cancela una `APPROVED` con motivo válido
- **THEN** la solicitud pasa a `CANCELLED` y la publicación vuelve a `ACTIVE`

#### Scenario: Motivo inválido
- **WHEN** el motivo falta, es más corto que 3 o supera 500 caracteres
- **THEN** responde `400` con `code=VALIDATION_ERROR` y detalle del campo `reason`

#### Scenario: Cancelación no permitida
- **WHEN** el propietario intenta cancelar una `PENDING`, o se intenta cancelar una solicitud terminal
- **THEN** responde `403` o `409 RECOVERY_REQUEST_NOT_CANCELLABLE` según corresponda

### Requirement: Cancelación transaccional de una solicitud aprobada

Cancelar una `APPROVED` MUST ejecutarse en una única transacción con bloqueo pesimista de la publicación. Dentro de la transacción MUST verificar que la solicitud siga `APPROVED`, que la publicación siga `RESERVED` y que esa solicitud sea la única `APPROVED` de la publicación. Si se cumple, la solicitud pasa a `CANCELLED` y la publicación a `ACTIVE`. Cualquier inconsistencia MUST abortar sin reactivar la publicación con `409 RECOVERY_REQUEST_CONFLICT`.

#### Scenario: Cancelación aprobada válida
- **WHEN** la solicitud es la única `APPROVED` y la publicación sigue `RESERVED`
- **THEN** la solicitud pasa a `CANCELLED` y la publicación a `ACTIVE` en la misma transacción

#### Scenario: Reserva inconsistente
- **WHEN** la publicación no está `RESERVED` o la solicitud no es la única `APPROVED` que justifica la reserva
- **THEN** responde `409` con `code=RECOVERY_REQUEST_CONFLICT` y la publicación no se reactiva

### Requirement: Privacidad de las respuestas

Las respuestas de solicitudes MUST exponer `id`, `status`, `notes`, `cancellationReason`, fechas, resumen público de la publicación y nombre visible del solicitante. MUST NOT exponer `ownerId`, `requesterId`, `cancelledById`, correo ni datos de contacto. Las notas y motivos MUST ser visibles solo en operaciones autenticadas autorizadas.

#### Scenario: Respuesta sin datos internos
- **WHEN** se consulta una solicitud autorizada
- **THEN** la respuesta no contiene `ownerId`, `requesterId`, `cancelledById`, correo ni datos de contacto

#### Scenario: Nombre visible del solicitante
- **WHEN** el propietario consulta las solicitudes recibidas
- **THEN** ve el nombre visible del solicitante y sus notas, sin correo ni identificadores internos

### Requirement: Semántica de fechas de la solicitud

Las respuestas SHALL incluir `createdAt` (momento de creación de la solicitud) y `updatedAt` (última modificación de la fila). `updatedAt` MUST NOT interpretarse ni mostrarse como fecha de aprobación, rechazo o cancelación. No se agregan marcas temporales de decisión salvo requisito funcional justificado.

#### Scenario: Fechas en la respuesta
- **WHEN** se consulta una solicitud
- **THEN** `createdAt` representa su creación y `updatedAt` su última modificación

#### Scenario: Etiquetas en la interfaz
- **WHEN** la SPA muestra una solicitud
- **THEN** etiqueta las fechas como «Creada» y «Última actualización»
- **AND** no las presenta como «Aprobada», «Rechazada» ni «Cancelada»

### Requirement: Relación con coincidencias y lecturas públicas

Una solicitud MUST NOT modificar el estado de una coincidencia de CU6. Las tarjetas de sugerencia cuyo candidato sea `FOUND` SHALL ofrecer la acción de solicitar recuperación. Al aprobar, la publicación `RESERVED` MUST dejar de aparecer en el listado, el detalle y las coincidencias públicas; al cancelar la aprobada, MUST volver a `ACTIVE` y reaparecer si conserva coincidencias.

#### Scenario: Acción desde una sugerencia
- **WHEN** una sugerencia tiene un candidato `FOUND` activo
- **THEN** la interfaz permite iniciar la solicitud de recuperación de ese candidato
- **AND** la coincidencia conserva su estado `SUGGESTED`

#### Scenario: Publicación reservada
- **WHEN** una solicitud es aprobada
- **THEN** el listado, el detalle y las coincidencias públicas dejan de mostrar la publicación `RESERVED`

#### Scenario: Cancelación de la aprobada
- **WHEN** se cancela la solicitud `APPROVED`
- **THEN** la publicación vuelve a `ACTIVE` y puede volver a mostrarse en las lecturas públicas

### Requirement: Interfaz de solicitudes en Angular

La SPA SHALL mostrar en el detalle de una `FOUND` activa un formulario de solicitud con notas opcionales y el estado de la solicitud propia vigente. SHALL ofrecer `/recovery-requests` («Mis solicitudes») y `/recovery-requests/received` («Solicitudes recibidas») con estados de carga, vacío y error, etiquetas de estado en español y acciones permitidas.

#### Scenario: Solicitar desde el detalle
- **WHEN** el usuario envía el formulario en una `FOUND` activa
- **THEN** la SPA crea la solicitud y muestra su estado `PENDING` o el error correspondiente

#### Scenario: Mis solicitudes
- **WHEN** el solicitante abre `/recovery-requests`
- **THEN** ve sus solicitudes y puede cancelar las `PENDING` o `APPROVED` permitidas con motivo

#### Scenario: Solicitudes recibidas
- **WHEN** el propietario abre `/recovery-requests/received`
- **THEN** ve las solicitudes de sus publicaciones y puede aprobar o rechazar las `PENDING` y cancelar las `APPROVED`

#### Scenario: Estados vacíos y de error
- **WHEN** no hay solicitudes o falla la consulta
- **THEN** la interfaz muestra un estado vacío o un error con reintento, respectivamente

### Requirement: Compatibilidad con CU1–CU6

CU7 MUST conservar los contratos, validaciones, rutas y pantallas de CU1–CU6. Las lecturas públicas MUST seguir limitadas a `ACTIVE` y los endpoints existentes MUST conservar su forma y comportamiento.

#### Scenario: Regresión de CU1–CU6
- **WHEN** se ejecutan las suites y verificaciones de CU1–CU6 después de CU7
- **THEN** todas siguen en verde y las evidencias de CU1/CU2 permanecen intactas

#### Scenario: Lecturas públicas sin cambios
- **WHEN** se consulta el listado, el detalle o las coincidencias después de CU7
- **THEN** solo se exponen publicaciones `ACTIVE` y se mantienen los contratos previos
