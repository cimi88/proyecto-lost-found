# Proposal

## Why

CU1 cerró de punta a punta el registro de objetos perdidos, pero un usuario que encuentra un objeto todavía no puede publicarlo: el sistema solo recibe publicaciones `LOST`. El caso de uso 2 del modelo de dominio (registrar una publicación encontrada) es el paso siguiente aprobado y comparte entidad, validaciones e identidad con CU1, por lo que incorporarlo ahora es de bajo riesgo y desbloquea los casos de uso futuros de búsqueda y coincidencias.

## What Changes

- Nuevo endpoint `POST /api/v1/found-publications` que registra publicaciones con `type=FOUND` y `status=ACTIVE`, con el propietario derivado de la identidad local (`X-Demo-User-Id` en `AUTH_MODE=demo`).
- Extracción de un DTO base compartido `CreatePublicationDto` con las validaciones actuales; `CreateLostPublicationDto` y el nuevo `CreateFoundPublicationDto` lo extienden sin duplicar reglas.
- Nueva respuesta `FoundPublicationResponse` (`type: 'FOUND'`) y método de servicio `createFoundPublication` que reutiliza el punto único de persistencia.
- Nuevo formulario Angular en la ruta `/found` con navegación desde el shell; la ruta `/` de CU1 queda intacta.
- Contrato HTTP v1 manual `found-publication.ts` y actualización de documentación (arquitectura, READMEs de backend y frontend, scripts).
- Script `scripts/verify-cu2.ps1` para la verificación real HTTP → NestJS → PostgreSQL, incluido un caso anti-spoof de `type`/`status`/`ownerId`, con limpieza acotada a las filas que crea.
- Sin migraciones: el esquema existente ya acepta `type=FOUND` y `status=ACTIVE`.

## Capabilities

### New Capabilities

- `publications`: registro de publicaciones de objetos sobre el modelo compartido: validación, identidad, valores controlados por el servidor, persistencia, respuesta HTTP y formulario de registro.

### Modified Capabilities

Ninguna. `backend-foundation` no cambia sus requisitos.

## Impact

- Backend: `backend/src/publications/**` (DTO base, DTO found, controlador found, servicio, respuesta, módulo), `backend/test/` (e2e found), `backend/README.md`, `backend/package.json` (script `verify:cu2`).
- Frontend: `frontend/src/app/**` (página found, servicio, modelos, rutas, shell con navegación), `frontend/README.md`.
- Contratos: `contracts/v1/found-publication.ts` (nuevo), `contracts/v1/README.md`, comentario de sincronización de `contracts/v1/lost-publication.ts`.
- Base de datos: sin cambios de esquema; se persisten filas `FOUND` en la tabla `publications` existente.
- Documentación: `docs/architecture.md`, `openspec/changes/cu2-registrar-objeto-encontrado/**`, `odd/tasks/cu2-registrar-objeto-encontrado.md`, `scripts/README.md`.
