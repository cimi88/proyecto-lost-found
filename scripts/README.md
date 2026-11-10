# Scripts

Scripts auxiliares de desarrollo. No reemplazan las pruebas ni las migraciones
versionadas.

## `setup-db.ps1`

Configura la base local de PostgreSQL 18 en Windows:

1. Verifica que `psql` exista y que el servidor acepte conexiones.
2. Solicita la contraseña del superusuario de PostgreSQL y la contraseña del rol
   `lostfound_app`.
3. Crea el rol `lostfound_app` y la base `lostfound_dev` si no existen.
4. Escribe `backend/.env` con `DATABASE_URL`.
5. Restringe los permisos del archivo y no imprime secretos.

Uso, desde la raíz del repositorio, en una consola interactiva:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-db.ps1
```

Las contraseñas se ingresan en la consola; no se pasan por argumentos ni se
guardan en archivos versionados.

## `verify-cu1.ps1`

Verifica el flujo `HTTP → NestJS → PostgreSQL` del CU1:

1. Lee `backend/.env` sin imprimir la contraseña.
2. Compila y aplica migraciones.
3. Inicia la API en un proceso oculto y espera `/api/health`.
4. Ejecuta peticiones válidas e inválidas contra
   `POST /api/v1/lost-publications`.
5. Comprueba la fila persistida con `psql` usando un archivo `pgpass` temporal.
6. Elimina los datos de prueba y detiene la API.

Uso:

```powershell
npm run verify:cu1 --prefix backend
```

o directamente:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-cu1.ps1
```

Requiere PostgreSQL en ejecución, `psql` en
`C:\Program Files\PostgreSQL\18\bin` (configurable con `-PgBin`) y el puerto
`3000` libre.

## `verify-cu2.ps1`

Verifica el flujo `HTTP → NestJS → PostgreSQL` del CU2:

1. Lee `backend/.env` sin imprimir la contraseña.
2. Compila y aplica migraciones.
3. Inicia la API en un proceso oculto y espera `/api/health`.
4. Ejecuta peticiones válidas e inválidas contra
   `POST /api/v1/found-publications`, incluido un caso que envía `type`,
   `status` y `ownerId` desde el cliente y debe recibir `400`.
5. Comprueba la fila persistida con `psql` usando un archivo `pgpass` temporal.
6. Elimina exclusivamente las filas que el propio script creó (por ID exacto) y
   detiene la API. No toca datos preexistentes, incluida la evidencia del CU1.

Uso:

```powershell
npm run verify:cu2 --prefix backend
```

o directamente:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-cu2.ps1
```

Requiere PostgreSQL en ejecución, `psql` en
`C:\Program Files\PostgreSQL\18\bin` (configurable con `-PgBin`) y el puerto
`3000` libre.

## `verify-cu3.ps1`

Verifica el flujo `HTTP → NestJS → PostgreSQL` del CU3 (buscar objetos):

1. Lee `backend/.env` sin imprimir la contraseña.
2. Compila y aplica migraciones; comprueba que existen los tres índices GIN
   trigram y el índice B-tree de `(status, created_at DESC)`.
3. Inicia la API en un proceso oculto y espera `/api/health`.
4. Crea sus propias publicaciones `LOST` y `FOUND` con tokens únicos.
5. Verifica listado público sin identidad, búsqueda por título, descripción y
   ubicación, tolerancia a errores de tipeo, búsqueda vacía y sin resultados,
   paginación y orden estable, validación de parámetros y detalle por UUID.
6. Comprueba que `RESERVED`, `RETURNED` y `CLOSED` no se exponen ni en el
   listado ni en el detalle (`404 PUBLICATION_NOT_FOUND`).
7. Elimina exclusivamente las filas que el propio script creó (por ID exacto) y
   verifica que las evidencias de CU1 y CU2 quedan intactas.

Uso:

```powershell
npm run verify:cu3 --prefix backend
```

o directamente:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-cu3.ps1
```

Requiere PostgreSQL en ejecución, `psql` en
`C:\Program Files\PostgreSQL\18\bin` (configurable con `-PgBin`) y el puerto
`3000` libre.

## `verify-cu4.ps1`

Verifica el flujo `HTTP → NestJS → PostgreSQL` del CU4 (filtrar y ordenar
objetos):

1. Lee `backend/.env` sin imprimir la contraseña.
2. Compila y aplica migraciones; comprueba que se reutilizan los índices del CU3
   y que la migración `AddPublicationSearchIndexes` sigue aplicada.
3. Inicia la API en un proceso oculto y espera `/api/health`.
4. Crea sus propias publicaciones con tipos, categorías y fechas controladas, y
   fija `created_at` para verificar el orden de forma determinista.
5. Verifica cada filtro por separado (`type`, `category`, `eventDateFrom`,
   `eventDateTo`), los extremos inclusivos, combinaciones con AND, la búsqueda
   textual de CU3, los órdenes `recent`, `oldest` y `relevance`, la paginación
   con filtros y la validación de parámetros inválidos o desconocidos.
6. Comprueba que una publicación `RESERVED` no se expone ni con filtros ni en el
   detalle, y que `status` no se acepta como parámetro.
7. Elimina exclusivamente las filas que el propio script creó (por ID exacto) y
   verifica que las evidencias de CU1 y CU2 quedan intactas.

