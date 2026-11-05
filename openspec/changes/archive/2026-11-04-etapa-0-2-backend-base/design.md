# Design

## Context

Al inicio de la Etapa 0.2, el repositorio estaba en Etapa 0.1: existían documentación, ADRs y un `backend/README.md`, pero no había aplicación ni dependencias instaladas. **Estado inicial de `backend/`:** contenía únicamente `README.md` versionado; la verificación de la Etapa 0.0 se había ejecutado en una carpeta temporal descartable y no dejó archivos de aplicación. No había nada que reutilizar, pero tampoco se debía asumir que el directorio estaba vacío: el README debía preservarse.

Las decisiones que condicionan esta etapa ya están aprobadas en ADR 0001, ADR 0002 y ADR 0007, y en `docs/architecture.md` §4.2 y §7:

- Backend NestJS en `backend/`, no en `apps/api`.
- CommonJS con `module: nodenext` y `moduleResolution: nodenext`.
- Endpoint de la etapa `GET /api/health`.
- TypeORM y PostgreSQL comienzan en la Etapa 0.3.

Verificación de toolchain realizada para este diseño: `@nestjs/cli@12.0.11` es la versión actual; su comando `nest new` **no** expone `--type`. El schematic `application` de `@nestjs/schematics@12.0.12` sí acepta `type: cjs | esm` (por defecto `esm`) y selecciona plantillas distintas: la CJS usa `module: nodenext`, `moduleResolution: nodenext`, Jest y `package.json` sin `"type": "module"`; la ESM usa `"type": "module"`, Vitest y `await bootstrap()` de nivel superior, incompatible con CommonJS.

Ver `proposal.md` para la motivación y `specs/backend-foundation/spec.md` para los requisitos.

## Goals / Non-Goals

**Goals:**

- Producir un backend mínimo, ejecutable y verificable en Windows con Node.js 24.
- Dejar la configuración por entorno centralizada y preparada para crecer sin acoplar módulos funcionales.
- Verificar unitarias y e2e con la toolchain ya aprobada (Jest 30 y `ts-jest` 29).

**Non-Goals:**

- No se define capa de persistencia, entidades, migraciones ni `DATABASE_URL`.
- No se define autenticación, autorización, usuarios ni dominio.
- No se introduce `@nestjs/terminus` ni chequeos de dependencias externas.
- No se crea `package.json` raíz, workspace ni pipeline de CI.

## Decisions

### 1. Scaffold con la plantilla CommonJS oficial

Al inicio de la Etapa 0.2, `backend/` contenía solo `README.md`; no había archivos de aplicación de la Etapa 0.0 que conservar ni duplicar. Para no depender de una opción inexistente:

- `nest new` de `@nestjs/cli@12.0.11` **no** acepta `--type=cjs`.
- Se invoca directamente el schematic `application` con `type=cjs` mediante el CLI de schematics que Nest CLI instala como dependencia (`@angular-devkit/schematics-cli@22.2.3`):
  `schematics @nestjs/schematics:application --type=cjs --name backend --directory backend --language ts --package-manager npm --strict`
- Se ejecuta en un directorio temporal, se copian los archivos de aplicación, configuración y pruebas a `backend/` y se conserva el `README.md` existente, fusionando las instrucciones nuevas en él. Se omiten los archivos de ejemplo o herramientas no usadas (`AGENTS.md`, `.gitattributes`, `.oxlintrc.json`).
- Si el CLI de schematics no está disponible, se crean los archivos CJS explícitamente a partir de la plantilla oficial, sin usar `nest new --type=cjs`.

**Alternativa descartada:** `nest new` y conversión posterior de ESM a CJS. La plantilla ESM usa `"type": "module"`, Vitest y `await bootstrap()` de nivel superior; convertirla exige reescribir arranque, pruebas y configuración, con más riesgo que generar directamente la plantilla CJS.

**Alternativa descartada:** `nest g application --type=cjs`. `--type` existe en `nest generate`, pero ese comando opera sobre un workspace existente y puede disparar la conversión a monorepo; no es un scaffold limpio.

### 2. CommonJS con `module: nodenext`, sin degradar a `CommonJS`/`Node`

