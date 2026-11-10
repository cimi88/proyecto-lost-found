# Proposal

## Why

CU1–CU5 permiten registrar, buscar y consultar publicaciones, pero no relacionan automáticamente un objeto perdido con uno encontrado. CU6 utilizará el algoritmo determinístico ya aceptado en ADR 0005 para generar sugerencias explicables y presentarlas en el detalle, sin LLM, sin datos privados y sin cambiar los contratos públicos existentes.

## What Changes

- Crear la capacidad `publication-matching` con una consulta pública de sugerencias para una publicación activa.
- Persistir coincidencias `SUGGESTED` entre publicaciones `LOST` y `FOUND` activas, generándolas transaccionalmente al crear una publicación y mediante un backfill idempotente para las publicaciones activas existentes.
- Completar la infraestructura de búsqueda definida en ADR 0005: campo normalizado `search_text`, índice GIN `pg_trgm` y tabla de coincidencias con pareja única, estados y score.
- Aplicar el prefiltro `search_text % :q` con umbral local `0.15`, máximo configurable de 500 candidatos, pesos aprobados `0.50/0.20/0.15/0.15`, umbral `0.55` y máximo 10 sugerencias.
- Agregar al detalle Angular una sección de sugerencias con score, desglose explicable, datos públicos del candidato y estado vacío; reutilizar `/publications/:id`.
- Mantener las respuestas y validaciones de CU1–CU5, excluir siempre publicaciones no `ACTIVE` y no exponer `ownerId`.
- No agregar autenticación, acciones de confirmar/descartar, LLM, FastAPI, MCP ni dependencias.

## Capabilities

### New Capabilities

- `publication-matching`: generación, persistencia, consulta pública y presentación explicable de sugerencias entre publicaciones perdidas y encontradas.

### Modified Capabilities

- Ninguna. CU6 integra la generación en el flujo de persistencia de CU1/CU2 sin cambiar sus contratos HTTP, validaciones o respuestas; los requisitos nuevos pertenecen a `publication-matching`.

## Impact

- **Backend:** nuevo servicio/controlador de matching y entidad TypeORM; integración transaccional en la persistencia compartida de publicaciones; validación/configuración de los límites y pesos acordados.
- **PostgreSQL:** una migración TypeORM reversible para `search_text`, su índice GIN y la tabla/índices de coincidencias; no requiere extensiones nuevas.
- **API/contrato:** nuevo `GET /api/v1/publications/:id/matches` y contrato TypeScript de sugerencias; `GET /api/v1/publications/:id` y `POST` CU1/CU2 mantienen su forma.
- **Frontend:** nuevo modelo/servicio de matching y sección responsive en el detalle existente.
- **Documentación:** aclaraciones de ADR 0005, arquitectura/modelo de dominio y ODD al implementar.
- **No se agrega infraestructura ni dependencias.**
