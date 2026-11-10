# Tasks

## 1. Backend

- [x] 1.1 En `backend/src/publications/publications.service.ts`, reemplazar la lectura completa de `findActivePublicationById` por una proyección explícita de columnas públicas (`id`, `type`, `status`, `title`, `description`, `category`, `location`, `eventDate`, `createdAt`, `updatedAt`) manteniendo `where: { id, status: 'ACTIVE' }`. Verificación: `publications-search.service.spec.ts` comprueba la lista exacta de columnas seleccionadas y que `ownerId` no se lee.
- [x] 1.2 Ampliar `backend/src/publications/publications-search.service.spec.ts` para cubrir el detalle con todos los campos públicos, `updatedAt`, ausencia de `ownerId`, `404 PUBLICATION_NOT_FOUND` para inexistente o no activa y el contrato de error. Verificación: `npm test --prefix backend` en verde.
- [x] 1.3 Extender `backend/test/publication-search.e2e-spec.ts` con aserciones explícitas del contrato público completo del detalle, ausencia de `ownerId` y datos de usuario, `404` para estados no activos y `400` para UUID inválido. Verificación: `npm run test:e2e --prefix backend` en verde sin modificar las suites de CU1–CU4.

## 2. Frontend

- [x] 2.1 Agregar la etiqueta de estado `Activa` y el formateo de fechas en `PublicationDetailPageComponent` usando `DatePipe`: `eventDate` como `dd/MM/yyyy` en UTC y `createdAt`/`updatedAt` como `dd/MM/yyyy HH:mm 'UTC'`, conservando el valor original en `datetime`. Verificación: el spec del detalle comprueba etiquetas en español, textos legibles y atributos `datetime`.
- [x] 2.2 Actualizar la plantilla del detalle para mostrar todos los campos públicos con separación entre datos del objeto y metadatos, sin `ownerId` ni datos de contacto, manteniendo los estados de carga, no encontrado, error y reintento. Verificación: el spec del detalle cubre el render completo y los cuatro estados existentes.
- [x] 2.3 Conservar el contexto del listado al abrir el detalle: agregar `queryParamsHandling="preserve"` a los enlaces de `publication-list-page.component.html` y construir en el detalle un enlace de regreso con una lista permitida de parámetros (`q`, `type`, `category`, `eventDateFrom`, `eventDateTo`, `sort`, `page`). Verificación: los specs del listado y del detalle comprueban el `href` con contexto y el regreso a `/publications` sin parámetros en acceso directo.
- [x] 2.4 Actualizar `frontend/src/app/publications/models/publication-search.models.ts` y los comentarios del contrato para reflejar la etiqueta de estado y las garantías públicas del detalle, sin cambiar la forma de los tipos HTTP. Verificación: `npm run build --prefix frontend` y las pruebas de modelos/componentes siguen en verde.

## 3. Contrato y documentación

- [x] 3.1 Actualizar `contracts/v1/publication-search.ts` para documentar que `GET /api/v1/publications/:id` devuelve todos los campos públicos, nunca `ownerId` ni datos de contacto, y que la proyección es limitada a columnas públicas. Verificación: el contrato coincide con `publication-read-response.ts` y con las pruebas E2E.
- [x] 3.2 Actualizar `backend/README.md`, `frontend/README.md` y `scripts/README.md` con el comportamiento de CU5 y la verificación propuesta, sin duplicar la documentación de CU3/CU4. Verificación: los comandos y rutas documentados existen y coinciden con los scripts del repositorio.
- [x] 3.3 Completar `odd/tasks/cu5-consultar-detalle-publicacion.md` con el objetivo, las specs, las decisiones, las tareas y, al implementar, los resultados de verificación. Verificación: el documento refleja el estado real y no declara pruebas no ejecutadas.

## 4. Verificación e integración

- [x] 4.1 Ejecutar `npm test --prefix backend`, `npm run test:e2e --prefix backend` y `npm run build --prefix backend`. Verificación: todas las suites y el build terminan en verde.
- [x] 4.2 Ejecutar `npm test --prefix frontend -- --watch=false` y `npm run build --prefix frontend`. Verificación: todos los archivos de prueba y el build terminan en verde.
- [x] 4.3 Ejecutar `npm run verify:cu1 --prefix backend`, `npm run verify:cu2 --prefix backend`, `npm run verify:cu3 --prefix backend` y `npm run verify:cu4 --prefix backend`. Verificación: las cuatro verificaciones reales quedan en verde y las filas de evidencia de CU1/CU2 permanecen intactas.
- [x] 4.4 Verificar el flujo real en navegador: aplicar `q`, filtros, orden y página en `/publications`, abrir un detalle y volver con los mismos criterios; abrir un detalle directo y comprobar el regreso sin parámetros; comprobar 404 y ausencia de errores de consola. Verificación: el recorrido se registra en el ODD de CU5.
- [x] 4.5 Ejecutar `openspec validate cu5-consultar-detalle-publicacion --strict`. Verificación: 0 fallos y el delta de `publications` sin advertencias estrictas.

## Workflow follow-up

- Archivar el cambio con el procedimiento oficial de OpenSpec después de la revisión y autorización del usuario.
- Sincronizar las especificaciones de CU5 en `openspec/specs/publications/spec.md` al archivar.
- No realizar commits ni push sin pedido explícito.
