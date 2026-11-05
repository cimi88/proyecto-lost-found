# Proposal

## Why

La Etapa 0.2 necesita un backend NestJS real y ejecutable que sirva de base verificable para las etapas siguientes. Al inicio de la Etapa 0.2, `backend/` contenía únicamente su `README.md`: la verificación de la Etapa 0.0 se había hecho en una carpeta temporal descartable y no dejó archivos de aplicación que reutilizar. Sin una aplicación con configuración, endpoint de salud y pruebas no es posible validar la toolchain acordada ni el arranque del servicio.

La propuesta respeta la documentación aprobada: el backend vive en `backend/`, el endpoint de la etapa es `GET /api/health` y TypeORM/PostgreSQL quedan fuera de alcance hasta la Etapa 0.3.

## What Changes

- Inicializar la aplicación NestJS 12.3.2 con TypeScript 6.0.3 y Node.js 24.20.0 en `backend/`, en formato CommonJS, sin Nx ni npm workspaces.
- Generar la base con la plantilla CommonJS oficial del schematic `application`, sin depender de `nest new --type=cjs` (Nest CLI 12.0.11 no expone esa opción en `nest new`).
- Incorporar `@nestjs/config` como módulo global de configuración y centralizar la lectura de variables de entorno, con `NODE_ENV=development` y `PORT=3000` por defecto.
- Centralizar la normalización de `NODE_ENV` y `PORT` en `validateEnv` y reutilizarla desde `configuration()` para que la validación y la fábrica de configuración apliquen el mismo criterio, incluidos los valores vacíos.
- Versionar un `.env.example` sin secretos y mantener `.env` fuera del control de versiones.
- Exponer `GET /api/health` con una respuesta JSON estable que permita verificar que el proceso está operativo.
- Definir la estructura inicial de carpetas y módulos: arranque, módulo raíz, configuración, salud y pruebas.
- Configurar y verificar las pruebas unitarias y e2e con Jest y `supertest`, reutilizando la configuración del scaffold CommonJS cuando exista.
- Actualizar la documentación mínima afectada: `backend/README.md` y el estado de la Etapa 0.2 en `README.md` y `docs/roadmap.md`.
- **Fuera de alcance:** TypeORM, conexión a PostgreSQL, entidades, migraciones, autenticación, usuarios, publicaciones, frontend Angular y servicio Python/FastAPI.

## Capabilities

### New Capabilities

- `backend-foundation`: arranque de la aplicación NestJS, configuración por variables de entorno, endpoint de salud y base de pruebas unitarias y e2e.

### Modified Capabilities

- Ninguna. No existen specs previas en `openspec/specs/` y esta etapa no modifica requisitos de una capacidad existente.

## Impact

- **Código:** se crea el proyecto en `backend/` (`package.json`, `package-lock.json`, `nest-cli.json`, `tsconfig.json`, `tsconfig.build.json`, `jest.config.ts`, `.prettierrc`, `.env.example`, `src/` y `test/`). Al inicio de la etapa, el único archivo preexistente era `backend/README.md`; no había aplicación de la Etapa 0.0 que conservar.
- **Dependencias:** NestJS 12, `@nestjs/config`, `reflect-metadata` y `rxjs`; herramientas de desarrollo TypeScript 6, Nest CLI 12.0.11, `@nestjs/schematics`, Jest 30, `ts-jest`, `supertest`, `ts-node`, `ts-loader`, `tsconfig-paths`, `source-map-support`, Prettier y tipos asociados. Cada dependencia queda confinada a `backend/`, sin `package.json` raíz.
- **API:** nuevo endpoint `GET /api/health`.
- **Documentación:** `backend/README.md`, `README.md` y `docs/roadmap.md`.
- **Sin impacto:** `frontend/`, `ai-service/`, `contracts/`, base de datos y autenticación.
