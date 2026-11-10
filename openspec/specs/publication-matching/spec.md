# publication-matching Specification

## Purpose

Define cómo LostFound detecta, persiste y presenta sugerencias explicables entre publicaciones activas de objetos perdidos y encontrados, manteniendo la decisión de matching en NestJS.

## Requirements

### Requirement: Candidatas de tipo opuesto y activas

El sistema SHALL evaluar publicaciones `ACTIVE` únicamente contra publicaciones `ACTIVE` del tipo opuesto. MUST NOT comparar una publicación consigo misma ni candidatas del mismo tipo. La categoría MUST NOT descartar candidatas antes de calcular el score.

#### Scenario: Publicación perdida con candidatas encontradas
- **WHEN** se genera matching para una publicación `LOST` activa
- **THEN** solo se evalúan publicaciones `FOUND` activas con distinto identificador

#### Scenario: Publicación encontrada con candidatas perdidas
- **WHEN** se genera matching para una publicación `FOUND` activa
- **THEN** solo se evalúan publicaciones `LOST` activas con distinto identificador

#### Scenario: Categoría distinta
- **WHEN** una candidata activa del tipo opuesto tiene una categoría distinta
- **THEN** permanece elegible y la categoría solo afecta el score

### Requirement: Prefiltro trigram y límite de candidatas

El sistema SHALL aplicar el prefiltro trigram acordado en ADR 0005 con umbral `0.15` local a la operación y SHALL limitar las candidatas antes del score completo al límite configurable, inicialmente 500, ordenadas por score textual descendente, `eventDate` descendente e `id` ascendente.

#### Scenario: Prefiltro con umbral local
- **WHEN** se genera matching para una publicación activa
- **THEN** el prefiltro usa el umbral trigram `0.15` acotado a la operación y no modifica el umbral de otras consultas

#### Scenario: Límite de candidatas excedido
- **WHEN** más candidatas pasan el prefiltro que el límite configurado
- **THEN** solo las primeras 500 según el orden determinístico pasan al score completo, salvo que la configuración establezca otro límite válido

### Requirement: Score determinístico y explicable

Cada candidata SHALL recibir un score entre 0 y 1: texto = máximo trigram de las cuatro comparaciones título/descripción; categoría = 1 si coincide y 0 si no; fecha = `max(0, 1 - díasAbsolutos/30)`; ubicación = similitud trigram; total = `0.50*texto + 0.20*categoría + 0.15*fecha + 0.15*ubicación`.

#### Scenario: Componentes y score
- **WHEN** se calcula el score de una candidata
- **THEN** se aplican las cuatro señales, pesos y fórmulas descritas sin aleatoriedad ni intervención de un LLM

#### Scenario: Diferencia temporal
- **WHEN** dos candidatas tienen igual texto, categoría y ubicación, pero una tiene una diferencia de fechas mayor
- **THEN** su componente de fecha y su score total no son mayores que los de la candidata más cercana en fecha

### Requirement: Umbral, máximo y orden de sugerencias

El sistema SHALL presentar únicamente coincidencias con score `>= 0.55`, con un máximo configurable inicialmente de 10, ordenadas por score descendente, `eventDate` descendente e `id` ascendente.

#### Scenario: Umbral de sugerencia
- **WHEN** una candidata obtiene score menor que `0.55`
- **THEN** no se presenta ni se persiste como sugerencia nueva

#### Scenario: Orden y máximo estables
- **WHEN** existen más sugerencias que el máximo configurado o hay scores empatados
- **THEN** se devuelven como máximo 10 y los empates se resuelven por `eventDate DESC, id ASC`

### Requirement: Persistencia idempotente de sugerencias

Al crear una publicación `ACTIVE` y al ejecutar el backfill, el sistema SHALL persistir las parejas que superen el umbral con estado `SUGGESTED`, sin duplicar la pareja `lost/found`. Una regeneración MUST NOT reabrir estados `CONFIRMED` o `DISMISSED`.

#### Scenario: Generación al registrar una publicación
- **WHEN** se registra una publicación `LOST` o `FOUND` activa con candidatas compatibles
- **THEN** las sugerencias calculadas se persisten junto con la publicación sin alterar el contrato HTTP de CU1 o CU2

#### Scenario: Backfill repetible
- **WHEN** se ejecuta más de una vez el backfill de publicaciones activas
- **THEN** no se duplican parejas y los estados `CONFIRMED` o `DISMISSED` permanecen sin cambios

### Requirement: Consulta pública de sugerencias

El sistema SHALL exponer `GET /api/v1/publications/:id/matches` como lectura pública sin identidad. Debe devolver sugerencias `SUGGESTED` solo cuando la publicación fuente y la candidata continúen `ACTIVE`; un origen inexistente o no activo MUST responder `404 PUBLICATION_NOT_FOUND`.

#### Scenario: Consulta válida
- **WHEN** se consulta el matching de una publicación activa
- **THEN** responde `200` con hasta 10 candidatas activas del tipo opuesto

#### Scenario: Sin sugerencias
- **WHEN** no hay parejas que superen el prefiltro y el umbral
- **THEN** responde `200` con `items: []`

#### Scenario: Origen no disponible
- **WHEN** el UUID no existe o corresponde a una publicación no activa
- **THEN** responde `404` con `code=PUBLICATION_NOT_FOUND` sin revelar si el identificador existe

### Requirement: Explicación y privacidad del resultado

Cada sugerencia SHALL incluir el resumen público de la candidata, score total, desglose de las cuatro señales y diferencia absoluta de fechas. La respuesta MUST NOT incluir `ownerId` ni datos privados del usuario.

#### Scenario: Explicación disponible
- **WHEN** se devuelve una sugerencia
- **THEN** el resultado incluye scores de texto, categoría, fecha y ubicación que permiten reconstruir el total
- **AND** incluye los días de diferencia entre eventos

#### Scenario: Campos privados excluidos
- **WHEN** se consulta cualquier resultado de matching
- **THEN** no se devuelven `ownerId`, datos de contacto ni información privada del usuario

### Requirement: Sugerencias en el detalle Angular

La SPA SHALL mostrar sugerencias en la página de detalle existente, identificando tipo, título, categoría, ubicación, fecha, porcentaje de coincidencia y motivos. MUST conservar el detalle aun si falla la consulta de sugerencias.

#### Scenario: Resultados y motivos
- **WHEN** el detalle tiene sugerencias
- **THEN** muestra cada candidata con sus datos públicos, score y desglose explicativo
- **AND** permite abrir el detalle de la candidata

#### Scenario: Sin resultados o error
- **WHEN** la consulta no devuelve sugerencias o falla
- **THEN** muestra un estado vacío o un error localizado en la sección de sugerencias sin ocultar el detalle principal

### Requirement: Compatibilidad de CU1–CU5

CU6 MUST conservar las rutas, validaciones, respuestas HTTP visibles y pantallas de CU1–CU5. El matching MUST ejecutarse en NestJS y MUST NOT delegar el score a un LLM.

#### Scenario: Regresión de casos anteriores
- **WHEN** se ejecutan las pruebas y verificaciones de CU1–CU5 después de CU6
- **THEN** sus contratos y comportamientos existentes permanecen sin cambios

#### Scenario: Decisión del backend
- **WHEN** se genera o consulta una sugerencia
- **THEN** NestJS aplica el algoritmo y accede a PostgreSQL; Angular solo presenta el resultado
