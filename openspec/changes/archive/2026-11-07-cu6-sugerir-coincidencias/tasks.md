# Tasks

## 1. Configuración y persistencia

- [x] 1.1 Crear configuración tipada del matching con defaults ADR: `0.15` trigram, 500 candidatas, pesos `0.50/0.20/0.15/0.15`, umbral `0.55`, máximo 10 y ventana de fecha 30 días; validar rangos y suma de pesos. Verificación: tests de configuración cubren defaults, límites e inputs inválidos.
- [x] 1.2 Crear una migración TypeORM reversible que añada `search_text` generado/normalizado y su índice GIN `gin_trgm_ops`, además de `publication_matches` con FK, pareja única, estados válidos, score acotado e índices por ambos lados. Verificación: tests de migración y `db:show` confirman que es aditiva, reversible y no altera las migraciones anteriores.
- [x] 1.3 Mapear `search_text` y `PublicationMatch` en entidades TypeORM con `synchronize: false`. Verificación: build del backend y pruebas de metadata/entity verifican los nombres y columnas esperados.

## 2. Motor determinístico y API

- [x] 2.1 Implementar el prefiltro candidato en PostgreSQL: `ACTIVE`, tipo opuesto, distinto ID, operador `%`, umbral local a transacción y límite/orden de 500 candidatos. Verificación: unit tests afirman SQL/params, exclusiones y orden estable; el GIN de `search_text` aparece en la migración.
- [x] 2.2 Implementar en NestJS las señales elegidas: máximo trigram de las cuatro comparaciones título/descripción, categoría exacta 1/0, decaimiento lineal de fecha a 30 días, similitud trigram de ubicación y suma ponderada. Verificación: unit tests cubren cada componente, diferencias de fecha 0/30/31 días, score límite `0.55`, redondeo y desempates.
- [x] 2.3 Integrar la generación de `SUGGESTED` con la transacción de alta LOST/FOUND sin cambiar requests ni responses CU1/CU2. Verificación: unit/E2E confirman parejas canónicas, unicidad, rollback ante fallo de matching, respuesta de registro idéntica y que `CONFIRMED`/`DISMISSED` no se reabren.
- [x] 2.4 Implementar `matches:backfill` idempotente para publicaciones `ACTIVE` existentes usando el mismo MatchingService y paginación. Verificación: ejecutarlo dos veces en tests de integración mantiene una sola pareja por LOST/FOUND y no altera publicaciones ni estados previos.
- [x] 2.5 Exponer `GET /api/v1/publications/:id/matches` como lectura pública con UUID validado, solo pares sugeridos con ambos lados `ACTIVE`, máximo 10, score y desglose sin datos privados. Verificación: E2E comprueba 200 con y sin resultados, orden, 400 UUID inválido, 404 origen inexistente/no activo, exclusión de candidatas inactivas y ausencia de `ownerId`.
- [x] 2.6 Documentar el endpoint, el backfill y el contrato de errores en `backend/README.md`. Verificación: ejemplos/respuestas y comandos documentados coinciden con el controlador y `package.json`.

## 3. Contrato y documentación de dominio

- [x] 3.1 Crear `contracts/v1/publication-matching.ts` con tipos para respuesta, candidata pública, score breakdown y valores de estado; sincronizar los tipos usados por frontend y backend. Verificación: tests de contrato comprueban shape, enumeraciones y ausencia de `ownerId`.
- [x] 3.2 Actualizar ADR 0005, `docs/domain-model.md` y `docs/architecture.md` con la subfórmula seleccionada, columna/index, persistencia/backfill, endpoint y límites; no cambiar los pesos/estados aprobados. Verificación: documentos describen los defaults y comportamiento que cubren los tests.
- [x] 3.3 Actualizar `contracts/v1/README.md` con `GET /api/v1/publications/:id/matches` y la respuesta pública. Verificación: rutas, tipos y errores documentados coinciden con el contrato manual.

## 4. Experiencia Angular

- [x] 4.1 Agregar modelos y `PublicationMatchingService` para consultar `/publications/:id/matches`. Verificación: service specs afirman URL, método, parsing de score breakdown y manejo de errores.
- [x] 4.2 Integrar en `PublicationDetailPageComponent` una sección de coincidencias con cards responsivas, tipo, título, categoría, ubicación, fecha, score porcentual, motivos y enlace al detalle; mantener el detalle principal ante errores de matching. Verificación: component specs comprueban datos, navegación y ausencia de datos privados.
- [x] 4.3 Cubrir carga, error/reintento local a la sección, cero coincidencias y matches; mantener accesibilidad y copy consistente con CU5. Verificación: component specs cubren los cuatro estados y los motivos de coincidencia.
- [x] 4.4 Actualizar `frontend/README.md` con acceso a sugerencias y su explicación. Verificación: rutas/estados documentados coinciden con la implementación.

## 5. Verificación e integración

- [x] 5.1 Ejecutar pruebas unitarias/E2E y build de backend. Verificación: suites completas pasan, incluido matching, privacidad, persistencia e idempotencia.
- [x] 5.2 Ejecutar pruebas frontend y build. Verificación: Vitest y Angular build terminan en verde.
- [x] 5.3 Crear y ejecutar `scripts/verify-cu6.ps1` / `verify:cu6` para migración, generación, consulta y backfill en PostgreSQL real; limpiar solo coincidencias/publicaciones propias por IDs exactos y comprobar integridad de evidencias anteriores. Verificación: cada fase reporta PASS, migración CU6 figura aplicada y no quedan filas propias.
- [x] 5.4 Ejecutar regresiones CU1–CU5: `verify:cu1` a `verify:cu4`, suites E2E/unitarias del detalle CU5 y pruebas frontend CU5. Verificación: todos los contratos anteriores siguen pasando; las evidencias CU1/CU2 se conservan.
- [x] 5.5 Verificar el flujo real de navegador: abrir detalle LOST y FOUND, ver sugerencias cruzadas y motivos, probar estado vacío, seguir al detalle de candidata y confirmar que nada privado se renderiza. Verificación: guardar resultado y consola sin errores en ODD.
- [x] 5.6 Ejecutar `openspec validate cu6-sugerir-coincidencias --strict`. Verificación: delta `publication-matching` pasa sin advertencias estrictas.
- [x] 5.7 Completar `odd/tasks/cu6-sugerir-coincidencias.md` con resultados reales, archivos, migración y decisiones finales; no declarar verificaciones no ejecutadas. Verificación: ODD refleja el estado implementado y validado.

## Workflow follow-up

- Archivar CU6 y sincronizar `publication-matching` en `openspec/specs/` solamente después de la revisión y autorización explícita del usuario.
- No iniciar CU7 ni realizar commits/push sin autorización explícita.
