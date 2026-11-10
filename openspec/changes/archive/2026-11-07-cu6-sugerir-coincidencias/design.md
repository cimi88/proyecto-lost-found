# Design

## Context

Ver `proposal.md` para la motivación. La inspección de solo lectura encontró:

- `Publication` contiene `id`, `type`, `status`, `ownerId`, `title`, `description`, `category`, `location`, `eventDate`, `createdAt` y `updatedAt`. `eventDate` es una fecha `date`, no un timestamp; no hay coordenadas ni campos de contacto.
- La base local `lostfound_dev` tiene las tablas `users`, `publications` y `migrations`, dos migraciones aplicadas, la extensión `pg_trgm`, dos publicaciones activas y no tiene `search_text` ni tabla de coincidencias.
- CU3/CU4 ya usan `pg_trgm`, umbral local `0.15`, índices GIN separados sobre título/descripción/ubicación y un índice B-tree `(status, created_at DESC)`. La búsqueda está implementada en `PublicationsService` y expuesta por `PublicationsReadController`.
- CU5 ya presenta un detalle público en `/publications/:id`; no existe sección ni servicio de sugerencias.
- ADR 0005 fija el prefiltro trigram, máximo inicial de 500 candidatas, pesos `0.50/0.20/0.15/0.15`, umbral `0.55`, máximo 10 sugerencias y score total en NestJS. ADR 0006 y el modelo de dominio definen `SUGGESTED`, `CONFIRMED` y `DISMISSED`; no existe `INVALIDATED`.
- Las opciones de visibilidad pública, persistencia/backfill, fórmula recomendada y alcance solo-sugerencias fueron elegidas por el usuario en esta planificación.

## Goals / Non-Goals

**Goals:**

- Aplicar el algoritmo aprobado y hacer determinísticos tanto el prefiltro como el orden final.
- Persistir parejas sugeridas sin duplicados, incluyendo publicaciones activas ya existentes.
- Exponer y explicar sugerencias mediante una lectura pública del detalle y una sección Angular coherente con CU5.
- Reutilizar NestJS, TypeORM, PostgreSQL y `pg_trgm`, preservando las respuestas y validaciones de CU1–CU5.

**Non-Goals:**

- Confirmar o descartar coincidencias en la UI o API; no hay autorización real de propietario todavía.
- Geocodificación, coordenadas, búsqueda semántica, LLM, chatbot, FastAPI, LangChain o MCP.
- Nuevos campos de contacto, exposición de `ownerId`, autenticación JWT o cambios de categoría/tipo/estado de publicación.
- Cambiar los pesos, el umbral global, el límite de candidatas o el máximo aprobados en ADR 0005.

## Decisions

### 1. Seguir ADR 0005 y fijar las subfórmulas elegidas

Para la publicación fuente y cada candidata:

```text
textScore = max(
  similarity(source.title, candidate.title),
  similarity(source.title, candidate.description),
  similarity(source.description, candidate.title),
  similarity(source.description, candidate.description)
)
categoryScore = 1 si las categorías son iguales; 0 en caso contrario
dateScore = max(0, 1 - abs(días entre eventDate)/30)
locationScore = similarity(source.location, candidate.location)
score = 0.50*textScore + 0.20*categoryScore + 0.15*dateScore + 0.15*locationScore
```

Las comparaciones textuales y de ubicación se normalizan a minúsculas antes de aplicar la similitud trigram. La fórmula usa el mayor parecido título/descripción cruzado para admitir que un usuario ponga el dato en el título y otro en la descripción; la categoría sigue siendo blanda. La fecha usa 30 días como decaimiento lineal, no como exclusión dura. El API conserva el score `0..1`; Angular lo presenta como porcentaje.

El prefiltro opera en PostgreSQL con `search_text % :sourceSearchText`, `pg_trgm.similarity_threshold=0.15` local a la transacción. SQL ordena y limita a 500 candidatas por score textual, `event_date DESC`, `id ASC`; NestJS calcula el score total, aplica `>=0.55`, selecciona hasta 10 y desempata por score, `event_date DESC`, `id ASC`.

