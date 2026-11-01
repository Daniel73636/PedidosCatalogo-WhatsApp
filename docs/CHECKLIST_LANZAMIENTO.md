# Checklist de lanzamiento

Lista para salir de demo. El detalle de cada decisión está en `docs/DECISIONES.md`. No pegar secretos en el repositorio, en issues ni en el build log.

## 1. Secretos y variables

Copiar `.env.example` solo como plantilla. En el entorno real:

| Variable | Producción |
| --- | --- |
| `NODE_ENV` | `production` |
| `DEMO_MODE` | `false`. Con `true` la API ignora Postgres y vuelve a memoria, aunque exista `DATABASE_URL`. |
| `DEMO_ADMIN_KEY` | No definirla. Solo es obligatoria si `DEMO_MODE=true`. |
| `JWT_SECRET` | Aleatorio de al menos 32 caracteres. La API rechaza el valor de desarrollo `desarrollo-solamente-cambiar-esta-clave`. Tampoco sirve el texto de ejemplo. |
| `DATABASE_URL` | URL del rol de aplicación, con TLS si el proveedor lo exige. |
| `WEB_ORIGIN` | Origen HTTPS exacto de la web. Varios orígenes se separan con coma, sin espacios sobrantes. No hay comodín. |
| `API_PORT` | Puerto en el que escucha Fastify (`0.0.0.0`). No lee `PORT`; en Railway hay que arrancar con `API_PORT=$PORT`. |
| `NEXT_PUBLIC_API_URL` | URL pública de la API. Next la incrusta en el build, no en el arranque. |
| `NEXT_PUBLIC_SITE_URL` | URL pública de la web, usada como `metadataBase` y Open Graph. También es de build. |
| `PAYMENTS_PROVIDER` | `mock` hasta reemplazar el stub. `wompi` exige `WOMPI_PUBLIC_KEY`. |
| `PAYMENT_WEBHOOK_ENABLED` | `false` hasta tener la firma real de Wompi. |
| `WOMPI_PUBLIC_KEY` / `WOMPI_WEBHOOK_SECRET` | Vacíos mientras el flag esté apagado. El secreto, si se usa el stub, debe tener al menos 16 caracteres. |
| `WHATSAPP_CLOUD_ENABLED` | `false`. El cliente Cloud existe, pero el servidor de pedidos sigue registrando el mock. |
| `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_ACCESS_TOKEN` | Reservados para cuando el servidor llame a `createWhatsAppClient`. |
| `API_KEYS` | Opcional. Formato `tenant-uuid:sha256-de-la-clave:orders:read\|orders:write`. Varias claves, separadas por coma. |
| `REDIS_URL` / `WORKER_INTERVAL_MS` | El worker solo registra un barrido simulado. No hace falta Redis para cobrar o tomar pedidos. |

Comprobar al arrancar que no aparece `CONFIGURACION_INVALIDA` y que `GET /ready` responde `orderRepository: postgres`.

## 2. PostgreSQL

1. Postgres 16. Un rol propietario para migrar y otro de aplicación sin `BYPASSRLS` y sin ser superusuario.
2. Con el rol propietario y `DATABASE_URL` apuntando a ese rol:

   ```bash
   pnpm db:push
   pnpm db:migrate
   ```

3. `pnpm db:seed` crea Arepa Express y `admin@arepa.test` / `Cambiar123!`. Sirve para staging. En la base que verán clientes, no dejar esa contraseña: sustituir el hash o crear otro dueño y desactivar el usuario de seed.
4. `DATABASE_URL` del proceso API debe ser el rol de aplicación. `docs/RLS.md` describe `SET LOCAL app.tenant_id`.
5. No publicar el puerto 5432. Copias de seguridad cifradas y un encargado identificado para ese hosting.

## 3. CORS, cookies y HTTPS

