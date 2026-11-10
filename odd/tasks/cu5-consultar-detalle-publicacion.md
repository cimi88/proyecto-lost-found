# CU5 — Consultar el detalle de una publicación

Objetivo: completar la consulta pública del detalle de una publicación reutilizando el endpoint y la pantalla entregados por CU3, sin duplicar funcionalidades ni alterar CU1–CU4.
Rama: `main` (sin commits ni push por pedido del usuario). Entrega: un solo árbol de trabajo, sin slices commiteados.
Estado: **implementación completada y verificada; pendiente revisión del usuario**. CU5 no se archivó y CU6 no se inició. Sin commits ni push, sin migraciones nuevas, sin cambios de esquema, sin dependencias instaladas y sin cambios en los datos de evidencia de PostgreSQL.
Runner: backend Jest 30.5.2 + ts-jest; frontend Angular CLI/Vitest; verificaciones reales `verify:cu1` a `verify:cu4`; flujo real en Chrome headless mediante CDP; validación `openspec validate cu5-consultar-detalle-publicacion --strict`.

## 1. Solicitud y restricciones

La solicitud inicial pidió analizar el detalle existente de CU3 y preparar OpenSpec/ODD. La autorización posterior habilitó implementar exactamente esos artefactos, ejecutar las verificaciones y detenerse antes del archivado.

Restricciones registradas:

- No crear endpoints, rutas, entidades ni migraciones nuevas.
- No modificar el esquema ni los datos de evidencia de PostgreSQL.
- No instalar dependencias.
- No modificar ni archivar cambios de CU1–CU4.
- No realizar commits ni push.
- No archivar CU5.
- No comenzar CU6.
- La autorización explícita para implementar CU5 fue recibida.

## 2. Cobertura actual de CU3

| Área | Estado actual | ¿Cubre CU5? |
|---|---|---|
| Endpoint `GET /api/v1/publications/:id` | Implementado, público, sin identidad obligatoria | Sí |
| Visibilidad `ACTIVE` | Filtra `id + status=ACTIVE` | Sí |
| Publicación inexistente o no activa | `404 PUBLICATION_NOT_FOUND` sin revelar el estado | Sí |
| UUID inválido | `400 VALIDATION_ERROR` con detalle del campo `id` | Sí |
| Campos públicos | `id`, `type`, `status`, `title`, `description`, `category`, `location`, `eventDate`, `createdAt`, `updatedAt` | Parcial: la respuesta los incluye, pero la lectura no usa una proyección explícita |
| Datos privados | El mapper omite `ownerId`; no se exponen datos de usuario | Parcial: depende de descartar el campo después de leer la entidad completa |
| Ruta Angular `/publications/:id` | Implementada y enlazada desde los resultados | Sí |
| Estados de la vista | Carga, no encontrado, error y reintento | Sí |
| Presentación de campos | Muestra todos los campos, pero con `ACTIVE` e ISO sin formato legible | No completo |
| Navegación de regreso | El enlace siempre apunta a `/publications` sin criterios | No |
| Pruebas de detalle | Unitarias, E2E y de componente existentes | Parcial: faltan garantías de proyección y contexto de navegación |

## 3. Requisitos que faltan para CU5

- **S1** — Proyección pública explícita: el detalle debe leer solo columnas públicas y no cargar `ownerId`.
- **S2** — Contrato público completo: la respuesta debe mantener todos los campos públicos y nunca incluir `ownerId`, datos de contacto ni información del usuario.
- **S3** — Presentación legible: etiquetas en español para tipo, categoría y estado; fechas legibles con valor de máquina en `datetime`.
- **S4** — Navegación contextual: conservar `q`, `type`, `category`, `eventDateFrom`, `eventDateTo`, `sort` y `page` al abrir el detalle desde el listado y restaurarlos al volver.
- **S5** — Acceso directo: `/publications/:id` sin contexto debe volver a `/publications` sin parámetros agregados.
- **S6** — Compatibilidad: conservar los estados, errores, filtros, orden, paginación y formularios de CU1–CU4.
- **S7** — Verificación: pruebas unitarias/E2E de backend, pruebas de componente del frontend, regresiones reales y flujo de navegador.
- **S8** — Sin migraciones, dependencias nuevas ni cambios de datos.

No se requieren requisitos nuevos para:

- Crear otro endpoint de detalle.
- Agregar autenticación o autorización adicional.
- Exponer datos del propietario o contacto.
- Cambiar el modelo `Publication` o la tabla `publications`.
- Cambiar la regla `ACTIVE` ni la respuesta `404`.

## 4. Información pública que mostrará el detalle

Datos del objeto:

