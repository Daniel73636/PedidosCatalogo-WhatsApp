# Decisiones de ingeniería — PedidosCatalogo

## 2026-11-01 — Auth

**Decisión:** Reemplazar `X-API-Key: demo-admin-key` global por usuarios por tenant (dueño/cajero/cocina/repartidor) con JWT de acceso corto + refresh cookie, y PIN de 4–6 dígitos hasheado para cocina/tablet. Las API keys, si existen, serán por tenant, con scopes y rotación.

## 2026-11-01 — Persistencia demo

**Decisión:** Mantener repositorio en memoria como fallback cuando no hay `DATABASE_URL`, pero el camino por defecto documentado es Postgres + Drizzle. Tests de aislamiento de tenants corren contra memoria y Postgres cuando esté disponible.

## 2026-11-01 — Pagos

**Decisión:** `PaymentProvider` con `MockPaymentProvider` y stub Wompi (`PAYMENTS_PROVIDER`). Transferencia con comprobante sigue disponible.
