# Spec Delta

## Purpose

Documenta el asistente orientativo de CU10: responde preguntas sobre el uso de LostFound y adapta la orientación al rol determinado por NestJS, sin ejecutar operaciones de negocio.

## ADDED Requirements

### Requirement: Asistente exclusivamente orientativo

El asistente SHALL limitarse a explicar cómo usar LostFound. MUST NOT buscar publicaciones, mostrar coincidencias, consultar o crear solicitudes, aprobar, rechazar, cancelar, registrar devoluciones ni modificar datos. Las respuestas MUST indicar la pantalla o flujo correspondiente.

#### Scenario: Consulta de uso
- **WHEN** el usuario pregunta cómo buscar, registrar una publicación o solicitar una recuperación
- **THEN** el asistente explica el flujo y la pantalla correspondiente

#### Scenario: Pedido de operación
- **WHEN** el usuario pide crear, aprobar, cancelar o modificar datos desde el chat
- **THEN** el asistente indica que solo brinda orientación y no ejecuta la operación

#### Scenario: Sin herramientas de negocio
- **WHEN** el modelo genera una respuesta
- **THEN** no dispone de herramientas de búsqueda, solicitudes ni gestión

### Requirement: Rol desde el backend e identidad demo

El rol MUST obtenerse de NestJS mediante MCP; el cliente MUST NOT enviarlo. Mientras `AUTH_MODE=demo`, la identidad MUST propagarse con `X-Demo-User-Id` desde Angular hasta NestJS. FastAPI MUST adaptar el prompt a USER o ADMIN. JWT MUST NOT presentarse como implementado.

#### Scenario: Rol USER
- **WHEN** NestJS devuelve `USER`
- **THEN** el prompt se limita a las funciones disponibles para un usuario normal

#### Scenario: Rol ADMIN
- **WHEN** NestJS devuelve `ADMIN`
- **THEN** el prompt aclara que no existe panel administrativo ni funciones globales de moderación en esta versión

#### Scenario: Identidad ausente o inválida
- **WHEN** falta `X-Demo-User-Id` o no identifica un usuario
- **THEN** FastAPI responde `401`

#### Scenario: Intento de fijar el rol
- **WHEN** el cliente envía `role` en el cuerpo del chat
- **THEN** la petición se rechaza con `400 VALIDATION_ERROR`

#### Scenario: Propagación de identidad
- **WHEN** FastAPI invoca el MCP
- **THEN** el encabezado se reenvía al MCP y el MCP lo reenvía a NestJS

### Requirement: MCP de solo lectura y conversación efímera

El MCP SHALL exponer únicamente `get_user_context`, sin argumentos `userId` ni `role`. La conversación MUST conservarse solo en memoria del navegador y MUST NOT persistirse en el servidor.

#### Scenario: Herramientas disponibles
- **WHEN** se listan las herramientas MCP
- **THEN** solo aparece `get_user_context`

#### Scenario: Sin argumentos de identidad
- **WHEN** se inspecciona la herramienta
- **THEN** no acepta `userId` ni `role`

#### Scenario: Sin memoria persistente
- **WHEN** el usuario recarga la página
- **THEN** la conversación anterior no se recupera del servidor

#### Scenario: Falla de MCP
- **WHEN** el MCP o NestJS no responden
- **THEN** FastAPI devuelve un error controlado sin inventar resultados
