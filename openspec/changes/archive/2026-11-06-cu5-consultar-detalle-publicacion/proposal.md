# Proposal

## Why

CU3 ya entregó `GET /api/v1/publications/:id` y la ruta `/publications/:id`, pero el detalle público todavía presenta valores técnicos y pierde el contexto de búsqueda al volver al listado. CU5 debe completar la consulta pública del detalle sin duplicar el endpoint ni la pantalla existentes: información pública completa, legible y segura, con navegación de regreso que conserve los criterios de CU3/CU4.

## What Changes

- Reutilizar el endpoint y la pantalla de detalle de CU3; no se agregan endpoints, rutas, entidades ni migraciones.
- Endurecer la lectura del detalle con una proyección explícita de columnas públicas. La respuesta MUST seguir incluyendo `id`, `type`, `status`, `title`, `description`, `category`, `location`, `eventDate`, `createdAt` y `updatedAt`, y MUST NOT incluir `ownerId`, datos de contacto ni información del usuario.
- Completar la presentación del detalle con etiquetas en español para tipo, categoría y estado, fechas legibles con valor de máquina accesible y separación clara entre datos del objeto y metadatos de publicación.
- Conservar los criterios de búsqueda, filtros, orden y página al abrir el detalle desde `/publications`, y restaurarlos en el enlace de regreso. Un acceso directo a `/publications/:id` sin contexto MUST volver a `/publications` sin parámetros inventados.
- Mantener los estados de carga, no encontrado, error y reintento ya existentes, y cubrir el nuevo comportamiento con pruebas de backend, frontend y navegación real.
- Actualizar el contrato manual y la documentación afectada para dejar explícitas las garantías públicas del detalle. No se modifican CU1–CU4.

## Capabilities

### New Capabilities

- Ninguna.

### Modified Capabilities

- `publications`: se agregan requisitos de proyección pública segura, presentación completa del detalle y navegación contextual de regreso sobre el detalle ya definido en CU3.

## Impact

- Backend: lectura de publicaciones en `PublicationsService`, mapeo de respuesta pública y pruebas unitarias/E2E. Sin cambios de esquema, migraciones ni datos.
- Frontend: `PublicationDetailPageComponent`, enlaces de detalle del listado, modelo/contrato de lectura y pruebas unitarias.
- Contrato: `contracts/v1/publication-search.ts` y documentación de los endpoints de lectura.
- OpenSpec y ODD: delta de `publications`, diseño, tareas y registro de CU5.
- Sin nuevas dependencias, sin commits, sin push y sin iniciar CU6.
