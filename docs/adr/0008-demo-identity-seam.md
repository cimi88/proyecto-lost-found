# ADR 0008: Identidad local de demostración para CU1

- **Estado:** Aceptado
- **Fecha:** 2026-11-05

## Contexto

El CU1 necesita persistir publicaciones reales en PostgreSQL y asociarlas a un
usuario antes de que exista la autenticación JWT RS256. La alternativa de
bloquear el CU1 hasta implementar JWT retrasa la verificación vertical completa;
la alternativa de aceptar un `ownerId` desde el cuerpo de la petición permitiría
que cualquier cliente eligiera el dueño de la publicación.

## Decisión

Se incorpora una costura de identidad temporal, aislada y reemplazable:

- El cliente envía el encabezado `X-Demo-User-Id` con el UUID de un usuario
  existente.
- El backend lo resuelve mediante `DemoIdentityResolver`, registrado detrás del
  token de inyección `CURRENT_USER_RESOLVER`. El controlador solo conoce
  `@CurrentUser()`; no lee el encabezado.
- La migración inicial siembra de forma idempotente un usuario de demostración.
- La variable `AUTH_MODE` acepta `demo` o `jwt`. Su valor por defecto es `demo`
  fuera de producción.
- `validateRuntimeEnv` rechaza el arranque cuando `NODE_ENV=production` y
  `AUTH_MODE=demo`. El frontend de producción no agrega el encabezado.
- La integración JWT reemplaza únicamente el proveedor de
  `CURRENT_USER_RESOLVER`; el resto del dominio no cambia.

## Salvaguardas

- El encabezado **no es autenticación**: no verifica identidad, no aporta
  confidencialidad y no implementa autorización real.
- No se usa en producción: el backend falla al arrancar y el frontend de
  producción desactiva el interceptor.
- No se persisten contraseñas, tokens ni secretos en el repositorio.
- El usuario demo solo puede operar sobre sus propias publicaciones mediante las
  reglas del dominio.

## Consecuencias

- El CU1 puede verificarse de punta a punta sin adelantar la autenticación.
- La deuda es explícita y acotada: una sola costura de resolución de identidad.
- Cualquier despliegue con `AUTH_MODE=demo` en producción es un error de
  configuración detectado al arrancar, no un modo soportado.
- Las pruebas de identidad demo y el script de verificación deben ejecutarse solo
  contra la base local.
