# Changelog de mejoras

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

## Compatibilidad

Los entornos sin `DATABASE_URL` conservan el recorrido en memoria. Para forzar demo aun si existe una URL, usar `DEMO_MODE=true` junto con `DEMO_ADMIN_KEY`.
