# Decisiones de ingeniería — PedidosCatalogo

## 2026-11-01 — Auth

**Decisión:** Reemplazar `X-API-Key: demo-admin-key` global por usuarios por tenant (dueño/cajero/cocina/repartidor) con JWT de acceso corto + refresh cookie, y PIN de 4–6 dígitos hasheado para cocina/tablet. Las API keys, si existen, serán por tenant, con scopes y rotación.

## 2026-11-01 — Persistencia demo

**Decisión:** Mantener repositorio en memoria como fallback cuando no hay `DATABASE_URL`, pero el camino por defecto documentado es Postgres + Drizzle. Tests de aislamiento de tenants corren contra memoria y Postgres cuando esté disponible.

## 2026-11-01 — Pagos

**Decisión:** `PaymentProvider` con `MockPaymentProvider` y stub Wompi (`PAYMENTS_PROVIDER`). Transferencia con comprobante sigue disponible.

## 2026-11-01 — Frontera HTTP y secretos

**Decisión:** validar configuración al arrancar, usar allowlist CORS, Helmet, límites específicos y códigos de error estables en español. Ningún secreto administrativo se compila en la web; `DEMO_MODE` es opt-in explícito.

## 2026-11-01 — Privacidad

**Decisión:** consentimiento explícito y versionado al crear pedidos. Exportación y anonimización se restringen al tenant autenticado. La verificación de identidad y retención formal son bloqueadores antes de producción.

## 2026-11-01 — Riesgo transaccional

**Decisión:** la reserva en memoria se prueba contra concurrencia dentro de un proceso, pero no se presenta como garantía productiva. PostgreSQL con transacción y bloqueo condicional es P0 pendiente.

## 2026-11-01 — Repositorio PostgreSQL y RLS

**Decisión:** `DATABASE_URL` selecciona PostgreSQL por defecto; memoria queda para demo/pruebas. Pedido, idempotencia, numeración y reserva de stock comparten transacción. Un advisory lock por tenant serializa numeración/idempotencia y el `UPDATE ... WHERE stock_qty >= cantidad` evita sobreventa. RLS usa contexto local a la transacción; el rol de aplicación no debe tener `BYPASSRLS`.