Se mantienen `module: nodenext` y `moduleResolution: nodenext` del ADR 0002 y de la plantilla CJS oficial. Con `package.json` sin `"type": "module"`, TypeScript trata los `.ts` como CommonJS y emite `require(...)`; no hay una incompatibilidad concreta que justifique `module: CommonJS` y `moduleResolution: Node`. El `target` es `ES2023` y `types` incluye `node` y `jest`.

Verificación obligatoria: `npm run build` y luego `node dist/main.js` con Node.js 24.20.0; `dist/main.js` debe contener `"use strict"`, `Object.defineProperty(exports, ...)` y `require(...)`, sin `import` ESM.

**Alternativa descartada:** `module: CommonJS` + `moduleResolution: Node`. Cambiaría la resolución de paquetes con `exports` y se apartaría de una configuración ya verificada sin una incompatibilidad demostrada.

### 3. Configuración global con `@nestjs/config` y validación propia

`ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env', validate })` con una función `validateEnv` en `src/config/env.validation.ts`. La función valida `NODE_ENV` (`development`, `test`, `production`) y `PORT` (entero entre 1 y 65535), aplica los valores por defecto **`NODE_ENV=development`** y **`PORT=3000`** cuando no están definidos o están vacíos, y lanza un error que nombra la variable sin imprimir valores sensibles.

`src/config/configuration.ts` reutiliza `validateEnv(process.env)` para obtener los valores ya normalizados y exponer `nodeEnv` y `port`; no vuelve a parsear `PORT` con `Number(...)`. Así la validación y la fábrica de configuración aplican un único criterio y un `PORT` vacío no se convierte en `0`.

La validación se prueba en dos niveles: unitario sobre `validateEnv` (ausente, vacío, válido e inválido) y de arranque con `PORT` o `NODE_ENV` inválidos, que deben terminar con código distinto de cero y un mensaje que mencione la variable sin repetir el valor recibido. `configuration()` también se prueba con defaults, valores vacíos, válidos e inválidos.

**Alternativa descartada:** Joi o `class-validator` para validar entorno. Agrega dependencias y ceremonia sin beneficio para dos variables.

### 4. Endpoint de salud propio, sin Terminus

`HealthController` con `@Controller('health')` y prefijo global `api`, lo que produce `GET /api/health`. Responde `200` con `{ "status": "ok", "timestamp": "<ISO-8601>" }`. No consulta base de datos ni servicios externos.

**Alternativa descartada:** `@nestjs/terminus`. Aporta chequeos que esta etapa no necesita y obligaría a declarar indicadores de salud prematuros.

### 5. Prefijo global `api` y versionado futuro por controlador

Se usa `app.setGlobalPrefix('api')` para cumplir `/api/health`. Las etapas posteriores expondrán rutas versionadas como `v1/...` en sus controladores, sin cambiar el prefijo global ni romper el endpoint de salud.

**Alternativa descartada:** prefijo global `api/v1`. Dejaría el health en `/api/v1/health`, fuera de lo aprobado para la etapa.

### 6. Estructura inicial de carpetas

```text
backend/
  src/
    main.ts
    app.module.ts
    config/
      configuration.ts
      configuration.spec.ts
      env.validation.ts
      env.validation.spec.ts
      env.validation.startup.spec.ts
    health/
      health.controller.ts
      health.controller.spec.ts
      health.module.ts
  test/
    health.e2e-spec.ts
    jest-e2e.json
  .env.example
  .prettierrc
  jest.config.ts
  nest-cli.json
  package.json
  package-lock.json
  README.md
  tsconfig.json
  tsconfig.build.json
```

La plantilla CJS genera `app.controller.ts`, `app.service.ts` y sus pruebas; se retiran cuando `HealthModule` los reemplaza, para no dejar endpoints de ejemplo fuera de alcance.

La configuración de entorno vive en `src/config/` y cada capacidad se registra como módulo independiente. `AppModule` solo compone: configuración global y `HealthModule`.

**Alternativa descartada:** estructura por capas (`controllers/`, `services/`) desde el inicio. No hay casos de uso todavía y dificultaría el crecimiento por capacidad.

### 7. Pruebas con Jest 30, `ts-jest` 29 y `supertest`

