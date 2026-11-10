# Proposal

## Why

CU10 está implementado como asistente exclusivamente orientativo, pero no tenía una especificación OpenSpec propia. La entrega necesita dejar explícito que el chatbot no busca publicaciones, no muestra coincidencias, no gestiona solicitudes y no modifica datos.

## What Changes

- Documentar el asistente orientativo y sus límites.
- Documentar la obtención del rol desde NestJS mediante MCP.
- Documentar la identidad de demostración `X-Demo-User-Id`, sin JWT.
- Documentar el MCP de solo lectura con `get_user_context`.
- Mantener sin cambios las especificaciones de CU1–CU7.

## Impact

- Capacidad nueva documentada: `assistant`.
- No hay cambios de código, contratos, base de datos ni configuración.
- CU8 y CU9 permanecen fuera de esta entrega.

## Out of Scope

- Búsqueda o coincidencias desde el chatbot.
- Creación, consulta o gestión de solicitudes desde el chatbot.
- JWT, login, panel ADMIN o memoria persistente.
