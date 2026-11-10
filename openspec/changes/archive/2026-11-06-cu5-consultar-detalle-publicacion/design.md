# Design

## Context

CU3 ya entregó la lectura pública de publicaciones:

- `GET /api/v1/publications/:id` devuelve una publicación `ACTIVE` por UUID, responde `404 PUBLICATION_NOT_FOUND` si no existe o no está activa y `400 VALIDATION_ERROR` si el UUID es inválido.
- La respuesta actual incluye `id`, `type`, `status`, `title`, `description`, `category`, `location`, `eventDate`, `createdAt` y `updatedAt`, sin `ownerId`.
- La SPA ya tiene `/publications/:id`, navegación desde los resultados, estados de carga, no encontrado, error y reintento.
- CU4 sincroniza `q`, `type`, `category`, `eventDateFrom`, `eventDateTo`, `sort` y `page` en la URL del listado, pero el enlace al detalle no conserva ese contexto y el enlace de regreso siempre apunta a `/publications`.

La brecha de CU5 no es un endpoint nuevo ni una pantalla nueva. Es completar la consulta pública existente con una proyección explícitamente pública, una presentación legible de todos los datos y una navegación de regreso que no pierda los criterios de búsqueda.

## Goals / Non-Goals

**Goals:**

- Garantizar que el detalle solo lea y devuelva columnas públicas.
- Mostrar el detalle completo con etiquetas en español y fechas legibles.
- Conservar el contexto del listado al abrir el detalle y restaurarlo al volver.
- Mantener los estados y errores ya implementados por CU3.
- Cubrir el comportamiento con pruebas y verificación real sin tocar CU1–CU4.

**Non-Goals:**

- Nuevos endpoints, rutas, entidades, columnas, migraciones o dependencias.
- Datos del propietario, contacto, coincidencias, solicitudes de recuperación, autenticación JWT real o chatbot.
- Cambiar la visibilidad `ACTIVE`, la búsqueda, los filtros, el orden o la paginación de CU3/CU4.
- Refactorizaciones generales del listado o de los formularios de CU1/CU2.

## Decisions

### 1. Reutilizar el endpoint y la ruta de CU3

No se crea `GET /api/v1/publications/:id/detail` ni una ruta Angular adicional. El contrato sigue siendo `GET /api/v1/publications/:id` y la ruta sigue siendo `/publications/:id`. CU5 solo amplía la garantía de contenido público y la experiencia de la SPA.

**Alternativa descartada:** un endpoint específico de detalle. Duplicaría la lectura existente y obligaría a mantener dos contratos y dos pruebas para la misma regla `ACTIVE`.

### 2. Proyección explícita de columnas públicas en backend

`findActivePublicationById` seguirá usando la misma condición `id + status=ACTIVE`, pero seleccionará únicamente las columnas públicas:

`id`, `type`, `status`, `title`, `description`, `category`, `location`, `eventDate`, `createdAt`, `updatedAt`.

Se descarta leer la entidad completa y confiar en que el mapper omita `ownerId`. La proyección hace que el dato privado no llegue a la capa de aplicación y deja una prueba explícita para evitar regresiones.

**Alternativa descartada:** mantener la entidad completa y agregar solo una prueba de respuesta. Es más simple, pero no impide que una consulta futura cargue datos privados innecesariamente.

### 3. Etiquetas y fechas en la SPA

Se reutilizan `PUBLICATION_TYPE_LABELS` y `PUBLICATION_CATEGORY_LABELS`. Se agrega una etiqueta de estado para `ACTIVE` (`Activa`) y se usa `DatePipe` en la plantilla:

- `eventDate` se muestra como fecha sin hora y se formatea en UTC para evitar el corrimiento de día de una fecha `YYYY-MM-DD`.
- `createdAt` y `updatedAt` se muestran como fecha y hora en UTC con la indicación `UTC`, para que el valor sea inequívoco.
- Cada fecha conserva el valor original en `datetime` para accesibilidad y para pruebas.

No se agrega una librería de internacionalización: el formato numérico `dd/MM/yyyy` es legible y no requiere registrar locales adicionales.

### 4. Contexto de navegación por query params acotados

Los enlaces “Ver detalle” del listado usarán `queryParamsHandling="preserve"`. Así el detalle recibe los mismos `q`, `type`, `category`, `eventDateFrom`, `eventDateTo`, `sort` y `page` que estaban activos en el listado.

El detalle leerá `queryParamMap`, filtrará únicamente esa lista de claves conocidas y construirá el enlace de regreso con `[routerLink]="['/publications']" [queryParams]="returnQueryParams()"`. Un acceso directo sin contexto produce `{}` y vuelve a `/publications`.

**Ventajas:** el contexto sobrevive a una recarga, una URL de detalle se puede compartir y no se introduce un parámetro `returnUrl` que pudiera habilitar redirecciones externas.

**Alternativa descartada:** guardar el contexto en `router.navigationState`. Se pierde al recargar y no permite compartir el detalle con el mismo regreso.

### 5. Sin cambios de contrato público

`contracts/v1/publication-search.ts` ya declara `PublicationDetail` con los campos necesarios. Se actualizará su comentario para dejar explícito que el detalle es público, que no incluye `ownerId` y que la proyección es limitada a columnas públicas. No se cambia la forma de la respuesta ni se crea un contrato paralelo.

**Alternativa descartada:** mover el detalle a `contracts/v1/publication-detail.ts`. Sería un cambio de organización sin beneficio funcional y duplicaría tipos ya compartidos.

### 6. Pruebas por capa

- Backend unitario: el servicio consulta con proyección de columnas públicas, mantiene `status=ACTIVE`, mapea todos los campos y no devuelve `ownerId`.
- Backend E2E: se conserva la prueba de contrato exacto del detalle y se agregan aserciones de campos públicos y ausencia de datos privados si la prueba actual no las cubre de forma explícita.
- Frontend: el detalle renderiza todos los campos, etiquetas y fechas legibles; conserva carga, 404, error y reintento; el enlace de regreso conserva los parámetros; el acceso directo vuelve sin parámetros; el enlace del listado arrastra el contexto.
- Verificación real: flujo de listado con `q`, filtros, orden y página, apertura del detalle y regreso con los mismos criterios; regresión de CU1–CU4.

## Risks / Trade-offs

- **URL de detalle con query params:** muestra el contexto de búsqueda en la barra de direcciones. Es aceptable porque son criterios públicos y permite recarga/compartición.
- **Parámetros desconocidos en el detalle:** `queryParamsHandling` podría arrastrarlos. El enlace de regreso usa una lista permitida, por lo que los ignora.
- **Formato UTC:** puede no coincidir con la hora local del visitante. Se indica `UTC` explícitamente para evitar ambigüedad y mantener pruebas deterministas.
- **Proyección explícita:** obliga a actualizar mocks y expectativas de TypeORM. Es un cambio acotado y verificable.
- **Duplicación de pruebas de detalle:** se reutilizan las pruebas de CU3 y solo se agregan las garantías nuevas, para no convertir CU5 en una segunda suite del mismo endpoint.

## Migration Plan

No hay migraciones ni cambios de datos. El orden de despliegue es backend y luego frontend, aunque la respuesta HTTP mantiene la misma forma y el frontend anterior seguiría funcionando. El rollback consiste en revertir los cambios de lectura y de la SPA; no requiere restaurar datos ni ejecutar `db:revert`.

## Open Questions

Ninguna bloqueante. Las decisiones de alcance quedan cerradas en este diseño y en el delta de `publications`.
