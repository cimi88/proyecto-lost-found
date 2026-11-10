# Backend

API NestJS + TypeScript en formato CommonJS. Es la única fuente de verdad para
reglas de negocio y acceso a datos.

- Node.js **24.20.0**, npm **12.0.2**.
- NestJS **12.3.2**, TypeScript **6.0.3**, Nest CLI **12.0.11**.
- TypeORM **0.3.31** (no 1.x) y `pg` **8.23.1**.
- PostgreSQL **18.6** nativo en Windows, sin Docker.

## Requisitos

- Node.js 24.20.0
- npm 12.0.2
- PostgreSQL 18 instalado localmente

## Instalación

Desde `backend/`:

```powershell
npm install
```

## Configuración por entorno

El backend usa `@nestjs/config` y valida las variables al arrancar. Copiá el
archivo de ejemplo:

```powershell
Copy-Item .env.example .env
```

| Variable | Valores válidos | Valor por defecto |
|---|---|---|
| `NODE_ENV` | `development`, `test`, `production` | `development` |
| `PORT` | entero entre 1 y 65535 | `3000` |
| `AUTH_MODE` | `demo`, `jwt` | `demo` |
| `DATABASE_URL` | URL de conexión PostgreSQL | sin valor por defecto |

`backend/.env` no se versiona. `backend/.env.example` sí se versiona y no
contiene secretos.

`AUTH_MODE=demo` se rechaza cuando `NODE_ENV=production`. En producción solo se
acepta `AUTH_MODE=jwt`.

Si una variable es inválida, el arranque falla con un mensaje que nombra la
variable sin imprimir el valor recibido.

## Base de datos local

El script interactivo crea el rol `lostfound_app`, la base `lostfound_dev`,
escribe `backend/.env` y restringe los permisos del archivo. Las contraseñas las
ingresa el usuario en la consola; no se pasan por argumentos ni se registran.

Desde la raíz del repositorio, en una consola interactiva:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-db.ps1
```

Luego aplicá las migraciones desde `backend/`:

```powershell
npm run db:migrate
npm run db:show
```

Para revertir la última migración:

```powershell
npm run db:revert
```

La migración inicial crea `users` y `publications`, las restricciones `CHECK` de
`type`, `status` y `category`, la clave foránea `owner_id`, el índice de
`owner_id`, la extensión `pg_trgm` y el usuario demo de forma idempotente.

## Arranque

```powershell
# Desarrollo
npm run start

# Desarrollo con recarga
npm run start:dev

# Producción (requiere build previo)
npm run build
npm run start:prod
```

Por defecto la API escucha en `http://localhost:3000` con prefijo global `api`.

## Endpoints

### `GET /api/health`

Devuelve el estado del servicio. No requiere base de datos.

### `POST /api/v1/lost-publications`

Registra una publicación de objeto perdido (`type=LOST`, `status=ACTIVE`) para el
usuario resuelto por la identidad local.

Encabezados:

```text
Content-Type: application/json
X-Demo-User-Id: 00000000-0000-4000-8000-000000000001
```

Cuerpo:

```json
{
  "title": "Bicicleta rodado 29",
  "description": "Bicicleta azul con canasto negro y una calcomanía.",
  "category": "SPORTS",
  "location": "Plaza San Martín",
  "eventDate": "2024-05-10"
}
```

Respuesta `201`:

```json
{
  "id": "…",
  "type": "LOST",
  "status": "ACTIVE",
  "ownerId": "00000000-0000-4000-8000-000000000001",
  "title": "Bicicleta rodado 29",
  "description": "Bicicleta azul con canasto negro y una calcomanía.",
  "category": "SPORTS",
  "location": "Plaza San Martín",
  "eventDate": "2024-05-10",
  "createdAt": "…",
  "updatedAt": "…"
}
```

Errores:

| Situación | HTTP | `code` |
|---|---|---|
| Datos inválidos | 400 | `VALIDATION_ERROR` con `details[]` |
| Encabezado ausente | 401 | `DEMO_IDENTITY_REQUIRED` |
| UUID inválido o usuario inexistente | 401 | `DEMO_IDENTITY_INVALID` |

La identidad `X-Demo-User-Id` es exclusivamente local (ver
[ADR 0008](../docs/adr/0008-demo-identity-seam.md)). No es autenticación y no
debe habilitarse en producción.

### `POST /api/v1/found-publications`

Registra una publicación de objeto encontrado (`type=FOUND`, `status=ACTIVE`)
para el usuario resuelto por la identidad local.

Encabezados:

```text
Content-Type: application/json
X-Demo-User-Id: 00000000-0000-4000-8000-000000000001
```

