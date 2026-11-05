# Tasks

## 1. Scaffold y toolchain

- [x] 1.1 Inventariar `backend/` antes de escribir: al inicio de la etapa debía contener solo `README.md`, sin archivos de aplicación de la Etapa 0.0. Generar la plantilla CommonJS oficial en un directorio temporal con `schematics @nestjs/schematics:application --type=cjs --name backend --directory backend --language ts --package-manager npm --strict` (Nest CLI 12.0.11 no acepta `nest new --type=cjs`), copiar los archivos de aplicación, configuración y pruebas a `backend/` y conservar el README. Verificación: existen `backend/package.json`, `backend/package-lock.json`, `backend/nest-cli.json`, `backend/tsconfig.json`, `backend/tsconfig.build.json`, `backend/jest.config.ts`, `backend/.prettierrc` y `backend/src/main.ts`; `backend/package.json` no tiene `"type": "module"` ni archivos Vitest; el README original sigue presente y `git status` solo muestra archivos esperados.
- [x] 1.2 Fijar en `backend/package.json` las versiones aprobadas: NestJS 12.3.2, Nest CLI 12.0.11, TypeScript 6.0.3, Jest 30.5.2 y `ts-jest` 29.4.15; confirmar `module: nodenext` y `moduleResolution: nodenext` en `tsconfig.json`. Verificación: `npm install` termina sin errores, `npm ls @nestjs/core typescript jest ts-jest` muestra las versiones fijadas y `tsconfig.json` conserva `nodenext` en ambas opciones.
- [x] 1.3 Verificar que la salida compilada sea CommonJS real y ejecutable con Node.js 24. Verificación: `npm run build` termina con código 0, `dist/main.js` contiene `"use strict"`, `Object.defineProperty(exports` y `require(`, sin `import` ESM, y `node dist/main.js` arranca el proceso con Node.js 24.20.0.

## 2. Configuración por variables de entorno

- [x] 2.1 Implementar `src/config/env.validation.ts` con validación de `NODE_ENV` (`development`, `test`, `production`; por defecto `development`) y `PORT` (entero 1–65535; por defecto `3000`), tratando los valores vacíos como ausentes y lanzando un error que nombra la variable sin imprimir el valor. Verificación: prueba unitaria con casos ausente, vacío, válido e inválido; `npm test -- env.validation` termina en verde.
- [x] 2.2 Implementar `src/config/configuration.ts` y registrar `ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env', validate })` en `AppModule`. `configuration()` reutiliza `validateEnv(process.env)` para obtener los valores normalizados y evitar que `Number('')` produzca `0`. Verificación: la aplicación arranca con `.env` presente y aplica `NODE_ENV=development` y `PORT=3000` cuando no hay variables o están vacías; pruebas unitarias de defaults, vacío, válido e inválido en verde.
- [x] 2.3 Crear `backend/.env.example` con solo `NODE_ENV` y `PORT`, sin `DATABASE_URL` ni secretos. Verificación: `git check-ignore backend/.env backend/.env.local` devuelve ambas rutas, `git check-ignore backend/.env.example` no devuelve nada, y `git status` incluye `.env.example` pero no `.env`.
- [x] 2.4 Documentar en `backend/README.md` las variables soportadas y sus valores por defecto. Verificación: el README lista `NODE_ENV=development` y `PORT=3000`, y no menciona credenciales ni cadenas de conexión.
- [x] 2.5 Agregar pruebas de arranque con `PORT` o `NODE_ENV` inválidos. Verificación: un test que lanza el proceso con `PORT` no numérico y otro con `NODE_ENV` inválido comprueban código de salida distinto de cero y un mensaje que menciona la variable sin repetir el valor recibido; `npm test -- env.validation` o la suite correspondiente termina en verde.

## 3. Endpoint de salud

- [x] 3.1 Implementar `HealthModule` y `HealthController` con `GET health` respondiendo `200` y `{ "status": "ok", "timestamp": "<ISO-8601>" }`, sin dependencias externas. Verificación: prueba unitaria del controlador valida estado y forma del cuerpo; `npm test -- health.controller` en verde.
- [x] 3.2 Configurar `app.setGlobalPrefix('api')` en `src/main.ts` y el puerto desde la configuración. Verificación: `npm run start` levanta la app y `GET http://localhost:3000/api/health` responde 200 con `status: ok`.
- [x] 3.3 Implementar la prueba e2e `test/health.e2e-spec.ts` que crea la aplicación con el prefijo `api`, consulta `/api/health` sin `Authorization` y valida estado 200 y cuerpo. Verificación: `npm run test:e2e` termina en verde.
- [x] 3.4 Verificar que el endpoint y las suites no requieren base de datos ni autenticación. Verificación: `npm run test` y `npm run test:e2e` pasan en un entorno sin PostgreSQL y sin variables de base de datos.

## 4. Documentación y cierre de la etapa

- [x] 4.1 Actualizar `backend/README.md` con instalación, configuración, arranque, comandos relevantes de `package.json`, explicación de `--experimental-vm-modules`, nota histórica sobre las dependencias de la Etapa 0.1 y ejemplo de `GET /api/health`. Verificación: se siguen los comandos documentados en un entorno limpio con Node.js 24 y el endpoint responde 200.
- [x] 4.2 Actualizar el estado de la Etapa 0.2 en `README.md` y `docs/roadmap.md`, manteniendo `backend/`, `/api/health` y la Etapa 0.3 como inicio de TypeORM/PostgreSQL. Verificación: ambos documentos coinciden en ruta, endpoint y estado, y `git diff --check` no reporta errores.
- [x] 4.3 Ejecutar la verificación integral del backend con Node.js 24.20.0. Verificación: `npm run build`, `npm test`, `npm run test:e2e` y `npm run test:cov` terminan con código 0; el proceso compilado arranca con `node dist/main.js` y responde `GET /api/health`; `openspec validate etapa-0-2-backend-base --strict` y `git diff --check` pasan.
- [x] 4.4 Auditar el alcance de la etapa. Verificación: `npm ls typeorm pg` no encuentra paquetes, no existen rutas de autenticación, usuarios ni publicaciones, no se creó `apps/api` y `git status` no muestra cambios en `frontend/`, `ai-service/` ni `contracts/`.

## Workflow follow-up

- Ejecutar `openspec validate etapa-0-2-backend-base --strict` antes de la revisión.
- Revisar los artefactos implementados y, con autorización explícita, continuar con el cierre del cambio.
- Archivar el cambio solo después de la autorización explícita y de completar las verificaciones.
