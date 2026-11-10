# Roadmap

El proyecto se construye en etapas pequeñas y verificables. Cada etapa requiere revisión y autorización antes de continuar.

## Estado actual

- CU1–CU10: implementados, con alcance parcial documentado en CU9 y funcionalidades pendientes del asistente.
- CU8: devoluciones, `COMPLETED` y `RETURNED` implementados.
- CU9: consulta, edición y cierre de publicaciones propias implementados; eliminación no implementada y gestión de solicitudes relacionadas parcial.
- Identidad: dos perfiles demo mediante `X-Demo-User-Id`; JWT/RS256 no implementado.

## Etapa 0 — Fundaciones

| Etapa | Alcance | Estado |
|---|---|---|
| 0.0 | Verificación aislada de NestJS 12 + CommonJS + TypeScript 6.0.3 + Node 24.20.0, sin PostgreSQL ni TypeORM | Completada |
| 0.1 | Esqueleto inicial del monorepo, configuración compartida y documentación | Completada |
| 0.2 | Backend NestJS con endpoint `/api/health` | Completada |
| 0.3 | PostgreSQL 18 + TypeORM + migración base con `pg_trgm` | Completada |
| 0.4 | Frontend Angular con SCSS | Completada |
| 0.5 | Servicio FastAPI + LangChain + MCP + LLM (Groq/Ollama) | Completada para CU10 |
| 0.6 | Integración de bases, documentación de cierre y commit final de Etapa 0 | En preparación |

### Entregables por etapa

#### 0.0 — Verificación de compatibilidad

- Proyecto temporal NestJS en CommonJS.
- Verificación de compilación con TypeScript 6.0.3.
- Verificación de ejecución con Node 24.20.0.
- Prueba de interoperabilidad `require(esm)`.
- Pruebas unitarias, e2e y endpoint `/health`.
- Confirmación de ausencia de TypeORM y PostgreSQL.

Resultado: completada.

#### 0.1 — Esqueleto y documentación

- Carpetas iniciales del monorepo.
- `.gitignore`, `.editorconfig`, `.gitattributes` y configuración base de formato.
- `README.md`.
- Arquitectura, modelo de dominio, roadmap y ADRs.
- Inicialización de Git y commit inicial.
- Sin dependencias de Angular, NestJS ni Python.

Resultado: completada.

#### 0.2 — Backend base

- Proyecto NestJS definitivo en `backend/`.
- Configuración CommonJS y TypeScript 6.0.3.
- Configuración por `NODE_ENV` y `PORT`, con `.env.example` versionado.
- Endpoint `/api/health` en memoria.
- Pruebas unitarias y e2e.
- Sin TypeORM ni PostgreSQL.

Resultado: completada.

#### 0.3 — Persistencia base

- PostgreSQL 18 nativo en Windows.
- TypeORM con migraciones.
- Migración base con `pg_trgm` y los índices necesarios.
- Verificación de conexión y ejecución de migraciones.
- Entidades de dominio incorporadas por los CU posteriores.

Resultado: completada.

#### 0.4 — Frontend base

- Proyecto Angular con SCSS.
- Estructura inicial de la aplicación.
- Verificación de build y pruebas base.
- Integración funcional con el backend incorporada por los CU posteriores.

Resultado: completada.

#### 0.5 — Servicio de IA y MCP

- Proyecto FastAPI con preparación y confirmación de acciones.
- Endpoint de salud y endpoints de chat/acciones.
- LangChain + Groq/Ollama.
- Servidor FastMCP propio con contexto de rol y tres herramientas de escritura.
- Asistente CU10 con vista previa y confirmación explícita.
- Sin JWT; identidad demo `X-Demo-User-Id`.

Resultado: completada para el alcance de CU10.

#### 0.6 — Integración de Etapa 0

- Verificación conjunta de las bases.
- Documentación de decisiones y resultados.
- Commit de cierre de Etapa 0.
- Revisión antes de la entrega.

Resultado: en preparación.

## Casos de uso

| # | Caso de uso | Estado |
|---|---|---|
| 1 | Registrar una publicación perdida | Implementado |
| 2 | Registrar una publicación encontrada | Implementado |
| 3 | Buscar publicaciones | Implementado |
| 4 | Filtrar y ordenar resultados | Implementado |
| 5 | Ver el detalle de una publicación | Implementado |
| 6 | Sugerir coincidencias | Implementado |
| 7 | Solicitar recuperación | Implementado |
| 8 | Gestionar devolución | Implementado: `COMPLETED` y `RETURNED` |
| 9 | Gestionar publicaciones propias | Implementado parcialmente: consulta, edición y cierre; sin eliminación |
| 10 | Usar el asistente | Implementado con preparación, confirmación y MCP de lectura/escritura |

## Etapa 1 en adelante

Los casos de uso de dominio se incorporaron de forma incremental. El estado actual es:

- Autenticación RS256: decisión de arquitectura objetivo, **no implementada**.
- Contratos HTTP v1: implementados para CU1–CU10.
- Publicaciones, búsqueda, filtros y detalle: implementados.
- Coincidencias: implementadas.
- Solicitudes de recuperación: implementadas hasta `COMPLETED` y `RETURNED`.
- Devoluciones y `COMPLETED`: implementadas para CU8.
- Gestión de publicaciones propias: implementada parcialmente para CU9, con consulta, edición y cierre; sin eliminación.
- Asistente con LangChain y Groq/Ollama: implementado con preparación y confirmación de acciones.
- Servidor MCP propio: implementado con la herramienta de rol y tres herramientas de escritura.
- Servidores MCP externos Context7 y Playwright: integrados en OpenCode.
- PoC de la cadena MCP con JWT y aislamiento real entre usuarios: pendiente para una etapa de autenticación real.

## Regla de avance

No se inicia una etapa sin autorización explícita. Una etapa se considera cerrada solo cuando sus verificaciones pasan y el usuario revisa el resultado.
