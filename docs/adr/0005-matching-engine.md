# ADR 0005: Algoritmo de coincidencias v1

- **Estado:** Aceptado
- **Fecha:** 2026-11-03

## Contexto

El sistema debe sugerir coincidencias entre publicaciones perdidas y encontradas. La categoría es útil, pero no lo bastante confiable como para descartar candidatos de forma temprana. La base de datos debe reducir el conjunto de candidatos antes de calcular un puntaje más costoso en la aplicación.

## Decisión

### Prefiltro

Para una publicación `LOST` se buscan candidatas `FOUND` activas, y viceversa.

El prefiltro es duro y se aplica en PostgreSQL:

```sql
search_text % :q
```

Con:

```sql
SET pg_trgm.similarity_threshold = 0.15;
```

La categoría es una señal blanda: no filtra candidatos, solo participa en la reponderación de los que pasan el prefiltro textual.

### Candidatos

Los candidatos se ordenan por:

```text
text_score DESC, event_date DESC, id ASC
```

Se limita la cantidad a un valor configurable, inicialmente **500**.

El puntaje completo se calcula en NestJS, no en la base de datos.

### Puntaje

| Señal | Peso |
|---|---:|
| Texto | 0.50 |
| Categoría | 0.20 |
| Fecha | 0.15 |
| Ubicación | 0.15 |

- Umbral de sugerencia: **0.55**.
- Máximo de sugerencias devueltas: **10**.
- Las sugerencias por debajo del umbral no se muestran.

### Estados

- `SUGGESTED`
- `CONFIRMED`
- `DISMISSED`

No existe `INVALIDATED`.

Una coincidencia es **accionable** si ambas publicaciones siguen en estado `ACTIVE`. Esa condición se deriva y no se almacena como un estado adicional.

## Consecuencias

- Se necesita un índice compatible con `pg_trgm` sobre `search_text`.
- El umbral de similitud debe configurarse en la sesión o en la consulta, no depender del valor global del servidor.
- El límite de 500 y los pesos deben ser configurables para poder ajustarlos con datos reales.
- Los candidatos que no pasan el prefiltro o quedan fuera de los primeros 500 no pueden ser sugeridos. Esta limitación es parte del diseño v1.
- La migración base de la Etapa 0.3 debe incluir la extensión y los índices necesarios.
