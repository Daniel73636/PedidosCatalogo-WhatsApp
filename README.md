# Pedidos y catálogo por WhatsApp

MVP multiplataforma para recibir pedidos directos sin comisiones. Incluye tienda pública,
carrito, cotización en servidor, checkout, seguimiento, tablero operativo, cocina, catálogo,
PWA instalable, API modular y modelo PostgreSQL con Drizzle.

## Requisitos

- Node.js 22 LTS
- pnpm 9.15.0
- Docker Desktop (opcional, para PostgreSQL y Redis)

## Inicio rápido (demo funcional)

```bash
pnpm install
pnpm dev
```

Abre:

- Tienda: http://localhost:3000/arepa-express
- Panel: http://localhost:3000/pedidos
- Cocina: http://localhost:3000/cocina
- API: http://localhost:4000/health

La API usa un repositorio en memoria para que el recorrido completo funcione sin
infraestructura. Reiniciar la API restablece pedidos y stock. La clave privada de demo es
`demo-admin-key`; en producción debe reemplazarse y nunca exponerse al navegador.

## PostgreSQL y seed

```bash
docker compose up -d postgres redis
copy .env.example .env
pnpm db:push
pnpm db:seed
```

El seed crea **Arepa Express** (`arepa-express`), categorías, productos, salsas y una
zona de entrega. El esquema Drizzle usa `tenant_id`, importes enteros en centavos,
precios congelados, eventos de pedido, reservas de stock y logs de WhatsApp.

Para ejecutar todo en contenedores:

```bash
docker compose up --build
```

## Pruebas y validación

```bash
pnpm test
pnpm typecheck
pnpm build
```

`packages/domain-pricing` contiene `quote()` puro y determinista. Las pruebas cubren
variantes, adicionales, impuestos incluidos, entrega gratis, cupones con tope, stock,
cobertura y la máquina de estados `transition()`.

## Arquitectura

```text
apps/
  api/       Fastify, rutas públicas/privadas, SSE, stock e idempotencia
  web/       Next.js 15 App Router, tienda, panel y PWA
  worker/    punto de entrada para expiraciones y colas
packages/
  contracts/ esquemas Zod compartidos
  db/        esquema Drizzle PostgreSQL y seed
  domain-pricing/ quote() y transition() puros
  ui/        destino del sistema de diseño compartido
  whatsapp/  interfaz y cliente mock
```

### API pública

- `GET /v1/public/:slug/menu`
- `POST /v1/public/:slug/quote`
- `POST /v1/public/:slug/coverage`
- `POST /v1/public/:slug/orders` (`Idempotency-Key` obligatorio)
- `GET /v1/public/orders/:token`
- `GET /v1/public/orders/:token/events`
- `POST /v1/public/orders/:token/proof`
- `POST /v1/public/:slug/cart-recovery`

### API privada

Usa `X-API-Key`.

- Pedidos, transición con versión optimista, domiciliario y pago
- Productos, categorías, agotado, zonas y cupones
- Estado de tienda, importación mock, reportes y logs WhatsApp
- `GET /v1/events` para cambios en vivo

## Decisiones de integridad

- Todo el dinero usa enteros en centavos.
- El servidor recalcula la cotización; responde `PRICE_CHANGED` si el cliente envía otro total.
- El stock se valida completo antes de reservar y se repone al rechazar, cancelar o expirar.
- `transition()` centraliza estados válidos y la API exige `version` para evitar sobrescrituras.
- Cada cambio crea un evento inmutable y un log de WhatsApp enmascarado.
- Los errores usan `application/problem+json`.

## PWA

El manifiesto y service worker permiten instalar la web en PC o Android. La carcasa y
la pantalla sin conexión quedan en caché. Para una instalación real se requiere HTTPS
(localhost está permitido durante desarrollo).

## Límites conocidos del MVP

- El recorrido demo de la API usa memoria; el esquema y seed PostgreSQL están listos,
  pero falta conectar un repositorio persistente/transaccional antes de producción.
- Redis/BullMQ, expiración automática, outbox y reintentos del worker están representados
  por puntos de entrada; falta cablearlos a colas reales.
- WhatsApp, comprobantes, pasarela, geocodificación, mapa e importación con IA son mocks.
- La clave del panel está expuesta solo para la demo; producción requiere sesiones HttpOnly,
  RBAC, CSRF y aislamiento RLS.
- Las pantallas secundarias del panel son esqueletos utilizables, no CRUD completos.
- Falta una suite E2E/Playwright, pruebas de concurrencia contra PostgreSQL y auditoría WCAG.

Estas brechas están explicitadas para no confundir el MVP ejecutable con una puesta en
producción que maneje dinero y datos reales.
