# ADR 0011: Asistente con preparación y confirmación de acciones

- **Estado:** Aceptado
- **Fecha:** 2026-11-07
- **Actualizado:** 2026-11-10

## Contexto

CU10 debe ofrecer un asistente útil sin duplicar reglas de negocio ni permitir
que el modelo ejecute escrituras por su cuenta. El proyecto no tiene JWT
implementado; la identidad disponible es la costura demo `X-Demo-User-Id`
(ADR 0008).

## Decisión

### Preparación

El asistente puede:

- explicar las funcionalidades reales de LostFound;
- preparar publicaciones de objetos perdidos;
- preparar publicaciones de objetos encontrados;
- preparar solicitudes de recuperación;
- mostrar una vista previa con los datos que serán ejecutados.

Las herramientas de preparación crean acciones en memoria y no escriben en
NestJS, PostgreSQL ni MCP.

### Confirmación y ejecución

- La operación solo se ejecuta después de que el usuario pulse «Confirmar» en
  la interfaz.
- FastAPI invoca la herramienta MCP de escritura correspondiente únicamente tras
  la confirmación.
- El modelo no ejecuta escrituras directamente.
- La vista previa incluye los datos de la operación y su estado inicial.
- Las acciones pendientes, en ejecución, completadas, canceladas, expiradas o
  reemplazadas se reflejan en la interfaz.
- El asistente no puede aprobar, rechazar ni cancelar solicitudes de
  recuperación, registrar devoluciones, editar o cerrar publicaciones, ni
  ejecutar acciones administrativas.

### MCP propio

El servidor FastMCP propio expone:

- `get_user_context`: consulta el rol actual en NestJS.
- `create_lost_publication`: crea una publicación perdida tras confirmación.
- `create_found_publication`: crea una publicación encontrada tras confirmación.
- `create_recovery_request`: crea una solicitud de recuperación tras
  confirmación.

Las herramientas de escritura son invocadas por FastAPI, no por el modelo. No
reciben `userId` ni `role` como argumentos: la identidad se propaga con
`X-Demo-User-Id` desde Angular hasta NestJS mientras `AUTH_MODE=demo`.

### Identidad y persistencia

- La identidad es de demostración y no autenticación real de producción.
- No hay JWT/RS256 implementado.
- FastAPI no persiste historial en PostgreSQL.
- Las conversaciones se conservan en `localStorage`, separadas por el UUID del
  perfil demo activo.
- El historial no se comparte entre los perfiles demo.
- Los tokens de confirmación y las acciones pendientes viven en memoria; el
  `PendingActionStore` no se persiste en la base.

### Capacidades pendientes

Siguen sin implementarse:

- búsqueda o consulta de publicaciones desde el asistente;
- consulta de coincidencias desde el asistente;
- gestión de solicitudes de recuperación desde el asistente;
- edición, cierre o eliminación desde el asistente;
- aprobación, rechazo, cancelación o devolución desde el asistente;
- contacto con otros usuarios;
- autenticación real y JWT.

## Consecuencias

- El asistente puede ejecutar tres operaciones de creación, siempre con
  confirmación explícita.
- NestJS sigue siendo la única fuente de verdad del dominio.
- FastAPI y MCP no acceden a PostgreSQL ni reimplementan reglas.
- La costura demo sigue siendo spoofeable y no es apta para producción.
- Cualquier ampliación de herramientas MCP requiere autorización explícita y
  nuevas pruebas de aislamiento y autorización.
