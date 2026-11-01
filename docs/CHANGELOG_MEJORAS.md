# Changelog de mejoras

Registro de las fases 1 a 3 en `feat/mejora-produccion-ux`. Las decisiones largas están en `docs/DECISIONES.md`. El paso a producción está en `docs/CHECKLIST_LANZAMIENTO.md`.

## Fase 3 — crecimiento y cierre de memoria

- Usuarios, refresh sessions, API keys, catálogo administrativo, estado de tienda y derechos de privacidad usan PostgreSQL por tenant; memoria permanece únicamente en modo demo.
- RLS cubre directamente tablas hijas de catálogo y pedidos mediante `tenant_id` obligatorio.
- Wompi stub crea intenciones pendientes, valida firma de webhook y deduplica eventos persistidos; efectivo y transferencia continúan disponibles.
- El menú incluye compartir, QR generado localmente, metadatos Open Graph y URL canónica.
- Reportes muestran ventas por hora, productos destacados y exportan pedidos en CSV.
- La cola offline usa IndexedDB, reintenta todos los pendientes y conserva la misma `Idempotency-Key` al reconectar.

## Fase 2 — persistencia y experiencia operativa

- PostgreSQL/Drizzle es el repositorio predeterminado cuando existe `DATABASE_URL`; memoria queda para demo y pruebas.
- Creación de pedidos, idempotencia y reserva de inventario ocurren en una sola transacción. La actualización condicional evita sobreventa entre procesos.
- Migración aditiva con índices por tenant y políticas RLS basadas en `SET LOCAL app.tenant_id`.
- Cocina mantiene la pantalla activa con Wake Lock, ofrece sonido y vibración, y diferencia carga, vacío y error con acciones táctiles de al menos 44 px.
- Checkout muestra esqueletos, explica cambios de precio y conserva pedidos sin conexión con la misma `Idempotency-Key` hasta reintentar.
- Smoke E2E Playwright: menú público, cotización, creación y visibilidad en cocina.

## Fase 1 — seguridad y operación

- JWT de acceso, refresh cookie HttpOnly, bcrypt, RBAC y API keys por tenant con scopes.
- Aislamiento de tenant, CORS allowlist, Helmet, rate limiting, configuración Zod, `/health` y `/ready`.
- Pruebas de idempotencia, concurrencia de stock y propiedades de precios/transiciones.
- Abstracciones de pagos, mock y stub Wompi; WhatsApp mock por defecto y Cloud API bajo flag.
- Consentimiento versionado, exportación y anonimización de datos bajo Ley 1581.
- CI con pruebas, tipos, build, auditoría y E2E.

## Decisiones que ya quedaron cerradas

- Postgres es el camino con `DATABASE_URL` y `DEMO_MODE=false`. La memoria es demo y pruebas.
- El dinero va en centavos. El servidor recalcula el total y responde `PRICE_CHANGED` si no coincide.
- Stock, número de pedido e idempotencia comparten transacción. RLS exige `app.tenant_id` y un rol de aplicación sin `BYPASSRLS`.
- La sesión de panel es JWT corto más refresh `HttpOnly`. La clave global `demo-admin-key` solo existe con `DEMO_MODE=true`.
- Efectivo y transferencia no dependen de Wompi. El webhook stub es HMAC del JSON, no el checksum de Wompi.
- La cola offline vive en IndexedDB. WhatsApp de pedidos sigue en mock dentro de la API.

## Pendiente antes de dinero y datos reales

- Checksum y checkout de Wompi de producción.
- Conectar `createWhatsAppClient` en la API. El flag Cloud no envía los mensajes de pedido.
- Rol de CI y de producción sin `BYPASSRLS`, comprobado en staging.
- Background Sync, Redis/BullMQ, expiración real de pedidos y CRUD de zonas, promos y clientes.
- Cupones de Postgres sin mínimo ni tope. El seed no carga `AREPA10`.
- Responsable, retención, backups y contratos con encargados (`docs/PRIVACIDAD.md`).

## Compatibilidad

Los entornos sin `DATABASE_URL` conservan el recorrido en memoria. Para forzar demo aun si existe una URL, usar `DEMO_MODE=true` junto con `DEMO_ADMIN_KEY`.

## Pasos manuales para Daniel

1. Esperar el CI de este commit de documentación. El de `f4ffc7f` ya está verde.
2. Seguir `docs/CHECKLIST_LANZAMIENTO.md` en el hosting elegido (Railway, Fly o VPS).
3. Generar `JWT_SECRET`, dejar `DEMO_MODE=false` y apuntar `DATABASE_URL` al rol de aplicación.
4. Migrar con el rol propietario (`pnpm db:push` y `pnpm db:migrate`). No publicar `admin@arepa.test` / `Cambiar123!`.
5. Construir la web con `NEXT_PUBLIC_API_URL` y `NEXT_PUBLIC_SITE_URL` ya definidos. El `Dockerfile` todavía no los recibe como `ARG`.
6. Fijar `WEB_ORIGIN` al origen HTTPS de la web y comprobar login, un pedido en efectivo y `GET /ready`.
7. Dejar WhatsApp Cloud y el webhook Wompi apagados hasta reemplazar el mock y el stub.
8. Anotar responsable y canal de habeas data antes de abrir la tienda al público.