Uso:

```powershell
npm run verify:cu4 --prefix backend
```

o directamente:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-cu4.ps1
```

Requiere PostgreSQL en ejecución, `psql` en
`C:\Program Files\PostgreSQL\18\bin` (configurable con `-PgBin`) y el puerto
`3000` libre.

## Verificación de CU5 — detalle contextual

El endpoint de detalle y la privacidad de su respuesta se verifican con las
pruebas unitarias/E2E del backend y con `verify-cu3.ps1`, que ya ejercita
`GET /api/v1/publications/:id` contra PostgreSQL, comprueba la respuesta pública
y verifica `404` para publicaciones no activas o inexistentes. No se agrega un
script de base de datos separado para duplicar esa cobertura.

La navegación Angular de CU5 se verifica con:

```powershell
npm test --prefix frontend -- --watch=false
npm run build --prefix frontend
```

El flujo de navegador consiste en abrir `/publications` con búsqueda y filtros,
entrar a un detalle, volver con los mismos criterios y abrir también un detalle
directo sin contexto. La regresión HTTP de CU1–CU4 se ejecuta con sus scripts
`verify:cu1` a `verify:cu4`.

## `verify-cu6.ps1`

Verifica el flujo `HTTP → NestJS → PostgreSQL` del CU6 (sugerir coincidencias):

1. Lee `backend/.env` sin imprimir la contraseña.
2. Aplica la migración aditiva `AddPublicationMatching` (no ejecuta su reversión
   en `lostfound_dev`; el `down` se valida en las pruebas unitarias con
   `QueryRunner` simulado) y comprueba `search_text` como columna generada,
   `publication_matches`, el índice GIN trigram de `search_text` y los índices de
   ambos lados.
3. Captura un snapshot de preservación: los valores completos (incluidas marcas
   temporales) de las dos publicaciones de evidencia y el conjunto de UUIDs de
   las coincidencias preexistentes.
4. Inicia la API y crea cuatro publicaciones propias (UUIDs propios): un par
   LOST/FOUND similar, una FOUND que luego se cierra y una FOUND no relacionada.
5. Comprueba que las respuestas `POST` de CU1/CU2 conservan su forma, que la
   sugerencia se genera con la publicación y que `search_text` normaliza título,
   descripción y ubicación.
6. Valida `GET /api/v1/publications/:id/matches` en ambas direcciones, con score
   ≥ `0.55`, desglose de señales, diferencia de días, exclusión de no activas,
   ausencia de `ownerId`, `400` para UUID inválido y `404` para origen
   inexistente o cerrado.
7. Detiene la API y ejecuta `matches:backfill` dos veces: no duplica parejas, no
   reabre una coincidencia marcada `DISMISSED` y deja el mismo total entre
   ejecuciones.
8. Restaura el estado inicial: elimina por su propio UUID únicamente las
   coincidencias nuevas creadas por la verificación (incluidas las que el
   backfill pudo crear entre publicaciones preexistentes) y borra por ID exacto
   sus publicaciones propias (sus coincidencias caen en cascada). Nunca usa
   `DELETE` sin `WHERE` ni toca filas ajenas. Verifica que la tabla de
   coincidencias recupera exactamente el conjunto de IDs previo, que el conteo
   de publicaciones vuelve al inicial y que las evidencias de CU1 y CU2 quedan
   intactas columna a columna.

Uso:

```powershell
npm run verify:cu6 --prefix backend
```

o directamente:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-cu6.ps1
```

Requiere PostgreSQL en ejecución, `psql` en
`C:\Program Files\PostgreSQL\18\bin` (configurable con `-PgBin`) y el puerto
`3000` libre.

## `verify-cu7.ps1`

Verifica el flujo `HTTP → NestJS → PostgreSQL` del CU7 (solicitar
recuperación):

1. Lee `backend/.env` sin imprimir la contraseña.
2. Aplica la migración aditiva `AddRecoveryRequests` (sin `db:revert`) y
   comprueba tabla, checks, FKs, índices y el índice único de una sola
   `APPROVED`.
3. Captura evidencias y conteos iniciales.
4. Crea usuarios temporales propios (propietario, solicitante, otro, ADMIN y
   ajeno) y una publicación `FOUND` propia.
5. Verifica creación, `notes` recortadas, duplicado, listas, permisos,
   privacidad y `404` de publicación no apta.
6. Aprueba, comprueba la reserva y que las demás `PENDING` pasan a `REJECTED`;
   verifica la exclusividad de `APPROVED`, incluso con un `UPDATE` SQL que debe
   fallar por el índice único.
7. Cancela `PENDING` y `APPROVED` con motivo, comprueba la reactivación y simula
   una reserva inconsistente para confirmar que no se reactiva la publicación.
8. Elimina solo sus filas por ID exacto (requests → publications → users), sin
   `DELETE` generales, y confirma que las evidencias de CU1/CU2 quedan intactas.

Uso:

```powershell
npm run verify:cu7 --prefix backend
```

o directamente:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-cu7.ps1
```

Requiere PostgreSQL en ejecución, `psql` en
`C:\Program Files\PostgreSQL\18\bin` (configurable con `-PgBin`) y el puerto
`3000` libre.
