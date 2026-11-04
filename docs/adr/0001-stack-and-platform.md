# ADR 0001: Stack y plataforma

- **Estado:** Aceptado
- **Fecha:** 2026-11-03

## Contexto

El proyecto necesita una aplicación full stack con frontend Angular, API NestJS, servicio de IA en Python, base de datos PostgreSQL y un asistente con herramientas MCP. La solución debe ser mantenible, verificable por etapas y ejecutable en Windows sin Docker.

## Decisión

Se adopta el siguiente stack obligatorio:

| Área | Tecnología |
|---|---|
| Frontend | Angular + TypeScript + SCSS |
| Backend | NestJS + TypeScript, formato CommonJS |
| Servicio de IA | Python + FastAPI + LangChain |
| LLM | Ollama Cloud, modelo `gemma4:31b` |
| Base de datos | PostgreSQL 18 nativo en Windows |
| Persistencia | TypeORM con migraciones |
| Protocolos | REST y MCP |
| Control de versiones | Git/GitHub |
| Entorno de asistencia | OpenCode |

Restricciones asociadas:

- No se usa Docker; PostgreSQL se instala de forma nativa.
- No se usa Nx ni npm workspaces; el monorepo es simple.
- Se requieren al menos dos servidores o herramientas MCP, con al menos uno externo.
- Los contratos HTTP v1 son TypeScript escritos a mano.
- NestJS es la única fuente de verdad para reglas de negocio y acceso a datos.
- El asistente no accede directamente a PostgreSQL ni duplica reglas.
- No se sustituyen tecnologías aprobadas sin autorización explícita.

## Versiones verificadas

La Etapa 0.0 verificó en una carpeta temporal:

- Node.js **24.20.0**
- npm **12.0.2**
- NestJS **12.3.2**
- TypeScript **6.0.3**
- Jest **30.5.2**
- `ts-jest` **29.4.15**

Las versiones de Angular, Python, FastAPI, LangChain y FastMCP se fijarán en sus etapas de inicialización.

## Consecuencias

- La plataforma queda alineada con las tecnologías aprobadas y no se mezclan alternativas.
- PostgreSQL nativo requiere documentar instalación, configuración y respaldo local.
- La ausencia de workspaces obliga a que cada servicio mantenga sus propias dependencias y a compartir contratos mediante archivos versionados.
- Cualquier cambio de stack requiere un nuevo ADR y autorización.
