# CU1 — Registrar objeto perdido

Objetivo: vertical slice completo (Angular → NestJS → PostgreSQL) para registrar una publicación `LOST`.
Rama: `main` (sin commits ni push por pedido del usuario). Entrega: un solo árbol de trabajo, sin slices commiteados.
Runner: backend Jest 30.5.2 + ts-jest; frontend el runner que fije el scaffold de Angular 22.

## Specs

- **S1** — PostgreSQL 18.6-5 mediante winget, instalación interactiva de EDB. Antes de ejecutar el instalador: verificar que el puerto 5432 esté libre y que no existan instalaciones, servicios ni directorios de datos anteriores. Ante conflicto, detenerse e informar. Las contraseñas las ingresa el usuario; no se guardan en archivos versionados, comandos visibles ni registros.
- **S2** — Base de datos `lostfound_dev` y rol propietario `lostfound_app`; configurar la conexión del backend contra esa base.
- **S3** — Identidad temporal `X-Demo-User-Id`, exclusivamente para desarrollo local, con las salvaguardas y documentación propuestas: no es autenticación, no aporta confidencialidad ni autorización real, y no compromete la futura integración JWT RS256.
- **S4** — Mantener las nueve categorías acordadas y sus validaciones coherentes entre frontend, backend y contrato: `ELECTRONICS`, `DOCUMENTS`, `KEYS`, `BAGS`, `CLOTHING`, `ACCESSORIES`, `BOOKS`, `SPORTS`, `OTHER`.
- **S5** — TypeORM 0.3.31 (no 1.x).
- **S6** — No desarrollar `scripts/verify-contracts.mjs` en esta iteración. Contratos manuales; la coherencia de categorías se verifica mediante pruebas.
- **S7** — Mantener el resto del alcance y las verificaciones propuestas: formulario Angular, validaciones, persistencia real en PostgreSQL, endpoint REST NestJS `POST /api/v1/lost-publications`, manejo de errores, confirmación de éxito y pruebas esenciales.
- **S8** — No realizar commits ni push. No avanzar a CU2 ni a otros casos de uso.
- **S9** — Al finalizar, verificar el flujo real desde Angular hasta PostgreSQL y presentar resultados comprobados; no declarar completado nada no comprobado.
- **S10** — Fuera de alcance: búsqueda, filtros, detalle, coincidencias, solicitudes, devoluciones, autenticación JWT real, imágenes, publicaciones `FOUND`, asistente/MCP.

## Tasks

| ID | Descripción | Specs | Ruta | Estado |
|---|---|---|---|---|
| T1 | Pre-chequeos de puerto/instalaciones y instalación interactiva de PostgreSQL 18.6-5 | S1 | inline | Completada: PostgreSQL 18.6 verificado (servicio, puerto, `pg_isready`) |
| T2 | Crear rol `lostfound_app`, base `lostfound_dev` y `backend/.env` sin exponer secretos | S1, S2 | inline | Completada: rol, base y `.env` creados por el usuario; `.env` ignorado por git |
| T3 | Dependencias backend, configuración TypeORM 0.3.31, migración inicial (`users`, `publications`, seed demo, `pg_trgm`) | S2, S5 | inline | Completada: migración `InitialSchema1762300000000` aplicada y esquema verificado |
| T4 | Módulo de identidad demo con salvaguarda `NODE_ENV=production` | S3 | inline | Completada: resolver, guard, token, prueba de entorno |
| T5 | Endpoint `POST /api/v1/lost-publications`: DTO, servicio, controlador, filtro de errores | S7 | inline | Completada |
| T6 | Pruebas backend: DTO, servicio, identidad demo, e2e con repositorio mockeado | S6, S7 | inline | Completada: 8 suites/39 unitarias + 2 suites/7 e2e |
| T7 | Contratos manuales v1 y documentación de contratos | S4, S6 | inline | Completada |
| T8 | Scaffold Angular 22, formulario reactivo, servicio HTTP, interceptor demo, pruebas | S3, S4, S7 | inline | Completada: build y pruebas de frontend |
| T9 | Documentación: ADR 0008, `architecture.md`, README, READMEs de backend/frontend/scripts | S1, S3 | inline | Completada |
| T10 | Verificación real Angular → NestJS → PostgreSQL y reporte de resultados | S9 | inline | Completada: flujo real verificado en Chrome headless; fila persistida y recuperada |

## Log

### L1 — Solicitud de implementación (verbatim)

> Apruebo la implementación del CU1 con las siguientes condiciones y ajustes:
>
> 1. PostgreSQL 18.6-5 mediante winget, instalación interactiva de EDB.
> 2. Base de datos `lostfound_dev` y rol propietario `lostfound_app`.
> 3. Identidad temporal `X-Demo-User-Id`, exclusivamente para desarrollo local, con las salvaguardas y documentación propuestas.
> 4. Mantener las nueve categorías acordadas y sus validaciones coherentes.
> 5. Utilizar TypeORM 0.3.31 en lugar de 1.1.2, para priorizar estabilidad y reducir riesgos durante la implementación.
> 6. No desarrollar `scripts/verify-contracts.mjs` en esta iteración. Mantener los contratos manuales y verificar la coherencia de las categorías mediante pruebas.
> 7. Mantener el resto del alcance y las verificaciones propuestas.
>
> **Autorizo la instalación de PostgreSQL y las modificaciones e instalaciones de dependencias necesarias para implementar CU1.**
>
> Antes de ejecutar el instalador:
> - Verificá nuevamente que el puerto 5432 esté libre.
> - Confirmá que no existan instalaciones, servicios ni directorios de datos anteriores que puedan verse afectados.
> - Si detectás algún conflicto, detenete e informame.
>
> Durante la instalación, solicitame que ingrese personalmente las contraseñas. No las guardes en archivos versionados, comandos visibles ni registros.
>
> Después de instalar PostgreSQL, creá el rol y la base de datos indicados, configurá la conexión y continuá con la implementación completa de CU1.
>
> No realices commits ni push. No avances al CU2.
>
> Al finalizar, verificá el flujo real desde Angular hasta PostgreSQL y presentame los resultados. No declares completado nada que no hayas comprobado.