**Alternativa descartada:** delegar score/pesos a SQL o a un LLM. El score ponderado en NestJS es la decisión ya aceptada en ADR 0005 y permite pruebas unitarias sobre una función determinística.

### 2. Añadir `search_text` derivado y un índice GIN aditivo

La migración agrega `search_text` como columna generada almacenada a partir de título, descripción y ubicación, normalizada a minúsculas con espacios consecutivos colapsados. Los acentos se conservan para no instalar/extender `unaccent`. Agrega `publications_search_text_trgm_idx` con `gin_trgm_ops`.

Se conservan los tres índices trigram de CU3: siguen soportando la búsqueda pública existente y la nueva columna necesita su propio índice para el pre-filtro compuesto definido en ADR 0005. No se cambia `synchronize: false` ni se modifica la búsqueda CU3/CU4.

**Alternativa descartada:** combinar en el matching los tres predicados actuales `title % q OR description % q OR location % q` sin `search_text`. Reutilizaría los índices, pero no seguiría el prefiltro aprobado en ADR 0005 ni la representación `search_text` ya documentada en el modelo.

### 3. Persistir pares canónicos en `publication_matches`

La migración agrega una tabla con `id`, `lost_publication_id`, `found_publication_id`, `status`, `score`, `created_at` y `updated_at`; agrega FK a `publications`, `CHECK` para `SUGGESTED/CONFIRMED/DISMISSED`, score entre 0 y 1, unicidad de la pareja y los índices necesarios para consultar desde cualquiera de los dos lados.

Los identificadores se guardan siempre en columnas canónicas LOST/FOUND aunque la fuente sea FOUND. Se persiste el score final redondeado a cuatro decimales. El desglose explicativo se reconstruye con los campos públicos, que hoy no tienen endpoint de edición. Una regeneración actualiza un par `SUGGESTED`, pero nunca reabre ni sobrescribe `CONFIRMED` o `DISMISSED`.

**Alternativa descartada:** guardar sólo resultados calculados en cada lectura. Eso no representa los estados de coincidencia ya definidos en ADR 0005/0006 y no soporta el backfill idempotente elegido.

### 4. Generar en el flujo transaccional y completar lo existente con backfill

La recomendación operativa es integrar el matching en la transacción que crea la publicación: guardar la publicación, buscar y puntuar candidatas, e insertar sugerencias antes de confirmar la transacción. Así CU1/CU2 conservan su cuerpo de respuesta, pero una falla de matching no deja una publicación registrada sin el cálculo que corresponde.

Se agrega un comando NestJS `matches:backfill` que pagina publicaciones `ACTIVE` y ejecuta la misma función de generación, idempotentemente. Es necesario porque hay filas previas al despliegue que no dispararon CU6. El backfill no modifica publicaciones ni elimina coincidencias históricas.

La lógica se ubica bajo el módulo de publicaciones (`publications/matching`) para evitar una dependencia circular entre `PublicationsModule` y un módulo de dominio separado. La operación recibe el `EntityManager` de la transacción para compartir conexión y atomicidad.

**Alternativas descartadas:**

- Recalcular como efecto secundario de `GET`: rompe la expectativa de lectura sin escrituras.
- Agregar una cola o worker: no hay infraestructura de colas y el límite de 500 mantiene acotada la operación inicial.
- Ejecutar el score de negocio dentro de SQL/migración: contradice ADR 0005, que reserva el score completo a NestJS.

### 5. Consulta pública de sugerencias sin acciones de propietario

Se agrega `GET /api/v1/publications/:id/matches`. Es público como el listado/detalle, devuelve sólo coincidencias `SUGGESTED` cuyos dos lados siguen `ACTIVE`, con máximo 10 y los campos públicos de la candidata, `score`, `scoreBreakdown` y diferencia de días. UUID inválido usa `400 VALIDATION_ERROR`; origen inexistente o no activo usa `404 PUBLICATION_NOT_FOUND`. El DTO de respuesta no contiene `ownerId`.

