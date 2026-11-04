# Decisiones de arquitectura (ADRs)

Una ADR registra una decisión arquitectónica importante, su contexto y sus consecuencias. Las decisiones aceptadas solo se cambian con una nueva ADR y autorización explícita.

## Índice

| ADR | Título | Estado |
|---|---|---|
| [0001](0001-stack-and-platform.md) | Stack y plataforma | Aceptado |
| [0002](0002-backend-commonjs.md) | Backend CommonJS con NestJS 12 y TypeScript 6 | Aceptado |
| [0003](0003-authentication-rs256.md) | Autenticación RS256 y propagación del token | Aceptado |
| [0004](0004-mcp-and-ai-boundaries.md) | Límites del asistente y arquitectura MCP | Aceptado con puntos abiertos de PoC |
| [0005](0005-matching-engine.md) | Algoritmo de coincidencias v1 | Aceptado |
| [0006](0006-domain-lifecycle.md) | Ciclo de vida del dominio y devoluciones | Aceptado |
| [0007](0007-repository-structure.md) | Estructura del monorepo | Aceptado |

## Convenciones

- Numeración secuencial de cuatro dígitos.
- Título en kebab-case.
- Estado: propuesto, aceptado, reemplazado o rechazado.
- Una decisión reemplazada mantiene su archivo y enlaza a la nueva ADR.
