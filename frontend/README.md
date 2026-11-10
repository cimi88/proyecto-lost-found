# Frontend

SPA Angular 22.2.x con TypeScript, SCSS, componentes standalone y formularios
reactivos. Consume la API REST versionada de NestJS; no implementa reglas de
negocio ni accede a PostgreSQL.

- Node.js **24.20.0**, npm **12.0.2**.
- Angular **22.2.x**, Vitest **5.1.0** (runner del scaffold).

## Instalación

Desde `frontend/`:

```powershell
npm install
```

## Desarrollo

```powershell
npm start
```

La aplicación queda disponible en `http://localhost:4200` y consume
`http://localhost:3000/api`.

## Configuración de entornos

| Archivo | Uso | `apiBaseUrl` | Identidad demo |
|---|---|---|---|
| `src/environments/environment.ts` | Desarrollo y pruebas | `http://localhost:3000/api` | Habilitada |
| `src/environments/environment.production.ts` | Build de producción | `/api` | Deshabilitada |

`angular.json` reemplaza `environment.ts` por `environment.production.ts` en la
configuración de producción.

El interceptor `demoIdentityInterceptor` agrega el encabezado
`X-Demo-User-Id` con el perfil demo activo, seleccionado en la pantalla `/`.
Es una costura exclusivamente local: no es autenticación y no aporta
autorización real. El backend rechaza `AUTH_MODE=demo` cuando
`NODE_ENV=production` (ver [ADR 0008](../docs/adr/0008-demo-identity-seam.md)).

La pantalla `/` ofrece registro simulado e inicio de sesión con los perfiles
demo A/B. `/register` no crea cuentas ni persiste datos. La identidad activa se
guarda en localStorage y las rutas internas requieren una sesión demo.

## CU1 — Registrar objeto perdido

Ruta `/lost`, accesible después de iniciar sesión. El formulario envía
`POST /api/v1/lost-publications` con:

- `title`: obligatorio, entre 3 y 120 caracteres.
- `description`: obligatoria, entre 10 y 1000 caracteres.
- `category`: una de las nueve categorías acordadas.
- `location`: obligatoria, entre 3 y 120 caracteres.
- `eventDate`: fecha `YYYY-MM-DD` válida y no futura.

La interfaz muestra errores por campo, un mensaje para errores de identidad o
conexión y una confirmación con el identificador de la publicación creada.

Las nueve categorías están definidas en
`src/app/publications/domain/publication-category.ts` y se verifican con pruebas
junto con la lista canónica del backend.

## CU2 — Registrar objeto encontrado

Ruta `/found`, alcanzable desde la barra de navegación del shell
(`Perdí un objeto` → `/lost`, `Encontré un objeto` → `/found`). El formulario envía
`POST /api/v1/found-publications` con los mismos campos y validaciones que CU1:

- `title`: obligatorio, entre 3 y 120 caracteres.
- `description`: obligatoria, entre 10 y 1000 caracteres.
- `category`: una de las nueve categorías acordadas.
- `location` (lugar donde lo encontraste): obligatorio, entre 3 y 120 caracteres.
- `eventDate` (fecha en que lo encontraste): fecha `YYYY-MM-DD` válida y no futura.

La publicación se crea con `type=FOUND` y `status=ACTIVE`, asociada al usuario
de demostración por el mismo interceptor de CU1. La página reutiliza por import
las categorías del dominio y el validador de fecha, y replica el manejo de
errores: errores por campo (400), mensaje de identidad demo (401), mensaje de
conexión y confirmación con el identificador creado.

Ambos formularios funcionan de forma independiente: CU1 está en `/lost` y CU2
en `/found`; la ruta desconocida redirige a `/`.

## CU3 — Buscar objetos

La barra de navegación del shell incorpora `Buscar` → `/publications`.

### Listado y búsqueda

`/publications` muestra las publicaciones `ACTIVE` de ambos tipos (`LOST` y
`FOUND`) y consume `GET /api/v1/publications`. La búsqueda envía:

