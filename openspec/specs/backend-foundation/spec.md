# backend-foundation Specification

## Purpose

Proveer la base técnica del backend NestJS: arranque configurable, endpoint de salud y pruebas automatizadas, sin lógica de negocio ni persistencia.

## Requirements

### Requirement: Arranque sin persistencia

La aplicación backend SHALL iniciar sin requerir una instancia de PostgreSQL, TypeORM, credenciales de base de datos ni servicios externos.

#### Scenario: Inicio con configuración mínima

- **WHEN** se inicia el proceso con las variables de entorno mínimas documentadas
- **THEN** el proceso permanece activo y el endpoint de salud responde correctamente

#### Scenario: Ausencia de dependencias de persistencia

- **WHEN** se inspeccionan las dependencias instaladas del backend
- **THEN** no incluyen TypeORM ni ningún driver de PostgreSQL

### Requirement: Configuración por variables de entorno

La aplicación SHALL obtener su configuración desde variables de entorno. `NODE_ENV` MUST usar `development` por defecto y `PORT` MUST usar `3000` por defecto. Los valores vacíos de `NODE_ENV` o `PORT` MUST tratarse como ausentes y aplicar el valor por defecto correspondiente. MUST fallar el arranque con un mensaje explícito cuando un valor consumido sea inválido, sin exponer valores sensibles. Los valores sensibles MUST NOT almacenarse en el repositorio.

#### Scenario: Valores por defecto aplicados

- **WHEN** se inicia la aplicación sin definir `NODE_ENV` ni `PORT`, o con valores vacíos
- **THEN** la aplicación usa `NODE_ENV=development` y escucha en el puerto `3000`

#### Scenario: Variable válida aplicada

- **WHEN** se define un puerto válido en el entorno
- **THEN** la aplicación escucha en ese puerto

#### Scenario: PORT inválido impide el arranque

- **WHEN** se inicia la aplicación con un `PORT` no numérico o fuera del rango 1–65535
- **THEN** el arranque falla con código distinto de cero y un mensaje que menciona `PORT` sin repetir el valor recibido

#### Scenario: NODE_ENV inválido impide el arranque

- **WHEN** se inicia la aplicación con un `NODE_ENV` distinto de `development`, `test` o `production`
- **THEN** el arranque falla con código distinto de cero y un mensaje que menciona `NODE_ENV` sin repetir el valor recibido

#### Scenario: Secretos fuera del control de versiones

- **WHEN** se revisa el contenido versionado del backend
- **THEN** el archivo `.env` no está versionado y `.env.example` es versionable, solo contiene nombres de variables y valores no sensibles, y no incluye `DATABASE_URL`

### Requirement: Endpoint de salud

La API SHALL exponer `GET /api/health` y responder con estado HTTP 200 y un cuerpo JSON que indique que el servicio está operativo. El endpoint MUST NOT requerir autenticación ni acceso a base de datos.

#### Scenario: Consulta exitosa

- **WHEN** se realiza `GET /api/health`
- **THEN** la respuesta tiene estado 200 y un cuerpo JSON con el campo `status` igual a `ok` y una marca temporal ISO-8601

#### Scenario: Acceso sin autenticación

- **WHEN** se realiza `GET /api/health` sin cabecera `Authorization`
- **THEN** la respuesta sigue siendo 200 y no se devuelve un error de autenticación

### Requirement: Alcance técnico acotado

El backend de esta etapa SHALL NOT exponer endpoints de autenticación, usuarios, publicaciones ni funcionalidades de negocio.

#### Scenario: Superficie HTTP mínima

- **WHEN** se inspeccionan las rutas HTTP registradas por la aplicación
- **THEN** la única ruta pública de la etapa es `GET /api/health`

### Requirement: Ejecución CommonJS

El artefacto compilado SHALL ejecutarse con Node.js 24 como CommonJS, sin sintaxis ESM, y MUST arrancar desde `dist/main.js`.

#### Scenario: Arranque del artefacto compilado

- **WHEN** se ejecuta `npm run build` y luego `node dist/main.js` con Node.js 24
- **THEN** el proceso arranca correctamente, `dist/main.js` usa `require(...)` y no contiene `import` ESM, y el endpoint de salud responde

### Requirement: Pruebas automatizadas

El backend SHALL incluir pruebas unitarias y e2e ejecutables mediante comandos del proyecto, y la suite e2e MUST cubrir el endpoint de salud.

#### Scenario: Suite unitaria

- **WHEN** se ejecuta el comando de pruebas unitarias del backend
- **THEN** la suite termina con código de salida 0

#### Scenario: Cobertura de configuración

- **WHEN** se ejecutan las pruebas unitarias del backend
- **THEN** cubren valores ausentes, vacíos, válidos e inválidos de `NODE_ENV` y `PORT`

#### Scenario: Suite e2e del endpoint de salud

- **WHEN** se ejecuta el comando de pruebas e2e del backend
- **THEN** la suite inicia la aplicación, consulta `GET /api/health` y verifica estado 200 y cuerpo esperado

#### Scenario: Pruebas sin base de datos

- **WHEN** se ejecutan las suites unitarias y e2e en un entorno sin PostgreSQL
- **THEN** ambas terminan correctamente sin requerir variables de base de datos

### Requirement: Documentación operativa mínima

El proyecto SHALL documentar cómo instalar dependencias, configurar variables de entorno, iniciar el backend y ejecutar sus pruebas.

#### Scenario: Puesta en marcha desde documentación

- **WHEN** una persona sigue las instrucciones del README del backend en un entorno limpio con Node.js 24
- **THEN** puede instalar dependencias, iniciar la aplicación y verificar `GET /api/health`

#### Scenario: Documentación de comandos y flag de Jest

- **WHEN** se consulta el README del backend
- **THEN** documenta los comandos relevantes de `package.json` y explica por qué los scripts de Jest usan `--experimental-vm-modules`
