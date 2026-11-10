# assistant Specification

## Purpose
Documenta el asistente CU10 actual: explica LostFound, prepara publicaciones y solicitudes, muestra una vista previa y ejecuta las tres operaciones permitidas únicamente después de confirmación explícita.

## Requirements

### Requirement: Preparación de acciones

El asistente SHALL poder preparar:

- publicaciones de objetos perdidos;
- publicaciones de objetos encontrados;
- solicitudes de recuperación.

La preparación MUST crear una acción en memoria y devolver una vista previa. La
preparación MUST NOT ejecutar la operación ni escribir en NestJS, MCP o
PostgreSQL.

#### Scenario: Preparar publicación
- **WHEN** el usuario proporciona los campos obligatorios de una publicación
- **THEN** el asistente muestra la vista previa y la acción queda pendiente de confirmación

#### Scenario: Preparar recuperación
- **WHEN** el usuario proporciona un UUID de publicación válido
- **THEN** el asistente prepara la solicitud y la deja pendiente de confirmación

### Requirement: Confirmación explícita

El asistente MUST NOT ejecutar una acción hasta que el usuario pulse Confirmar en
la interfaz. FastAPI SHALL invocar la herramienta MCP de escritura solo después
de esa confirmación. El modelo MUST NOT ejecutar escrituras directamente.

#### Scenario: Acción pendiente
- **WHEN** una acción fue preparada pero no confirmada
- **THEN** el asistente indica que todavía no fue ejecutada

#### Scenario: Confirmación
- **WHEN** el usuario confirma una acción pendiente
- **THEN** FastAPI ejecuta la herramienta MCP correspondiente y muestra el resultado real

### Requirement: Límites del asistente

El asistente MUST NOT:

- buscar publicaciones;
- consultar detalles o estados de publicaciones;
- listar publicaciones propias;
- consultar coincidencias;
- editar, cerrar o eliminar publicaciones;
- aprobar, rechazar o cancelar solicitudes de recuperación;
- registrar devoluciones;
- ejecutar acciones administrativas;
- contactar a otros usuarios.

#### Scenario: Pedido de lectura
- **WHEN** el usuario pide buscar o consultar publicaciones reales
- **THEN** el asistente explica que solo puede orientar y preparar las tres acciones permitidas

### Requirement: Identidad demo

La identidad MUST propagarse con `X-Demo-User-Id` mientras `AUTH_MODE=demo`. El
rol MUST obtenerse desde NestJS mediante MCP. El cliente MUST NOT fijar el rol.
JWT MUST NOT presentarse como implementado.

#### Scenario: Perfiles demo
- **WHEN** el usuario inicia sesión con un perfil demo
- **THEN** su UUID se propaga a NestJS, FastAPI y MCP

#### Scenario: Identidad ausente o inválida
- **WHEN** falta `X-Demo-User-Id` o no identifica un usuario
- **THEN** FastAPI responde `401`

### Requirement: MCP de lectura y escritura

El MCP propio SHALL exponer `get_user_context` y las herramientas de escritura
`create_lost_publication`, `create_found_publication` y
`create_recovery_request`. Las herramientas de escritura MUST ser invocadas por
FastAPI tras confirmación y MUST NOT recibir `userId` ni `role`.

#### Scenario: Herramientas disponibles
- **WHEN** se listan las herramientas MCP
- **THEN** aparecen la consulta de rol y las tres herramientas de creación

### Requirement: Persistencia local de conversaciones

Las conversaciones MUST conservarse en localStorage separadas por UUID de perfil
demo y MUST NOT compartirse entre perfiles. FastAPI MUST NOT persistir el
historial en PostgreSQL.

#### Scenario: Cambio de perfil
- **WHEN** el usuario cambia de perfil demo
- **THEN** el historial visible corresponde al nuevo UUID y no mezcla conversaciones del anterior
