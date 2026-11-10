# Design

## Context

CU1 entregó el vertical completo de objetos perdidos: `POST /api/v1/lost-publications`, DTO validado por el `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`), servicio TypeORM sobre la tabla `publications`, identidad local `X-Demo-User-Id` detrás de `CURRENT_USER_RESOLVER` (ADR 0008), formulario reactivo en `/` y contratos manuales en `contracts/v1`. El esquema ya acepta `type IN ('LOST','FOUND')` y `status IN ('ACTIVE',…)` mediante restricciones `CHECK`; no se necesitan migraciones. Ver `proposal.md` para la motivación.

## Goals / Non-Goals

**Goals:**

- Registrar publicaciones `FOUND`/`ACTIVE` de punta a punta reutilizando el modelo de CU1.
- Una sola definición de validaciones (DTO base) compartida por lost y found.
- Mantener intactos el endpoint, la ruta `/` y el flujo de CU1.
- Verificación real separada (`verify-cu2.ps1`) que no toque datos ajenos.

**Non-Goals:**

- Búsqueda, filtros, detalle, coincidencias, solicitudes de recuperación, imágenes o chatbot.
- Autenticación JWT real o cambios en la costura demo.
- Refactorizaciones generales de CU1 (por ejemplo, un componente de formulario genérico compartido).
- Migraciones o cambios de esquema.

## Decisions

1. **Endpoint simétrico `POST /api/v1/found-publications`** en lugar de generalizar `POST /api/v1/publications` con `type` en el cuerpo. Alternativa considerada: un endpoint genérico; se descarta porque cambiaría el contrato de CU1 y permitiría que el cliente elija el tipo. El endpoint específico mantiene el contrato de CU1 intacto y fija el tipo en el servidor.
2. **DTO base `CreatePublicationDto`** con todas las validaciones actuales; `CreateLostPublicationDto` y `CreateFoundPublicationDto` lo extienden. `class-validator`/`class-transformer` heredan los decoradores de la base; se verifica con una matriz de pruebas que ejecuta los mismos casos para ambas subclases y con campos extra (`type`, `status`, `ownerId`) rechazados por `forbidNonWhitelisted`.
3. **Respuesta espejo `FoundPublicationResponse`** (`type: 'FOUND'`) en lugar de una respuesta genérica parametrizada. Alternativa considerada: `PublicationResponse<TType>` genérica; se descarta para no refactorizar el contrato de CU1; el espejo manual sigue la convención de contratos manuales del proyecto.
4. **Servicio con helper privado compartido**: `createLostPublication` conserva firma y comportamiento; `createFoundPublication` reutiliza el mismo punto único de persistencia. El servidor fija `type`, `status` y `ownerId`; nunca toma valores del cuerpo.
5. **Controlador separado `FoundPublicationsController`** registrado en `PublicationsModule`, reutilizando `DemoIdentityGuard` y `@CurrentUser()` sin cambios en el módulo de identidad.
6. **Ruta `/found` con CU1 intacto en `/`**: la página found es un componente nuevo que reutiliza `eventDateValidator`, categorías y patrón de errores; el shell agrega una navegación simple. Se consideró extraer un componente de formulario compartido y se pospuso: refactorizaría CU1 sin necesidad.
7. **Modelos y servicio found espejo** (`found-publication.models.ts`, `FoundPublicationsService`) siguiendo la convención de copias sincronizadas manualmente del proyecto.
8. **Verificación real separada** `scripts/verify-cu2.ps1`, espejo de `verify-cu1.ps1`, con un caso adicional anti-spoof (`type`/`status`/`ownerId` desde el cliente), que limpia por ID exacto únicamente las filas que crea.

## Risks / Trade-offs

- [La extracción del DTO base toca el archivo de validación que también usa CU1] → Las suites existentes de CU1 se ejecutan sin modificaciones y `verify-cu1.ps1` se corre de punta a punta como regresión.
- [Deriva entre los espejos manuales (modelos frontend, contratos, respuesta backend)] → Matriz de pruebas compartida para ambas subclases del DTO y verificación real que comprueba la respuesta HTTP contra el contrato.
- [Duplicación del formulario Angular] → Aceptada deliberadamente para no refactorizar CU1; validadores y categorías siguen compartidos; si la duplicación molesta más adelante, se extraerá un componente de formulario como cambio propio.
- [La verificación contra PostgreSQL podría tocar filas ajenas] → El script captura el ID creado y elimina solo esa fila; comprueba que el conteo vuelve al valor inicial; no ejecuta `DELETE` sin ID exacto.

## Migration Plan

Sin migraciones de base de datos. Despliegue: agregar el código y ejecutar `npm run db:migrate` (no-op: la migración ya está aplicada). Reversión: revertir los archivos; no hay cambios de esquema ni de datos que revertir.
