# Backend

API NestJS + TypeScript en formato CommonJS.

- Se inicializa en la **Etapa 0.2** con un endpoint `GET /api/health`.
- TypeScript 6.0.3, NestJS 12.3.2, Nest CLI 12.0.11 y Node.js 24.20.0.
- La configuración de TypeORM y PostgreSQL comienza en la **Etapa 0.3**.
- Es la única fuente de verdad para reglas de negocio y acceso a datos.
- En la Etapa 0.1 no se instalaron dependencias; las del backend se incorporaron en la Etapa 0.2.

## Requisitos

- Node.js **24.20.0**
- npm **12.0.2**

## Instalación

Desde `backend/`:

```powershell
npm install
```

## Configuración por entorno

El backend usa `@nestjs/config` y valida las variables al arrancar. Copiá el archivo de ejemplo:

```powershell
Copy-Item .env.example .env
```

Variables soportadas:

| Variable | Valores válidos | Valor por defecto |
|---|---|---|
| `NODE_ENV` | `development`, `test`, `production` | `development` |
| `PORT` | entero entre 1 y 65535 | `3000` |

Los valores vacíos de `NODE_ENV` o `PORT` se consideran ausentes y aplican el valor por defecto.

`backend/.env` no se versiona. `backend/.env.example` sí se versiona y no contiene secretos ni `DATABASE_URL`; esa variable se incorpora en la Etapa 0.3 junto con TypeORM y PostgreSQL.

Si `NODE_ENV` o `PORT` tienen un valor inválido, el arranque falla con un mensaje que nombra la variable sin imprimir el valor recibido.

## Arranque

```powershell
# Desarrollo
npm run start

# Desarrollo con recarga
npm run start:dev

# Desarrollo con recarga y depuración
npm run start:debug

# Producción (requiere build previo)
npm run build
npm run start:prod
```

Por defecto la API escucha en `http://localhost:3000`.

## Endpoint de salud

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

Respuesta esperada:

```json
{
  "status": "ok",
  "timestamp": "2026-11-04T12:00:00.000Z"
}
```

El endpoint no requiere autenticación ni acceso a base de datos.

## Pruebas

Los scripts de Jest usan `node --experimental-vm-modules` porque NestJS 12 publica paquetes ESM y Jest necesita habilitar `require(esm)`. El flag ya está incluido en los scripts; no hace falta agregarlo manualmente.

| Comando | Uso |
|---|---|
| `npm test` | Pruebas unitarias |
| `npm run test:watch` | Unitarias en modo watch |
| `npm run test:cov` | Unitarias con cobertura |
| `npm run test:debug` | Unitarias con inspector de Node |
| `npm run test:e2e` | Pruebas end-to-end |

Las suites no requieren PostgreSQL ni variables de base de datos.

## Formato

```powershell
npm run format
```

Prettier formatea los archivos TypeScript de `src/` y `test/`.

## Build

```powershell
npm run build
```

El artefacto compilado queda en `dist/` y se ejecuta como CommonJS con `node dist/main.js`.