- Título.
- Descripción.
- Tipo (`Perdido` / `Encontrado`).
- Categoría en español.
- Ubicación.
- Fecha del evento.

Metadatos de la publicación:

- Estado (`Activa`).
- Identificador UUID.
- Fecha de creación.
- Fecha de actualización.

No se mostrará:

- `ownerId`.
- Nombre, correo, teléfono u otros datos del propietario.
- Datos internos de identidad o autenticación.
- Publicaciones `RESERVED`, `RETURNED` o `CLOSED`; siguen respondiendo `404`.

## 5. Cambios implementados

### Backend

- `findActivePublicationById` ahora selecciona explícitamente solo `id`, `type`, `status`, `title`, `description`, `category`, `location`, `eventDate`, `createdAt` y `updatedAt`.
- Se mantiene `where: { id, status: 'ACTIVE' }` y el contrato de error existente.
- Las pruebas unitarias verifican la proyección exacta y que `ownerId` no se selecciona; las pruebas E2E comprueban los campos públicos y ausencia de claves privadas.
- No se modificaron controladores, DTOs, endpoints, entidades, migraciones ni datos.

### Frontend

- Se mantuvieron `PublicationDetailPageComponent` y la ruta `/publications/:id`.
- Se agregó etiqueta de estado y formateo de fechas con `DatePipe`:
  - `eventDate`: `dd/MM/yyyy` en UTC.
  - `createdAt`/`updatedAt`: `dd/MM/yyyy HH:mm 'UTC'`.
  - Conservar el valor original en `<time datetime="...">`.
- Se muestran todos los campos públicos, separados en información del objeto y metadatos.
- Los enlaces del listado preservan query params; el detalle filtra el regreso con la allowlist `q`, `type`, `category`, `eventDateFrom`, `eventDateTo`, `sort`, `page`.
- El acceso directo sin parámetros vuelve a `/publications` sin query params.
- Se mantuvieron carga, 404, error y reintento.
- Las pruebas de listado y detalle cubren los nuevos comportamientos.

### Contratos y documentación

- Se actualizó el comentario de `contracts/v1/publication-search.ts` para explicitar la proyección pública y la ausencia de `ownerId` y datos de contacto.
- No cambiar la forma del contrato ni crear un contrato paralelo.
- Se actualizaron `backend/README.md`, `frontend/README.md` y `scripts/README.md` con el comportamiento y la verificación aplicable.
- Este ODD se actualizó con los resultados reales.

### Base de datos

- Sin migraciones.
- Sin cambios de esquema.
- Sin cambios de datos.
- Sin instalación de dependencias.

## 6. Archivos previstos

### Creados en esta planificación

- `openspec/changes/cu5-consultar-detalle-publicacion/proposal.md`
- `openspec/changes/cu5-consultar-detalle-publicacion/design.md`
- `openspec/changes/cu5-consultar-detalle-publicacion/tasks.md`
- `openspec/changes/cu5-consultar-detalle-publicacion/specs/publications/spec.md`
- `odd/tasks/cu5-consultar-detalle-publicacion.md`

### Modificados durante la implementación

- `backend/src/publications/publications.service.ts`
- `backend/src/publications/publications-search.service.spec.ts`
- `backend/test/publication-search.e2e-spec.ts`
- `frontend/src/app/publications/pages/publication-detail-page.component.ts`
- `frontend/src/app/publications/pages/publication-detail-page.component.html`
- `frontend/src/app/publications/pages/publication-detail-page.component.scss`
- `frontend/src/app/publications/pages/publication-detail-page.component.spec.ts`
- `frontend/src/app/publications/pages/publication-list-page.component.html`
- `frontend/src/app/publications/pages/publication-list-page.component.spec.ts`
- `frontend/src/app/publications/models/publication-search.models.ts`
- `contracts/v1/publication-search.ts`
- `backend/README.md`
- `frontend/README.md`
- `scripts/README.md`
- `openspec/changes/cu5-consultar-detalle-publicacion/tasks.md`
- Este ODD.

No se prevé modificar `frontend/src/app/publications/pages/publication-detail-page.component.scss` salvo que la presentación requiera un ajuste visual menor.

## 7. Pruebas ejecutadas y resultados

### Backend

- `npm test --prefix backend -- --runInBand`: **12 suites / 152 tests passed**.
- `npm run test:e2e --prefix backend -- --runInBand`: **5 suites / 51 tests passed**. Incluye contrato completo, ausencia explícita de `ownerId`/`user`/`contact`, `404` para `RESERVED`/`RETURNED`/`CLOSED`/inexistente y `400` para UUID inválido.
- `npm run build --prefix backend`: **OK**.

### Frontend

