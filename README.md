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

Con `DATABASE_URL`, la API usa PostgreSQL/Drizzle y reserva inventario dentro de la misma
transacción que crea el pedido. Sin esa variable usa memoria para demo y pruebas; reiniciar
restablece pedidos y stock. El panel inicia sesión en `/ingresar`.

Para salir de demo, seguir `docs/CHECKLIST_LANZAMIENTO.md`: secretos, Postgres, CORS,
`DEMO_MODE=false` y el orden de despliegue en Railway, Fly o un VPS. El historial de
fases está en `docs/CHANGELOG_MEJORAS.md`.

## PostgreSQL y seed

```bash
docker compose up -d postgres redis
copy .env.example .env
pnpm db:push
pnpm db:seed
pnpm db:migrate
```

La migración RLS aditiva y sus instrucciones están en `docs/RLS.md`.
El seed crea el usuario local `admin@arepa.test` para `arepa-express`; no usar esas
credenciales fuera de desarrollo.

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
pnpm test:e2e
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

Usa JWT Bearer obtenido en `/v1/auth/login`. Las automatizaciones pueden usar `X-API-Key`
por tenant con scopes; las claves solo se almacenan como hash.

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

- Sin `DATABASE_URL`, o con `DEMO_MODE=true`, pedidos, sesiones y catálogo viven en memoria.
- Redis/BullMQ, expiración automática, outbox y reintentos del worker siguen como puntos de entrada.
- WhatsApp Cloud, geocodificación, mapa e importación con IA siguen en mock.
- Wompi es un stub con flag: firma HMAC local e idempotencia persistida, sin checkout real.
- Zonas, promos, clientes e importación del panel siguen siendo pantallas de apoyo, no CRUD completo.
- CI aplica RLS, pero el rol de PostgreSQL del workflow es superusuario y no demuestra `FORCE RLS`.
- La cola offline reintenta al volver `online`; Background Sync del service worker queda pendiente.

Estas brechas están explicitadas para no confundir el MVP ejecutable con una puesta en
producción que maneje dinero y datos reales.