- La web y la API van por HTTPS. El refresh es cookie `HttpOnly`, `SameSite=Strict` y `Secure` cuando `NODE_ENV=production`, con path `/v1/auth`.
- El navegador solo la envía si la web y la API comparten sitio, por ejemplo `tienda.ejemplo.com` y `api.tienda.ejemplo.com`.
- `WEB_ORIGIN` tiene que coincidir con el origen desde el que el panel llama a la API, esquema y puerto incluidos.
- El cliente guarda el access token en `localStorage`. No poner secretos de servidor en variables `NEXT_PUBLIC_`.

## 4. Meta / WhatsApp

Antes de activar mensajes reales:

1. Cuenta de Meta Business, app de WhatsApp y número verificado.
2. Plantillas en `es_CO` aprobadas para recibido, estados y seguimiento.
3. Opt-in del cliente ya cubierto por el consentimiento del checkout. No usar el canal para publicidad.
4. Guardar el token de Cloud API solo en el gestor de secretos del hosting.
5. Dejar `WHATSAPP_CLOUD_ENABLED=false` hasta que `apps/api` deje de usar el mock interno y llame a `createWhatsAppClient`. Activar la variable hoy no envía mensajes de pedido.

## 5. Wompi

- Efectivo y transferencia siguen disponibles sin pasarela.
- El stub firma el JSON con HMAC-SHA256 y exige la cabecera `x-event-checksum`. No es el checksum de producción de Wompi.
- Los eventos se deduplican en `payment_webhook_events` por `(provider, provider_event_id)`.
- No poner `PAYMENTS_PROVIDER=wompi` ni `PAYMENT_WEBHOOK_ENABLED=true` en el lanzamiento con dinero real.

## 6. Dónde desplegar

La imagen (`Dockerfile`) construye el monorepo y arranca la API con `node apps/api/dist/server.js`. La web es otro proceso: `pnpm --filter @pedidos/web start` (puerto 3000). Exportar `NEXT_PUBLIC_API_URL` y `NEXT_PUBLIC_SITE_URL` antes de `pnpm build`; el Dockerfile todavía no recibe esas variables como `ARG`, así que un `docker build` sin cambiarlo deja la web apuntando a localhost.

### Railway

1. Plugin Postgres 16 y su `DATABASE_URL`.
2. Servicio API desde este repo. Start: `API_PORT=$PORT node apps/api/dist/server.js`. Variables de la sección 1, con `DEMO_MODE=false`.
3. Servicio web con el mismo repo, build después de fijar `NEXT_PUBLIC_*`, start `pnpm --filter @pedidos/web start`.
4. Migrar con el rol propietario desde un one-off, no con el rol de la API.
5. Healthcheck de la API: `GET /health`. Listo: `GET /ready`.

### Fly.io

1. App de API que escuche en `API_PORT` (8080 si así se configura `internal_port`) y otra app, o proceso, para Next.
2. Postgres de Fly o externo. La URL de la app de API es la del rol sin `BYPASSRLS`.
3. Secretos con `fly secrets set`. No incluir `.env` en la imagen.
4. Mismo orden: migrar como propietario, arrancar API con `DEMO_MODE=false`, construir la web con las URL públicas.

### VPS

1. Node 22, pnpm 9.15.0, Postgres 16 solo en localhost o red privada.
2. Caddy o nginx con TLS para la web y la API.
3. `pnpm install --frozen-lockfile`, exportar `NEXT_PUBLIC_*`, `pnpm build`, migrar, y dos procesos (`node apps/api/dist/server.js` y `pnpm --filter @pedidos/web start`) bajo systemd o el `docker-compose.yml` con secretos reales y sin publicar 5432.
4. El compose de desarrollo usa un `JWT_SECRET` de ejemplo y el usuario `pedidos` superusuario. No reutilizarlo tal cual.

## 7. Salida

- [ ] `DEMO_MODE=false` y `GET /ready` dice `postgres`
- [ ] Login del dueño real en `/ingresar`; el usuario seed no entra
- [ ] Pedido de prueba en efectivo, visible en cocina, y CSV de reportes
- [ ] Origen de la web permitido y cookie de refresh solo por HTTPS
- [ ] WhatsApp y Wompi siguen apagados, o su integración real ya reemplazó al mock
- [ ] Responsable, canal de habeas data, retención y encargados anotados (`docs/PRIVACIDAD.md`)