- `npm test --prefix frontend -- --watch=false`: **9 archivos / 62 tests passed**.
- Detalle: etiquetas y fechas legibles, `datetime` original, ausencia de información privada y estados de carga/404/error/reintento.
- Listado/detalle: criterios preservados al abrir y volver; acceso directo con regreso sin parámetros.
- `npm run build --prefix frontend`: **OK**.

### Regresión e integración

- `npm run verify:cu1 --prefix backend`: **14/14**.
- `npm run verify:cu2 --prefix backend`: **15/15**.
- `npm run verify:cu3 --prefix backend`: **47/47**.
- `npm run verify:cu4 --prefix backend`: **46/46**.
- Las verificaciones CU3/CU4 reportaron que ambas evidencias de CU1/CU2 estaban presentes antes y después de limpiar sus datos propios. Consulta posterior de solo lectura confirmó:
  - `82d35348-d8b3-4149-9ac7-4a8cbb0fe1ec` — `LOST / ACTIVE / BAGS`.
  - `12702eca-9ef6-4a03-9421-e980ae06e0c4` — `FOUND / ACTIVE / BAGS`.
- Chrome headless vía CDP: listado real filtrado por `q=Billetera`, `type=LOST`, `category=BAGS`, rango `2026-10-31..2026-11-01`, `sort=recent`, `page=1` → detalle desde PostgreSQL → regreso con todos los criterios. Verificó también el detalle directo con regreso limpio, 404 de identificador inexistente, ausencia de datos privados y **0 errores de consola**.
- `openspec validate cu5-consultar-detalle-publicacion --strict`: válido, sin fallos.

No se propone un `verify-cu5.ps1` nuevo: la verificación HTTP del detalle ya está cubierta por `verify:cu3` y la parte nueva es de navegación en la SPA. Crear un script adicional duplicaría el contrato de CU3 sin agregar cobertura real.

## 8. Decisiones, riesgos y conflictos

### Decisiones

- Reutilizar endpoint, ruta y componente existentes.
- Usar una proyección explícita en backend en lugar de confiar solo en el mapper.
- Llevar el contexto del listado en query params acotados, no en `navigationState`.
- No introducir un `returnUrl` para evitar redirecciones externas.
- Formatear fechas en UTC para evitar corrimientos y pruebas dependientes de la zona horaria.
- No agregar dependencias ni migraciones.

### Riesgos

- La URL del detalle incluirá parámetros de búsqueda; son criterios públicos y aceptables.
- `queryParamsHandling` puede arrastrar parámetros desconocidos; el enlace de regreso los filtra con una lista permitida.
- La proyección explícita obliga a actualizar mocks y expectativas de TypeORM.
- Las pruebas actuales del enlace de regreso esperan `/publications` sin parámetros; deberán actualizarse para cubrir ambos casos.
- El formato UTC puede diferir de la hora local del visitante; se indica `UTC` en el texto.

### Conflictos potenciales con CU1–CU4

- Ninguno funcional: no se cambia la forma de la respuesta, la visibilidad `ACTIVE`, los filtros, el orden, la paginación ni los formularios.
- La única modificación de comportamiento es la proyección interna y la navegación del detalle; CU1–CU4 deben seguir pasando sin cambios.
- No se toca la ausencia preexistente del archivo OpenSpec archivado de CU1.

### Decisiones pendientes

- Ninguna bloqueante. El alcance queda cerrado en el delta de `publications` y en el diseño.
- La aprobación del usuario es necesaria para pasar a implementación.

## 9. Artefactos OpenSpec

- `proposal.md`: motivo, alcance, capacidades e impacto.
- `specs/publications/spec.md`: cuatro requisitos `ADDED`:
  1. Proyección pública completa del detalle.
  2. Presentación legible del detalle.
  3. Navegación contextual entre listado y detalle.
  4. Sin regresión de CU1–CU4.
- `design.md`: contexto, decisiones, alternativas descartadas, riesgos y plan de despliegue.
- `tasks.md`: tareas de backend, frontend, contrato/documentación y verificación.
- Validación estricta: `openspec validate cu5-consultar-detalle-publicacion --strict` → **válido, 0 fallos**.
- Progreso final de tasks: **15/15 completadas**.

## 10. Estado final de la planificación

- CU5 implementado y verificado según el alcance aprobado.
- Sin migraciones, cambios de esquema, dependencias nuevas ni cambios a las filas de evidencia.
- CU1–CU4 siguen verificados; sus artefactos archivados no se modificaron.
- Cambio OpenSpec CU5 activo, no archivado, con **15/15 tasks completas**.
- Sin commits, sin push y sin iniciar CU6.
- Próximo paso: revisión y aprobación del usuario antes de cualquier archivado.