- `q` (opcional): se recorta y se omite si queda vacío o solo tiene espacios.
  Busca sobre título, descripción y ubicación.
- `page`: página solicitada, con `≥ 1` (predeterminada `1`).
- `pageSize`: tamaño de página fijo de `12` en la interfaz.

El formulario navega con `Router.navigate` y refleja la búsqueda en la URL
(`/publications?q=…&page=1`), por lo que el enlace es compartible y los botones
atrás/adelante del navegador funcionan. Los parámetros se leen de
`queryParamMap`; un `page` inválido se normaliza a `1`. El botón `Limpiar`
vuelve al listado sin `q`.

La página cubre los estados de carga, resultados, vacío y error, y muestra
tarjetas con tipo, título, categoría, ubicación, fecha del evento y un enlace al
detalle. La paginación usa `Anterior`/`Siguiente` y el indicador
`Página X de Y`; los botones se deshabilitan en los extremos. Una página
posterior a la última se muestra como estado vacío junto con la paginación.

### Detalle

`/publications/:id` consume `GET /api/v1/publications/:id` y muestra los campos
públicos de la publicación (sin `ownerId` ni datos de contacto): identificador,
tipo, estado, título, descripción, categoría, ubicación, fecha del evento,
creación y actualización. El tipo, la categoría y el estado usan etiquetas en
español; las fechas se presentan en formato `dd/MM/yyyy` y los metadatos de
creación/actualización indican `UTC`, manteniendo el valor original en
`datetime`.

Al abrir un detalle desde resultados se conservan `q`, tipo, categoría, rango de
fechas, orden y página en la URL; el enlace de vuelta restaura esos criterios.
Un detalle abierto directamente vuelve a `/publications` sin parámetros.

La página distingue carga, detalle, `404 PUBLICATION_NOT_FOUND` (publicación
inexistente o no activa) y error de conexión, con opción de reintentar. Las
rutas `/lost` y `/found` conservan sus formularios; `/` es la pantalla de acceso.

## CU4 — Filtrar y ordenar objetos

`/publications` incorpora filtros y orden sobre el mismo endpoint
`GET /api/v1/publications`:

- `type`: `LOST` o `FOUND`.
- `category`: una de las nueve categorías.
- `eventDateFrom` y `eventDateTo`: fechas inclusivas `YYYY-MM-DD`, utilizables
  por separado.
- `sort`: `recent` (predeterminado), `oldest` o `relevance`.

Los filtros se aplican con un submit explícito, se combinan con `q` mediante
AND y reinician la paginación a `page=1`. La URL refleja todos los criterios y
la paginación los conserva. `Limpiar` elimina la búsqueda, los filtros y el
orden, y vuelve a `recent`.

Si `q` queda vacío, la opción `relevance` se deshabilita y el componente
normaliza un `sort=relevance` de la URL a `recent`. Un rango de fechas invertido
se rechaza en la interfaz antes de navegar. Un `400` del backend se muestra como
error de búsqueda o filtros inválidos.

## CU6 — Coincidencias sugeridas en el detalle

El detalle `/publications/:id` incorpora la sección `Coincidencias sugeridas`,
que consulta `GET /api/v1/publications/:id/matches` de forma independiente al
detalle principal. La carga y los errores de coincidencias NO ocultan el detalle
de la publicación.

Cada tarjeta muestra el tipo, título, categoría, ubicación y fecha del candidato,
el porcentaje de coincidencia y el desglose de señales con el que se explica la
sugerencia: similitud de texto, categoría (coincide/diferente), diferencia de
días entre eventos y similitud de ubicación. Un enlace abre el detalle público de
la candidata.

El texto aclara explícitamente que son sugerencias automáticas que no confirman
que se trate del mismo objeto. La sección cubre los estados de carga
(`Buscando coincidencias…`), error con botón `Reintentar` local a la sección,
ausencia de coincidencias y listado. No se muestran datos del propietario ni de
contacto.

## CU7 — Solicitar recuperación

