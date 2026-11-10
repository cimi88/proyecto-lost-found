# Spec Delta

## Purpose

Define el comportamiento del registro de publicaciones de objetos encontrados (`FOUND`) sobre el modelo de publicaciones compartido de LostFound: validación, identidad, valores controlados por el servidor, persistencia y respuesta HTTP, además del formulario Angular que lo opera.

## ADDED Requirements

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

La SPA SHALL ofrecer el registro de objetos encontrados en la ruta `/found`, reutilizando las categorías, validaciones y manejo de errores del formulario de objetos perdidos. La ruta `/` del CU1 MUST conservar su comportamiento y la navegación MUST permitir alternar entre ambos formularios.

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
