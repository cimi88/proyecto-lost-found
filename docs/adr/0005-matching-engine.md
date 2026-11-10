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

## Aplicación de la decisión en CU6

CU6 materializa `search_text` como columna generada almacenada a partir de título,
descripción y ubicación, en minúsculas y con espacios consecutivos colapsados.
Preserva los acentos y no requiere `unaccent`. Una migración aditiva agrega un
índice GIN `gin_trgm_ops` para esa columna y la tabla `publication_matches`; los
índices individuales creados por CU3 permanecen vigentes para la búsqueda CU3/CU4.

Para el score v1:

- `textScore` es el máximo de las similitudes trigram entre título/título,
  título/descripción, descripción/título y descripción/descripción.
- `categoryScore` vale `1` si la categoría coincide y `0` si no; nunca elimina
  candidatas.
- `dateScore` es `max(0, 1 - abs(días entre eventDate)/30)`; es una señal blanda.
- `locationScore` es la similitud trigram entre ubicaciones textuales; no es una
  distancia geográfica.
- El score final conserva los pesos de esta ADR y se calcula en NestJS. SQL
  aplica el pre-filtro indexado, selecciona las 500 candidatas determinísticas y
  proyecta las señales trigram para NestJS.

Al crear una publicación, el cálculo y la persistencia de parejas `SUGGESTED`
ocurren en la misma transacción. El backfill idempotente procesa publicaciones
`ACTIVE` ya existentes. La pareja LOST/FOUND es única; una regeneración puede
actualizar un `SUGGESTED`, pero no reabre ni sobrescribe `CONFIRMED` o
`DISMISSED`. La consulta pública solo muestra coincidencias cuando ambos lados
siguen `ACTIVE`. CU6 no implementa transiciones de confirmación o descarte.