Cuerpo:

```json
{
  "title": "Llaves con llavero de equipo",
  "description": "Llavero de metal con escudo y tres llaves pequeñas.",
  "category": "KEYS",
  "location": "Biblioteca central, mostrador de atención",
  "eventDate": "2024-11-12"
}
```

Respuesta `201`:

```json
{
  "id": "…",
  "type": "FOUND",
  "status": "ACTIVE",
  "ownerId": "00000000-0000-4000-8000-000000000001",
  "title": "Llaves con llavero de equipo",
  "description": "Llavero de metal con escudo y tres llaves pequeñas.",
  "category": "KEYS",
  "location": "Biblioteca central, mostrador de atención",
  "eventDate": "2024-11-12",
  "createdAt": "…",
  "updatedAt": "…"
}
```

Errores:

| Situación | HTTP | `code` |
|---|---|---|
| Datos inválidos | 400 | `VALIDATION_ERROR` con `details[]` |
| Encabezado ausente | 401 | `DEMO_IDENTITY_REQUIRED` |
| UUID inválido o usuario inexistente | 401 | `DEMO_IDENTITY_INVALID` |

El servidor fija `type=FOUND`, `status=ACTIVE` y `ownerId`: los campos `type`,
`status` y `ownerId` enviados por el cliente se rechazan con `VALIDATION_ERROR`.
Comparte validaciones y categorías con el endpoint de lost mediante el DTO base
`CreatePublicationDto`.

### `GET /api/v1/publications`

Listado público y paginado de publicaciones `status=ACTIVE`, de ambos tipos
(`LOST` y `FOUND`). No requiere identidad ni autenticación.

Parámetros de consulta:

| Parámetro | Tipo | Valores | Predeterminado |
|---|---|---|---|
| `q` | texto | 1–100 caracteres, recortado | ausente (sin búsqueda) |
| `type` | enum | `LOST`, `FOUND` | ausente (sin filtro) |
| `category` | enum | una de las nueve categorías | ausente (sin filtro) |
| `eventDateFrom` | fecha | `YYYY-MM-DD`, inclusiva | ausente |
| `eventDateTo` | fecha | `YYYY-MM-DD`, inclusiva | ausente |
| `sort` | enum | `recent`, `oldest`, `relevance` | `recent` |
| `page` | entero | ≥ 1 | `1` |
| `pageSize` | entero | 1–50 | `12` |

`q` busca de forma insensible a mayúsculas sobre `title`, `description` y
`location`. Combina coincidencias parciales `ILIKE` con el operador trigram `%`
de `pg_trgm` (umbral `0.15`, local a la transacción); con 1 o 2 caracteres se usa
solo `ILIKE`. Los filtros y `q` se combinan con AND; `status=ACTIVE` es siempre
obligatorio. `eventDateFrom`/`eventDateTo` son inclusivos y pueden usarse por
separado.

`recent` ordena por `createdAt DESC, id DESC`; `oldest` por
`createdAt ASC, id ASC`; `relevance` por la mayor similitud trigram entre `q` y
`title`, `description` o `location`, con desempate `createdAt DESC, id DESC`.
`sort=relevance` sin `q` responde `400` con detalle en `sort`. El rango de fechas
invertido responde `400` con detalle en `eventDateTo`.

Los parámetros desconocidos (`status`, `ownerId`, …) responden `400`; `status`
no permite consultar estados no activos.

Respuesta `200`:

```json
{
  "items": [
    {
      "id": "…",
      "type": "LOST",
      "status": "ACTIVE",
      "title": "Bicicleta rodado 29",
      "description": "Bicicleta azul con canasto negro y una calcomanía.",
      "category": "SPORTS",
      "location": "Plaza San Martín",
      "eventDate": "2024-05-10",
      "createdAt": "…"
    }
  ],
  "page": 1,
  "pageSize": 12,
  "total": 1,
  "totalPages": 1
}
```

Las publicaciones `RESERVED`, `RETURNED` y `CLOSED` no se incluyen en `items` ni
en `total`. `totalPages` es `0` cuando no hay resultados. Los elementos del
listado no exponen `ownerId`.

Errores:

| Situación | HTTP | `code` |
|---|---|---|
| Parámetros inválidos o desconocidos | 400 | `VALIDATION_ERROR` con `details[]` |

### `GET /api/v1/publications/:id`

Detalle público de una publicación `status=ACTIVE`. No requiere identidad.

Respuesta `200`:

