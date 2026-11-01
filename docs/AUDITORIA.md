# Auditoría de producción

Fecha: 2026-11-01. Rama: `feat/mejora-produccion-ux`.

## Baseline

- `pnpm install`: correcto.
- `pnpm test`: correcto; inicialmente solo 6 pruebas reales, todas en `domain-pricing`.
- `pnpm typecheck`: correcto.
- `pnpm build`: compilación de TypeScript correcta; Next.js llegó a recolección de páginas y requirió validación posterior por exceder el tiempo inicial.

## P0 — bloqueadores

- Clave administrativa global, conocida y expuesta al navegador. **Corregido:** JWT corto, refresh HttpOnly, usuarios/RBAC por tenant y API keys con hash/scopes; demo solo bajo `DEMO_MODE=true`.
- API en memoria sin transacciones ni garantías entre procesos. **Pendiente:** conectar repositorio PostgreSQL y transacciones con bloqueo de stock.
- Aislamiento de tenant no demostrable. **Parcial:** principal ligado al tenant y pruebas negativas; falta RLS PostgreSQL y migración completa de todas las tablas relacionadas.
- Sin consentimiento ni derechos de titulares. **Corregido en API/demo:** consentimiento versionado, exportación y anonimización. Falta flujo de verificación de identidad y política jurídica aprobada.

## P1 — alta prioridad

- Configuración no validada, CORS abierto y readiness inexistente. **Corregido.**
- Rate limiting genérico. **Corregido** con límites específicos para login, cotización y creación.
- Idempotencia no incluía tenant y no tenía pruebas. **Corregido** y probado.
- Sin abstracción de pagos ni canal WhatsApp real controlado. **Corregido:** interfaces, mock por defecto y stubs/flags.
- Sin CI. **Corregido** con instalación congelada, pruebas, tipos y build.
- Cobertura de API prácticamente nula. **Mejorada**, aún faltan E2E y PostgreSQL.

## P2 — plan

1. Repositorio Drizzle transaccional, migraciones, RLS y pruebas con PostgreSQL real.
2. Redis distribuido para rate limits, idempotencia, sesiones revocadas, colas/outbox y SSE.
3. CSRF para endpoints basados en cookie; rotación administrable de API keys y refresh tokens persistentes.
4. Wompi completo: firma, webhooks idempotentes, conciliación y sandbox.
5. Verificación de identidad para exportar/eliminar datos; retención y borrado de backups.
6. Playwright, accesibilidad WCAG, observabilidad, alertas, SLO, backups y recuperación.
7. Wake Lock/sonido de cocina y estados vacíos/carga/error consistentes.

## Riesgo residual

La aplicación mejoró su frontera HTTP, pero **no debe considerarse lista para manejar dinero o datos reales** mientras el repositorio de pedidos y stock siga siendo memoria de un solo proceso.