Se conserva la configuración CommonJS del scaffold. Pruebas unitarias para `HealthController`, `validateEnv` y `configuration`; prueba e2e que crea la aplicación, aplica el prefijo `api` y consulta `/api/health`. Los scripts de `backend/package.json` incluyen `build`, `format`, `start`, `start:dev`, `start:debug`, `start:prod`, `test`, `test:watch`, `test:cov`, `test:debug` y `test:e2e`.

Los scripts de Jest usan `node --experimental-vm-modules` porque NestJS 12 publica paquetes ESM y el runtime de Jest debe habilitar `require(esm)`; sin ese flag, Jest rechaza `@nestjs/common` antes de ejecutar las pruebas.

**Alternativa descartada:** Vitest. La Etapa 0.0 ya verificó Jest con esta combinación y cambiarlo exigiría otra validación.

### 8. Variables de entorno de la etapa

Solo `NODE_ENV` (por defecto `development`) y `PORT` (por defecto `3000`), documentadas en `.env.example`. `DATABASE_URL` se incorpora en la Etapa 0.3 junto con TypeORM, para no sugerir una conexión inexistente.

Reglas reales del `.gitignore` raíz, verificadas con `git check-ignore`:

- `.env` (línea 32) ignora `backend/.env`.
- `.env.*` (línea 33) con la excepción `!.env.example` (línea 34) permite versionar `backend/.env.example`.
- `*.local` (línea 69) ignora `backend/.env.local`.

`backend/.env.example` es versionable y no contiene secretos, credenciales ni `DATABASE_URL`.

### 9. Dependencias confinadas al backend

`backend/package.json` administra sus propias dependencias, sin workspaces ni `package.json` raíz, conforme ADR 0007. Se fijan las versiones verificadas: NestJS 12.3.2, Nest CLI 12.0.11, TypeScript 6.0.3, Jest 30.5.2 y `ts-jest` 29.4.15.

## Risks / Trade-offs

- **Dependencias ESM-only de NestJS bajo CommonJS** → la Etapa 0.0 ya verificó `require(esm)` con Node 24; se repite `npm run build` y arranque compilado como verificación de cierre.
- **Nest CLI no acepta `--type` en `nest new`** → se usa el schematic `application` con `type=cjs`; si el CLI de schematics no está disponible, se crean los archivos CJS desde la plantilla oficial. No se usa `nest new --type=cjs`.
- **Plantilla ESM incompatible con CommonJS** → no se convierte ESM; se genera la plantilla CJS, que evita `"type": "module"`, Vitest y `await bootstrap()` de nivel superior.
- **Scaffold sobre `backend/` con un README preexistente** → se inventaría el directorio antes de escribir y se copia desde temporal; el README se conserva y se revisa `git status` para detectar pérdidas.
- **`module: nodenext` bajo CommonJS** → se verifica la salida real con `dist/main.js` y `node dist/main.js` en Node 24; no se cambia a `CommonJS`/`Node` sin una incompatibilidad demostrada.
- **Jest 30 con `ts-jest` 29** → versiones ya probadas en 0.0; si el scaffold instala otras, se fijan las aprobadas y se valida la suite.
- **Validación y fábrica de configuración divergentes** → `validateEnv` centraliza la normalización y `configuration()` la reutiliza; las pruebas cubren valores vacíos, válidos e inválidos para evitar que `Number('')` produzca `0`.
- **Prefijo `api` sin versión** → el health no se versiona a propósito; se documenta que las rutas de negocio usarán `v1/...` en sus controladores.
- **Configuración temprana invita a agregar secretos** → `.env.example` solo lista variables no sensibles y la validación no imprime valores.
- **Windows sin Docker** → todos los comandos se documentan para PowerShell y no dependen de contenedores.

## Migration Plan

No hay datos ni servicios en ejecución. El cambio se aplica creando el proyecto en `backend/` y actualizando documentación; el rollback consiste en revertir el commit de la etapa y eliminar los archivos generados, sin migraciones de base de datos.

## Open Questions

Ninguna. Las decisiones pendientes de versionado de Angular, Python y persistencia pertenecen a etapas posteriores y no afectan este diseño.