```json
{
  "id": "…",
  "type": "FOUND",
  "status": "ACTIVE",
  "title": "Llaves con llavero de equipo",
  "description": "Llavero de metal con escudo y tres llaves pequeñas.",
  "category": "KEYS",
  "location": "Biblioteca central, mostrador de atención",
  "eventDate": "2024-11-12",
  "createdAt": "…",
  "updatedAt": "…"
}
```

Errores:

| Situación | HTTP | `code` |
|---|---|---|
| UUID inválido | 400 | `VALIDATION_ERROR` con detalle del campo `id` |
| No existe o no está `ACTIVE` | 404 | `PUBLICATION_NOT_FOUND` |

Una publicación `RESERVED`, `RETURNED` o `CLOSED` responde el mismo `404` que un
identificador inexistente, sin revelar su existencia. La consulta selecciona
únicamente las columnas públicas que forman el detalle y no devuelve `ownerId`,
datos de contacto ni información del usuario.

### `GET /api/v1/publications/:id/matches`

Devuelve sugerencias públicas `SUGGESTED` de una publicación `ACTIVE`, sin
requerir identidad. Solo considera candidatas `ACTIVE` del tipo opuesto.

Respuesta `200`:

```json
{
  "publicationId": "…",
  "items": [
    {
      "id": "…",
      "status": "SUGGESTED",
      "candidate": {
        "id": "…",
        "type": "FOUND",
        "status": "ACTIVE",
        "title": "Billetera negra encontrada",
        "description": "Billetera de cuero con tarjetas.",
        "category": "BAGS",
        "location": "Plaza Central",
        "eventDate": "2026-11-01",
        "createdAt": "…"
      },
      "score": 0.84,
      "scoreBreakdown": {
        "text": { "score": 0.8, "weight": 0.5, "contribution": 0.4 },
        "category": { "score": 1, "weight": 0.2, "contribution": 0.2 },
        "date": { "score": 1, "weight": 0.15, "contribution": 0.15 },
        "location": { "score": 0.6, "weight": 0.15, "contribution": 0.09 }
      },
      "eventDateDifferenceDays": 0
    }
  ]
}
```

El score está normalizado entre 0 y 1. El endpoint devuelve hasta 10 resultados
con score `>= 0.55`, ordenados por score, fecha del evento e identificador. La
respuesta no contiene `ownerId` ni datos privados.

Errores:

| Situación | HTTP | `code` |
|---|---|---|
| UUID inválido | 400 | `VALIDATION_ERROR` con detalle del campo `id` |
| Origen inexistente o no `ACTIVE` | 404 | `PUBLICATION_NOT_FOUND` |

## Mis publicaciones y moderación (CU9)

Todos los endpoints requieren `X-Demo-User-Id` mientras `AUTH_MODE=demo`.

### `GET /api/v1/publications/mine`

Devuelve las publicaciones del usuario autenticado con todos sus estados. No
expone datos de otros propietarios ni correo.

### `GET /api/v1/publications/mine/:id`

Devuelve el detalle de una publicación propia. Una publicación de otro usuario
responde `404 PUBLICATION_NOT_FOUND`.

### `PUT /api/v1/publications/:id`

Actualiza una publicación propia en estado `ACTIVE`. El cuerpo usa los mismos
campos y validaciones que la creación. Una publicación no `ACTIVE` responde
`409 PUBLICATION_NOT_EDITABLE`; una publicación ajena responde `404`.

### `POST /api/v1/publications/:id/close`

Cierre lógico de una publicación propia `ACTIVE`: pasa a `CLOSED`, conserva el
registro y no elimina publicaciones ni solicitudes. Una publicación no `ACTIVE`
responde `409 PUBLICATION_NOT_CLOSABLE`; si tiene solicitudes `PENDING` o
`APPROVED`, responde `409 PUBLICATION_HAS_ACTIVE_REQUESTS`.

### `GET /api/v1/admin/publications`

Solo ADMIN. Devuelve publicaciones `ACTIVE` de otros usuarios para moderación.
El administrador puede cerrarlas mediante `POST /api/v1/publications/:id/close`.
No existe panel global completo, gestión de usuarios ni eliminación de
publicaciones.

CU9 no implementa eliminación de publicaciones. La gestión de solicitudes
relacionadas quedó parcial: las solicitudes se gestionan en CU7/CU8 desde sus
pantallas específicas, no desde una consola integral de publicaciones.

## Solicitudes de recuperación (CU7–CU8)

CU7 implementa creación, aprobación, rechazo y cancelación. CU8 implementa la
finalización de una solicitud `APPROVED` y la transición de la publicación a
`RETURNED`. Todos los endpoints requieren `X-Demo-User-Id` mientras
`AUTH_MODE=demo`.