CU6 no expone operaciones `CONFIRMED` o `DISMISSED`: aunque esos estados existen en el dominio, el guard demo no proporciona autorización segura para acciones de propietario. Quedan reservadas para una etapa con identidad/autorización real.

### 6. Integrar la presentación en el detalle existente

Se amplía la página `/publications/:id`; no se crea una ruta ni una pantalla paralela. El componente consume la consulta de matching de forma independiente al detalle principal y muestra estados de carga/error, vacío y lista. Cada sugerencia enseña tipo, título, categoría, ubicación, fecha, porcentaje y desglose traducido a etiquetas; el enlace lleva al detalle público de la candidata.

El estado de error de sugerencias no reemplaza ni oculta el detalle de CU5. No se muestran propietarios, contactos ni datos privados.

### 7. Configuración sin dependencias

Los pesos, umbral final, límite de 500, máximo de 10, umbral trigram `0.15` y ventana de fecha de 30 días se agrupan en una configuración tipada con defaults aprobados. Los valores configurables se validan al arrancar; los pesos deben ser no negativos y sumar 1, y límites/umbrales estar dentro de rangos válidos. No se agrega una dependencia externa.

## Risks / Trade-offs

- **Prefiltro textual duro:** una pareja con categoría, fecha y ubicación compatibles pero sin suficiente similitud textual no entra al score; es la limitación aceptada en ADR 0005. El `search_text` combinado y el umbral `0.15` mitigan falsos negativos sin eliminar la cota.
- **Límite de 500:** candidatas fuera del top 500 nunca se puntúan. Se conserva el orden estable exigido por ADR y se hace configurable el límite.
- **Ubicación textual:** trigram mide similitud de cadenas, no distancia física. La UI debe decir “ubicación similar”, no “cerca”; geocodificación requiere coordenadas/servicio y queda fuera de alcance.
- **Fecha de evento:** es sólo `date`; no expresa hora ni un rango perdido/hallazgo. La ventana lineal de 30 días es la fórmula seleccionada.
- **Síncrono al registrar:** añade latencia y la operación completa puede fallar junto con la transacción de alta. Límite 500, índice GIN y medición en verificación limitan el riesgo; no se incorpora cola.
- **Score persistido vs. desglose:** sin edición de publicaciones, reconstruir el desglose a partir de los campos actuales reproduce el score. Si se agrega edición futura, esa operación deberá regenerar el match o persistir el desglose.
- **Publicación pública de matches:** cualquiera que ve el detalle puede ver sus sugerencias. Los resultados sólo contienen información ya pública y sin datos de propietario.
- **CU1 en archivo:** el repositorio no contiene un cambio archivado de CU1, aunque conserva el ODD y sus requisitos en la spec principal. CU6 no lo crea ni altera.

## Migration Plan

1. Aplicar migración aditiva: añadir y poblar `search_text`; crear su índice GIN; crear `publication_matches`, restricciones e índices.
2. Ejecutar pruebas de migración/reversión en una base aislada; `down` elimina tabla, índices y columna de CU6 solamente.
3. Desplegar backend y ejecutar el backfill idempotente para las publicaciones existentes `ACTIVE`.
4. Desplegar la ampliación del detalle Angular; contratos existentes de CU1–CU5 permanecen compatibles.

## Open Questions

- La recomendación de generar en la misma transacción de publicación nueva y ejecutar un backfill de NestJS es la interpretación más simple de “persistir y backfill”; queda explícita para revisión antes de implementar.
- La normalización propuesta conserva diacríticos y sólo baja a minúsculas/colapsa espacios. Si las pruebas de CU6 muestran casos reales como `bateria`/`batería`, se podrá evaluar una normalización compatible en PostgreSQL sin introducir un servicio de geocodificación.
