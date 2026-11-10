# Tasks

## 1. Backend

- [x] 1.1 Extraer `CreatePublicationDto` (base compartida con las validaciones actuales), hacer que `CreateLostPublicationDto` extienda la base y crear `CreateFoundPublicationDto`. Verificación: la matriz de pruebas `create-publication.dto.spec.ts` pasa para ambas subclases, incluido el rechazo de los campos extra `type`/`status`/`ownerId`.
- [x] 1.2 Crear `FoundPublicationResponse` con su mapper y agregar `createFoundPublication` a `PublicationsService` reutilizando un helper privado de persistencia. Verificación: `publications.service.spec.ts` pasa con las pruebas de CU1 sin cambios y las nuevas de found (`FOUND`/`ACTIVE`/owner recibido).
- [x] 1.3 Crear `FoundPublicationsController` (`v1/found-publications`, `DemoIdentityGuard`, `@CurrentUser()`) y registrarlo en `PublicationsModule`. Verificación: `test/found-publications.e2e-spec.ts` pasa (201, 400 anti-spoof, 400 validación, 401 identidad, sin persistencia de inválidas).
- [x] 1.4 Documentar el endpoint found y `npm run verify:cu2` en `backend/README.md` y agregar el script `verify:cu2` a `backend/package.json`. Verificación: las secciones existen y el comando `npm run verify:cu2 --prefix backend` ejecuta el script (ver grupo 4).

## 2. Frontend

- [x] 2.1 Crear `found-publication.models.ts` y `FoundPublicationsService` (`POST /v1/found-publications`). Verificación: el spec del componente verifica la URL y el payload del POST.
- [x] 2.2 Crear la página `CreateFoundPublicationPageComponent` (formulario, validaciones, errores, confirmación) reutilizando `eventDateValidator` y las categorías. Verificación: `create-found-publication-page.component.spec.ts` pasa (form inválido no llama a la API; envío válido; 400/401/conexión).
- [x] 2.3 Agregar la ruta `/found` y la navegación del shell manteniendo `/` intacta. Verificación: `app.routes.spec.ts` pasa (`/` → lost, `/found` → found, desconocida → `/`, nav con dos enlaces) y el `app.spec.ts` existente pasa sin cambios.
- [x] 2.4 Documentar CU2 en `frontend/README.md`. Verificación: la sección describe ruta, campos, endpoint y navegación.

## 3. Contratos y documentación

- [x] 3.1 Crear `contracts/v1/found-publication.ts` y actualizar `contracts/v1/README.md` y el comentario de sincronización de `lost-publication.ts`. Verificación: el contrato refleja request/response/errores implementados y el README lista el archivo y el endpoint.
- [x] 3.2 Actualizar `docs/architecture.md` (§4.1, §4.2, §6.4, §8) con el endpoint y la ruta `/found`. Verificación: las secciones mencionan el CU2 sin reescribir el contenido histórico.
- [x] 3.3 Crear el cambio OpenSpec `cu2-registrar-objeto-encontrado` (proposal, specs, design, tasks). Verificación: `openspec validate cu2-registrar-objeto-encontrado --strict` pasa.

## 4. Verificación

- [x] 4.1 Suites y builds: backend `npm test`, `npm run test:e2e`, `npm run build`; frontend `npm test -- --watch=false`, `npm run build`. Verificación: todos los comandos pasan con resultados observados.
- [x] 4.2 Verificación real del CU2: `npm run verify:cu2 --prefix backend` (HTTP → NestJS → PostgreSQL, incluido anti-spoof y limpieza acotada). Verificación: todas las comprobaciones del script pasan.
- [x] 4.3 Regresión completa de CU1: suites existentes sin modificar + `npm run verify:cu1 --prefix backend` + verificación real del flujo en `/`. Verificación: todo pasa y la evidencia de CU1 sigue en `lostfound_dev`.
- [x] 4.4 Flujo real Angular `/found` → NestJS → PostgreSQL en navegador. Verificación: POST observado con `201`, fila persistida y recuperada, sin errores de consola.

## Workflow follow-up

- Archivar el cambio (`openspec archive`) cuando el usuario apruebe la revisión de CU2; el usuario definió que no se realizan commits ni push en esta iteración.

## Notas de verificación (2026-11-06)

- Suites observadas por el orquestador: backend `npm test` 9 suites / 70 pruebas; `npm run test:e2e` 3 suites / 12 pruebas; frontend `npm test -- --watch=false` 6 archivos / 23 pruebas. Builds de backend y frontend correctos.
- `openspec validate cu2-registrar-objeto-encontrado --strict`: válido.
- `npm run verify:cu2 --prefix backend`: 15/15 comprobaciones contra PostgreSQL real. `npm run verify:cu1 --prefix backend`: 14/14 (regresión CU1).
- Flujo real de navegador en `/found`: POST `201` observado, fila persistida y recuperada, sin errores de consola. El flujo real de `/` corresponde a la evidencia de cierre de CU1.
- La comprobación de "fecha futura" de `verify-cu2.ps1` y `verify-cu1.ps1` usa `UTC + 2 días` para ser determinista respecto del reloj UTC del validador compartido.
