export interface WhatsAppMessage {
  tenantId: string;
  to: string;
  template: string;
  params: Record<string, string | number>;
  idempotencyKey: string;
}
export interface WhatsAppClient { send(message: WhatsAppMessage): Promise<{ id: string; status: "queued" }> }
export class MockWhatsAppClient implements WhatsAppClient {
  async send(message: WhatsAppMessage) {
    const safe = { ...message, to: `${message.to.slice(0, 3)}***${message.to.slice(-2)}` };
    console.log(JSON.stringify({ channel: "whatsapp", mock: true, ...safe }));
    return { id: `mock:${message.idempotencyKey}`, status: "queued" as const };
  }
}

export class CloudApiWhatsAppClient implements WhatsAppClient {
  constructor(private readonly phoneNumberId: string, private readonly accessToken: string) {}
  async send(message: WhatsAppMessage) {
    const response = await fetch(`https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp", to: message.to, type: "template",
        template: { name: message.template, language: { code: "es_CO" }, components: [] },
      }),
    });
    if (!response.ok) throw new Error(`WHATSAPP_CLOUD_ERROR:${response.status}`);
    const body = await response.json() as { messages?: { id: string }[] };
    return { id: body.messages?.[0]?.id ?? message.idempotencyKey, status: "queued" as const };
  }
}

export function createWhatsAppClient(env: Record<string, string | undefined>): WhatsAppClient {
  if (env.WHATSAPP_CLOUD_ENABLED !== "true") return new MockWhatsAppClient();
  if (!env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_ACCESS_TOKEN)
    throw new Error("WHATSAPP_CONFIGURACION_INCOMPLETA");
  return new CloudApiWhatsAppClient(env.WHATSAPP_PHONE_NUMBER_ID, env.WHATSAPP_ACCESS_TOKEN);
}
