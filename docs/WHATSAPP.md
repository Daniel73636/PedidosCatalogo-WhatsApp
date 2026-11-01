# WhatsApp

El proveedor por defecto es `MockWhatsAppClient`: enmascara el teléfono y no envía mensajes reales.

## Cloud API

Activar únicamente con secretos administrados por la plataforma:

```env
WHATSAPP_CLOUD_ENABLED=true
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_ACCESS_TOKEN=...
```

Antes de producción se deben aprobar plantillas `es_CO`, validar opt-in, registrar la versión del consentimiento, implementar reintentos con backoff/outbox y procesar webhooks de estado idempotentemente. Nunca registrar teléfonos, tokens ni cuerpos completos con datos personales.
