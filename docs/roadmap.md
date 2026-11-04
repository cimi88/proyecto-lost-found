# Roadmap

El proyecto se construye en etapas pequeñas y verificables. Cada etapa requiere revisión y autorización antes de continuar.

## Etapa 0 — Fundaciones

| Etapa | Alcance | Estado |
|---|---|---|
| 0.0 | Verificación aislada de NestJS 12 + CommonJS + TypeScript 6.0.3 + Node 24.20.0, sin PostgreSQL ni TypeORM | Aprobada |
| 0.1 | Esqueleto inicial del monorepo, configuración compartida y documentación | En revisión |
| 0.2 | Backend NestJS con endpoint `/api/health` | Pendiente |
| 0.3 | PostgreSQL 18 + TypeORM + migración base con `pg_trgm` | Pendiente |
| 0.4 | Base del frontend Angular con SCSS | Pendiente |
| 0.5 | Base del servicio FastAPI, sin Ollama, JWT ni MCP | Pendiente |
| 0.6 | Integración de bases, documentación de cierre y commit final de Etapa 0 | Pendiente |

### Entregables por etapa

#### 0.0 — Verificación de compatibilidad

- Proyecto temporal NestJS en CommonJS.
- Verificación de compilación con TypeScript 6.0.3.
- Verificación de ejecución con Node 24.20.0.
- Prueba de interoperabilidad `require(esm)`.
- Pruebas unitarias, e2e y endpoint `/health`.
- Confirmación de ausencia de TypeORM y PostgreSQL.

Resultado: aprobada. La prueba se realizó en una carpeta temporal; no se copió código al repositorio definitivo.

#### 0.1 — Esqueleto y documentación

- Carpetas iniciales del monorepo.
- `.gitignore`, `.editorconfig`, `.gitattributes` y configuración base de formato.
- `README.md`.
- Arquitectura, modelo de dominio, roadmap y ADRs.
- Inicialización de Git y commit inicial.
- Sin dependencias de Angular, NestJS ni Python.

#### 0.2 — Backend base

- Proyecto NestJS definitivo en `backend/`.
- Configuración CommonJS y TypeScript 6.0.3.
- Endpoint `/api/health` en memoria.
- Pruebas unitarias y e2e.
- Sin TypeORM ni PostgreSQL.

#### 0.3 — Persistencia base

- PostgreSQL 18 nativo en Windows.
- TypeORM con migraciones.
- Migración base con `pg_trgm` y los índices necesarios.
- Verificación de conexión y ejecución de migraciones.
- Sin entidades de dominio completas todavía.

#### 0.4 — Frontend base

- Proyecto Angular con SCSS.
- Estructura inicial de la aplicación.
- Verificación de build y pruebas base.
- Sin integración funcional completa con el backend.

#### 0.5 — Servicio de IA base

- Proyecto FastAPI.
- Endpoint de salud.
- Sin Ollama, JWT ni MCP en esta etapa.
- Base para incorporar LangChain y FastMCP en etapas posteriores.

#### 0.6 — Integración de Etapa 0

- Verificación conjunta de las bases.
- Documentación de decisiones y resultados.
- Commit de cierre de Etapa 0.
- Revisión antes de avanzar al dominio.

## Etapa 1 en adelante

Las etapas de dominio, autenticación, integración del asistente y MCP se detallarán al cerrar la Etapa 0. Incluirán, como mínimo:

- Autenticación RS256 y propagación del token.
- Contratos HTTP v1.
- Publicaciones, búsqueda, filtros y detalle.
- Coincidencias.
- Solicitudes de recuperación y devoluciones.
- Asistente con LangChain y Ollama Cloud.
- Servidores MCP interno y externo.
- PoC obligatoria de la cadena MCP con aislamiento entre usuarios.

## Regla de avance

No se inicia una etapa sin autorización explícita. Una etapa se considera cerrada solo cuando sus verificaciones pasan y el usuario revisa el resultado.