El detalle `/publications/:id` incorpora la sección «Solicitar recuperación»
cuando la publicación es `FOUND` y está `ACTIVE`. El formulario permite notas
opcionales (máximo 500 caracteres) y, si ya existe una solicitud propia
`PENDING` o `APPROVED`, muestra su estado y fechas en lugar del formulario. La
sección usa el fragmento `#solicitar-recuperacion` para desplazarse y enfocarse.

Las tarjetas de coincidencias de CU6 agregan «Solicitar recuperación» solo
cuando el candidato es `FOUND`, enlazando al detalle con ese fragmento. El estado
de la coincidencia no cambia.

El nav autenticado incluye Mis solicitudes y Recibidas, además de Perdí un objeto,
Encontré un objeto, Buscar, Asistente y Mis publicaciones; ADMIN agrega Moderación.

- `/recovery-requests` («Mis solicitudes»): lista las solicitudes propias y
  permite cancelar `PENDING`/`APPROVED` con un motivo obligatorio (3–500).
- `/recovery-requests/received` («Solicitudes recibidas»): lista las solicitudes
  de publicaciones propias con el nombre visible del solicitante; permite
  aprobar/rechazar `PENDING` y cancelar `APPROVED` con motivo.

Las fechas se muestran como «Creada» y «Última actualización»; el estado actual
comunica la decisión y `updatedAt` nunca se presenta como fecha de aprobación,
rechazo o cancelación. No se muestran correos, identificadores internos ni datos
de contacto. Las páginas cubren carga, vacío, error con reintento y los errores
403/404/409 de la API.

## CU8 — Registrar devolución

En «Solicitudes recibidas», una solicitud `APPROVED` de una publicación
`RESERVED` permite registrar la devolución mediante notas opcionales de hasta
500 caracteres. La operación pasa la solicitud a `COMPLETED`, la publicación a
`RETURNED` y muestra fecha de devolución y notas. Solo puede completarla el
propietario; un ADMIN no propietario no puede hacerlo.

## CU9 — Mis publicaciones

`/my-publications` lista las publicaciones propias de ambos tipos y todos los
estados. Las publicaciones `ACTIVE` permiten editar sus datos y cerrarlas
lógicamente; el cierre conserva el registro y deja de ser visible públicamente.

La eliminación de publicaciones no está implementada. La gestión de solicitudes
relacionadas quedó parcial: las pantallas de solicitudes cubren aprobación,
rechazo, cancelación y devolución, pero no existe un panel administrativo global
ni una integración completa desde la gestión de publicaciones.

Los usuarios ADMIN acceden a `/admin/publications` para listar y cerrar
publicaciones activas de otros usuarios.

## CU10 — Asistente con preparación y confirmación

`/assistant` ofrece un chat para explicar LostFound y preparar operaciones. El
servicio Angular envía mensajes e historial a FastAPI (`assistantBaseUrl`) y
muestra la respuesta con el rol devuelto por el backend.

El asistente puede preparar:

- publicaciones de objetos perdidos;
- publicaciones de objetos encontrados;
- solicitudes de recuperación.

Muestra una vista previa y exige confirmación explícita antes de ejecutar. Las
herramientas MCP de escritura son invocadas por FastAPI solo después de esa
confirmación; el modelo no ejecuta escrituras directamente.

No puede buscar publicaciones, consultar coincidencias, gestionar solicitudes,
editar/cerrar publicaciones, registrar devoluciones, ejecutar moderación ni
contactar a otros usuarios. Las conversaciones se guardan en localStorage por
UUID de perfil demo y no se comparten entre perfiles.

Requiere FastAPI en `http://localhost:8000` y MCP en `http://127.0.0.1:8001`.
La identidad demo se propaga con `X-Demo-User-Id` mediante el interceptor
existente. No es autenticación real.

## Pruebas

```powershell
npm test -- --watch=false
```

Las pruebas usan `HttpTestingController` y no requieren backend ni base de datos.

## Build

```powershell
npm run build
```

El build de producción deshabilita el interceptor de identidad demo y usa
`apiBaseUrl=/api`.