### `POST /api/v1/publications/:id/recovery-requests`

Cuerpo opcional:

```json
{ "notes": "Tiene una marca azul en la correa." }
```

- `notes` se recorta y admite hasta 500 caracteres.
- Solo publicaciones `FOUND` `ACTIVE`; el propietario no puede solicitarlas.
- Éxito: `201` con la solicitud `PENDING`.
- Publicación inexistente, no `ACTIVE` o no `FOUND`: `404 PUBLICATION_NOT_FOUND`.
- Propietario: `403 RECOVERY_REQUEST_FORBIDDEN`.
- Duplicado `PENDING`/`APPROVED`: `409 RECOVERY_REQUEST_DUPLICATE`.

### `GET /api/v1/recovery-requests/mine`

Devuelve un arreglo con las solicitudes del usuario, ordenado por
`createdAt DESC, id DESC`.

### `GET /api/v1/recovery-requests/received`

Devuelve un arreglo con las solicitudes de publicaciones propias, mismo orden.
Incluye el nombre visible del solicitante y no expone correo ni IDs internos.

### `POST /api/v1/recovery-requests/:id/approve`

Solo el propietario. En una transacción con bloqueo pesimista: exige publicación
`ACTIVE` y solicitud `PENDING`, verifica que no exista otra `APPROVED`, pasa la
solicitud a `APPROVED`, la publicación a `RESERVED` y rechaza las demás
`PENDING`. Una publicación no `ACTIVE` responde `404 PUBLICATION_NOT_FOUND`; una
solicitud no `PENDING`, `409 RECOVERY_REQUEST_NOT_PENDING`; otra `APPROVED` ya
existente, `409 RECOVERY_REQUEST_CONFLICT`.

### `POST /api/v1/recovery-requests/:id/reject`

Solo el propietario de una solicitud `PENDING`. Pasa a `REJECTED` sin cambiar la
publicación. Fuera de `PENDING`: `409 RECOVERY_REQUEST_NOT_PENDING`.

### `POST /api/v1/recovery-requests/:id/cancel`

Cuerpo obligatorio:

```json
{ "reason": "Ya lo encontré por mi cuenta." }
```

- `reason` se recorta y exige entre 3 y 500 caracteres.
- El solicitante cancela su `PENDING`; el solicitante, el propietario o un ADMIN
  cancelan una `APPROVED`.
- Cancelar una `APPROVED` verifica en una transacción que la publicación siga
  `RESERVED` y que esa solicitud sea la única `APPROVED`. Si no, responde `409
  RECOVERY_REQUEST_CONFLICT` sin reactivar.
- Estados terminales: `409 RECOVERY_REQUEST_NOT_CANCELLABLE`.

### `POST /api/v1/recovery-requests/:id/complete`

Cuerpo opcional:

```json
{ "returnNotes": "Entrega realizada en mano." }
```

- Solo el propietario de la publicación; un ADMIN no propietario no puede completar.
- La solicitud debe estar `APPROVED` y la publicación `RESERVED`.
- La solicitud pasa a `COMPLETED`; la publicación pasa a `RETURNED`.
- Guarda `completedAt`, `completedById` y `returnNotes`.
- Una solicitud ya completada responde `409 RECOVERY_REQUEST_ALREADY_COMPLETED`; una no aprobada, `409 RECOVERY_REQUEST_NOT_APPROVED`.

Respuesta (todas las operaciones):

```json
{
  "id": "…",
  "status": "PENDING",
  "notes": "…",
  "cancellationReason": null,
  "createdAt": "2026-11-07T10:00:00.000Z",
  "updatedAt": "2026-11-07T10:00:00.000Z",
  "publication": {
    "id": "…",
    "type": "FOUND",
    "status": "ACTIVE",
    "title": "…",
    "description": "…",
    "category": "BAGS",
    "location": "…",
    "eventDate": "2026-11-01",
    "createdAt": "2026-11-06T10:00:00.000Z"
  },
  "requesterDisplayName": "Usuario Demo"
}
```

`createdAt` es la creación y `updatedAt` la última modificación de la fila; no
son fechas de aprobación, rechazo o cancelación. No se exponen `ownerId`,
`requesterId`, `cancelledById`, correo ni contacto. No existe
`PUBLICATION_NOT_AVAILABLE`.

Limitaciones de CU7/CU8: listas sin paginación, sin notificaciones y sin JWT real
(identidad demo). La finalización registra la devolución en la misma solicitud y
no existe confirmación del solicitante ni una entidad `devoluciones` separada.

## Asistente y acciones CU10

