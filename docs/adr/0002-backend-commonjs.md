# ADR 0002: Backend CommonJS con NestJS 12 y TypeScript 6

- **Estado:** Aceptado
- **Fecha:** 2026-11-03

## Contexto

NestJS 12, TypeScript 6.0.3 y Node.js 24.20.0 permiten trabajar con módulos ESM o CommonJS. ESM es viable, pero introduce fricción adicional en la configuración, las herramientas y algunas dependencias del ecosistema. NestJS 12 publica paquetes ESM-only que Node.js puede cargar desde CommonJS mediante `require(esm)` en versiones compatibles.

La Etapa 0.0 tenía que verificar que la combinación elegida fuera real y ejecutable, sin configurar PostgreSQL ni TypeORM.

## Decisión

El backend NestJS usa **CommonJS**:

- `package.json` sin `"type": "module"`.
- `tsconfig.json` con `module: nodenext` y `moduleResolution: nodenext`.
- Scaffold generado con el schematic `application` y `--type=cjs`.
- Node.js 24.20.0 como runtime.
- Dependencias ESM-only de NestJS cargadas mediante `require(esm)`.
- No se cambia a ESM sin un nuevo ADR y autorización.

## Verificación de Etapa 0.0

La prueba se realizó en una carpeta temporal descartable, fuera del repositorio definitivo:

- `npm run build` terminó correctamente con TypeScript 6.0.3.
- Los archivos compilados son CommonJS reales: `dist/main.js` contiene `"use strict"`, `Object.defineProperty(exports, ...)` y `require(...)`.
- No hay `import` ESM en la salida compilada.
- Node.js 24.20.0 ejecutó los archivos compilados.
- `require('@nestjs/core')` cargó el paquete ESM-only desde CommonJS.
- Se verificó que `NestFactory.create` es una función.
- Jest unitario: 2 suites y 2 tests aprobados.
- Jest e2e: 2 suites y 2 tests aprobados.
- `GET /health` respondió `200` con `{"status":"ok",...}`.
- No se instalaron TypeORM ni PostgreSQL.

La primera ejecución de la prueba `require(esm)` falló por una aserción incorrecta sobre la forma de `NestFactory` (es un objeto estático con `.create`, no una función). Se corrigió únicamente la aserción; no se cambiaron versiones ni configuración.

## Consecuencias

- El backend definitivo se inicializa en CommonJS en la Etapa 0.2.
- El CLI de TypeORM se ejecutará preferentemente contra archivos compilados (`dist/database/data-source.js`) para no depender de `ts-node` con TypeScript 6.
- Jest puede ejecutarse con la configuración CommonJS del proyecto; el script del template usa `--experimental-vm-modules` y emite una advertencia experimental, que no afecta el resultado.
- Las dependencias ESM-only deben verificarse explícitamente al incorporarse.
- Un cambio a ESM requiere evaluar `require`/`import`, Jest, TypeORM y el resto de las herramientas antes de adoptarlo.
