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