`GET /api/v1/assistant/context` requiere identidad demo (`X-Demo-User-Id`) y
devuelve únicamente `{ "role": "USER" | "ADMIN" }`. Lo consume el MCP propio del
asistente para adaptar el prompt al rol.

FastAPI expone el ciclo completo de acciones:

- `POST /chat`: prepara acciones y devuelve la vista previa.
- `POST /chat/confirm`: ejecuta una acción preparada tras confirmación explícita.
- `POST /chat/cancel`: cancela una acción pendiente.
- `GET /chat/actions/{action_id}`: consulta el estado de una acción.
- `POST /chat/conversations/{conversation_id}/archive`: archiva la conversación e invalida acciones `PENDING`.

Las herramientas MCP de escritura no son invocadas por el modelo. FastAPI las
invoca únicamente después de la confirmación del usuario. El asistente no busca
publicaciones, no consulta coincidencias, no gestiona solicitudes, no registra
devoluciones ni ejecuta acciones administrativas.

## Backfill de coincidencias

Después de aplicar la migración CU6, el comando idempotente procesa publicaciones
`ACTIVE` existentes y persiste las parejas sugeridas que cumplen los criterios.
No elimina publicaciones ni reabre coincidencias `CONFIRMED` o `DISMISSED`.

```powershell
npm run matches:backfill
```

## Pruebas

Las suites no requieren base de datos: usan repositorios mockeados.

```powershell
npm test
npm run test:e2e
```

## Verificación del CU1

Con `backend/.env` configurado y las migraciones aplicadas:

```powershell
npm run verify:cu1
```

El script compila, aplica migraciones, inicia la API, ejecuta peticiones válidas e
inválidas, comprueba la fila en PostgreSQL y limpia los datos de prueba. No imprime
la contraseña.

## Verificación del CU2

Con `backend/.env` configurado y las migraciones aplicadas:

```powershell
npm run verify:cu2
```

El script compila, aplica migraciones, inicia la API, registra una publicación
`FOUND` con el usuario demo y ejecuta peticiones inválidas (datos inválidos,
`type`/`status`/`ownerId` spoofeados, identidad ausente e inválida). Limpia
exclusivamente las filas que él mismo crea, por ID exacto: no elimina ni modifica
los datos de CU1, incluida la publicación E2E conservada como evidencia. No imprime
la contraseña.

## Verificación del CU3

Con `backend/.env` configurado y las migraciones aplicadas:

```powershell
npm run verify:cu3
```

El script compila, aplica migraciones, comprueba los índices de búsqueda, inicia la
API y crea sus propias publicaciones para verificar listado, búsqueda por los tres
campos, tolerancia a errores de tipeo, paginación, detalle, validaciones y
exclusión de estados no activos. Limpia exclusivamente sus filas por ID exacto y
verifica que las evidencias de CU1 y CU2 quedan intactas. No imprime la contraseña.

## Verificación del CU4

Con `backend/.env` configurado y las migraciones aplicadas:

```powershell
npm run verify:cu4
```

El script compila, aplica migraciones, comprueba que se reutilizan los índices del
CU3 y que su migración sigue aplicada, inicia la API y crea publicaciones con
fechas de creación controladas. Verifica cada filtro, los extremos inclusivos,
las combinaciones con AND, la búsqueda textual, los tres órdenes, la paginación
con filtros, las validaciones y la exclusión de estados no activos. Limpia
exclusivamente sus filas por ID exacto y verifica que las evidencias de CU1 y CU2
quedan intactas. No imprime la contraseña.

## Verificación del detalle (CU5)

El contrato HTTP del detalle se verifica con las pruebas unitarias y E2E del
backend. La verificación real de PostgreSQL de CU3 ya cubre el endpoint, los
campos públicos y la respuesta `404` para identificadores inexistentes o estados
no activos; CU5 reutiliza esa cobertura mediante el alias:

```powershell
npm run verify:cu5
```

## Verificación del CU7

Con `backend/.env` configurado y las migraciones aplicadas:

```powershell
npm run verify:cu7
```

El script compila, aplica la migración aditiva, comprueba la tabla, checks e
índices, crea usuarios y publicaciones temporales propias, y verifica por HTTP y
PostgreSQL el flujo completo: creación, duplicado, listas, aprobación con rechazo
de otras pendientes, rechazo, cancelación `PENDING` y `APPROVED`, exclusividad de
una sola `APPROVED`, reserva inconsistente sin reactivación, permisos, privacidad
y `404` de publicación no apta. Limpia únicamente sus filas por ID exacto, sin
`db:revert` ni borrados generales, y confirma que las evidencias de CU1/CU2
quedan intactas. No imprime la contraseña.
