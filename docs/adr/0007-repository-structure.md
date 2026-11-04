# ADR 0007: Estructura del monorepo

- **Estado:** Aceptado
- **Fecha:** 2026-11-03

## Contexto

El proyecto combina tres runtimes y varios tipos de documentación. Se necesita una estructura simple, comprensible y compatible con el requisito de no usar Nx ni npm workspaces.

## Decisión

La raíz del repositorio contiene:

```text
frontend/        Angular + SCSS
backend/         NestJS API
ai-service/
  app/           FastAPI + LangChain
  mcp_server/    FastMCP propio de dominio
contracts/v1/    Contratos HTTP TypeScript v1 escritos a mano
docs/            Arquitectura, dominio, roadmap y ADRs
scripts/         Scripts de desarrollo
```

Reglas:

- No hay `package.json` raíz ni workspaces.
- Cada servicio administra sus propias dependencias cuando se inicialice.
- Los contratos se comparten como archivos TypeScript versionados, no como paquete publicado.
- La documentación de decisiones vive en `docs/adr`.
- Las carpetas de servicios incluyen un README que indica su etapa de inicialización.
- No se crean artefactos de build ni dependencias en la Etapa 0.1.

## Consecuencias

- La instalación de dependencias será independiente por servicio.
- Los contratos deben mantenerse sincronizados manualmente entre Angular, NestJS y FastAPI en la versión 1.
- La ausencia de workspaces simplifica la toolchain, pero exige disciplina para no duplicar lógica ni tipos.
- La estructura puede ampliarse en etapas posteriores sin romper la separación de responsabilidades.