### L2 — Pre-chequeos (2026-11-04)

Puerto 5432 libre; sin servicios, directorios, claves de registro, paquetes winget/choco, `psql` en PATH ni `pgpass.conf`. Manifiesto winget 18.6-5 confirmado: `InstallerType: exe`, `Scope: machine`, switches silenciosos `--mode unattended` (no aptos: exigirían contraseña en argv). Se usará `--override "--mode interactive"`.

### L3 — Decisiones de implementación

- TypeORM 0.3.31 fijado; `@nestjs/typeorm` 12.0.2.
- Migración inicial: `gen_random_uuid()` (nativo PG 13+), `CHECK` de `type`/`status`/`category`, FK `owner_id`, índice `owner_id`, `CREATE EXTENSION IF NOT EXISTS pg_trgm` (exigido por `docs/architecture.md` §7). `search_text` se difiere a la CU de búsqueda.
- Seed del usuario demo en la migración, idempotente.
- Suites backend sin base de datos; la persistencia real se comprueba con el script de verificación y el flujo manual.
- Sin commits ni push.

### L4 — Implementación y evidencia (2026-11-05)

- PostgreSQL 18.6-5 instalado y verificado: servicio `postgresql-x64-18` en estado Running/Automatic, puerto 5432 escuchando, `pg_isready` acepta conexiones, `pg_hba.conf` con `scram-sha-256`.
- Backend: dependencias fijadas (`@nestjs/typeorm` 12.0.2, `typeorm` 0.3.31, `pg` 8.23.1, `class-validator` 0.15.1, `class-transformer` 0.5.1, `dotenv` 18.0.9); migración inicial, entidades, identidad demo, endpoint `POST /api/v1/lost-publications`, validación global y filtro de errores.
- Pruebas backend: `npm test` → 8 suites/39 pruebas; `npm run test:e2e` → 2 suites/7 pruebas. Todas pasan sin base de datos.
- Frontend: Angular 22.2.x con SCSS; formulario reactivo, servicio HTTP, interceptor demo, configuración de producción sin identidad demo. `npm run build` y `npm test -- --watch=false` ejecutados.
- Contratos v1 manuales, ADR 0008, `architecture.md` y READMEs de backend/frontend/scripts actualizados.
- T2 completada por el usuario: rol `lostfound_app`, base `lostfound_dev` y `backend/.env` creados; `.env` está ignorado por git.
- Cierre CU1 (2026-11-05): ver L5.

### L5 — Cierre de CU1 y verificación real (2026-11-05)

- `scripts/verify-cu1.ps1`: resolución de rutas robusta fuera del bloque `param` (misma corrección que `setup-db.ps1`), independiente del directorio actual; las invocaciones nativas (`npm`, `psql`, `curl`) capturan stderr sin abortar por `$ErrorActionPreference = 'Stop'`; sintaxis validada con el parser de PowerShell.
- TypeORM: `synchronize: false` confirmado en `buildDataSourceOptions`, única configuración TypeORM del backend.
- Migración `InitialSchema1762300000000` aplicada contra `lostfound_dev`.
- Esquema verificado en PostgreSQL: tablas `users`, `publications`, `migrations`; columnas y defaults (`gen_random_uuid()`, `now()`); restricciones `users_role_check`, `publications_type_check`, `publications_status_check`, `publications_category_check`, FK `publications_owner_fk` (`ON DELETE RESTRICT`), PKs y `UNIQUE(email)`; índice `publications_owner_id_idx`; usuario demo `00000000-0000-4000-8000-000000000001`; extensión `pg_trgm`.
- `npm run verify:cu1` → 14/14 verificaciones PASS: 201, `type=LOST`, `status=ACTIVE`, owner demo, fila en PostgreSQL, validaciones 400 por `title`/`eventDate`/`category`, 401 sin header y con usuario inexistente, sin filas persistidas por requests inválidas, limpieza final.
- `verify-cu1.ps1` ejecutado también desde `C:\Users\pcboxuser` con ruta absoluta → 14/14 PASS, confirmando que la resolución de rutas no depende del directorio actual.
- Flujo real Angular → NestJS → PostgreSQL verificado en Chrome 156 headless vía CDP: la app Angular cargó, se completó y envió el formulario; el navegador emitió `POST http://localhost:3000/api/v1/lost-publications` con `X-Demo-User-Id: 00000000-0000-4000-8000-000000000001`, recibió `201` y mostró el panel de éxito. ID creado: `82d35348-d8b3-4149-9ac7-4a8cbb0fe1ec`. Sin errores de consola.
- Fila recuperada desde PostgreSQL por ID: `82d35348-d8b3-4149-9ac7-4a8cbb0fe1ec|LOST|ACTIVE|00000000-0000-4000-8000-000000000001|Billetera negra E2E 1793921489503|BAGS|Plaza Central, banco de la fuente|2026-10-31`; `count(*) = 1`. La fila de la prueba E2E queda en `lostfound_dev` como evidencia de persistencia.
- Pruebas reejecutadas: backend `npm test` → 8 suites/39 pruebas; `npm run test:e2e` → 2 suites/7 pruebas; `npm run build` OK. Frontend `npm test -- --watch=false` → 4 archivos/14 pruebas; `npm run build` OK.
- Sin commits ni push. No se avanzó a CU2.
