# Spec Delta

## ADDED Requirements

### Requirement: Proyección pública completa del detalle

El detalle `GET /api/v1/publications/:id` SHALL devolver todos los campos públicos de una publicación activa: `id`, `type`, `status`, `title`, `description`, `category`, `location`, `eventDate`, `createdAt` y `updatedAt`. La respuesta MUST NOT incluir `ownerId`, datos de contacto ni información del usuario.

#### Scenario: Detalle con todos los campos públicos

- **WHEN** se solicita el detalle de una publicación `ACTIVE`
- **THEN** responde `200` con `id`, `type`, `status=ACTIVE`, `title`, `description`, `category`, `location`, `eventDate`, `createdAt` y `updatedAt`

#### Scenario: Detalle sin información privada

- **WHEN** se consulta cualquier detalle público
- **THEN** la respuesta no contiene `ownerId` ni claves de usuario o contacto

### Requirement: Presentación legible del detalle

La SPA SHALL mostrar en `/publications/:id` todos los campos públicos del detalle con etiquetas en español para tipo, categoría y estado. Las fechas MUST mostrarse en formato legible y conservar un valor de máquina en el atributo `datetime`. La vista MUST NOT mostrar `ownerId` ni datos de contacto.

#### Scenario: Detalle completo en la interfaz

- **WHEN** la consulta del detalle responde `200`
- **THEN** la vista muestra título, descripción, ubicación, tipo, categoría, estado activo, fecha del evento, fecha de creación, fecha de actualización e identificador

#### Scenario: Etiquetas y fechas legibles

- **WHEN** se presentan `type`, `category`, `status`, `eventDate`, `createdAt` y `updatedAt`
- **THEN** el tipo, la categoría y el estado usan etiquetas en español
- **AND** cada fecha muestra un texto legible y conserva su valor original en `datetime`

#### Scenario: Sin datos privados en la vista

- **WHEN** se renderiza el detalle
- **THEN** la vista no contiene `ownerId` ni datos de contacto del propietario

### Requirement: Navegación contextual entre listado y detalle

Cuando el detalle se abre desde `/publications`, la SPA SHALL conservar `q`, `type`, `category`, `eventDateFrom`, `eventDateTo`, `sort` y `page` como contexto de navegación. El enlace de regreso MUST volver a `/publications` con exactamente esos parámetros. Un acceso directo a `/publications/:id` sin contexto MUST volver a `/publications` sin parámetros agregados.

#### Scenario: Abrir el detalle desde resultados filtrados

- **WHEN** el usuario abre el detalle de un resultado con búsqueda, filtros, orden o página activos
- **THEN** el contexto de esos criterios se conserva en la navegación al detalle
- **AND** el enlace de regreso apunta a `/publications` con los mismos criterios

#### Scenario: Volver al listado con los criterios

- **WHEN** el usuario usa el enlace de regreso desde un detalle abierto con contexto
- **THEN** la SPA vuelve a `/publications` con los mismos `q`, `type`, `category`, `eventDateFrom`, `eventDateTo`, `sort` y `page`

#### Scenario: Acceso directo al detalle

- **WHEN** el usuario abre `/publications/:id` directamente sin contexto de listado
- **THEN** el enlace de regreso apunta a `/publications` sin parámetros agregados

### Requirement: Sin regresión de CU1–CU4

La incorporación de CU5 MUST conservar los endpoints, validaciones, filtros, orden, paginación y formularios de CU1–CU4. CU5 MUST NOT agregar migraciones ni modificar datos preexistentes. La verificación MUST comprobar que las filas de evidencia de los casos anteriores permanecen intactas.

#### Scenario: Regresión funcional de CU1–CU4

- **WHEN** se ejecutan las suites y verificaciones de CU1, CU2, CU3 y CU4 después de incorporar CU5
- **THEN** todas siguen en verde sin cambios de comportamiento

#### Scenario: Integridad de los datos de evidencia

- **WHEN** se ejecuta la verificación real de CU5
- **THEN** solo crea y elimina las filas que ella misma genera
- **AND** las filas preexistentes de CU1 y CU2 permanecen intactas
