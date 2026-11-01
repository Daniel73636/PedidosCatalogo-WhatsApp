import { createHmac, timingSafeEqual } from "node:crypto";

export interface PaymentRequest {
  tenantId: string;
  orderId: string;
  amountCents: number;
  currency: "COP";
  idempotencyKey: string;
}

export interface PaymentProvider {
  createPayment(request: PaymentRequest): Promise<{ providerId: string; status: "pending" | "approved" }>;
  getStatus(providerId: string): Promise<"pending" | "approved" | "declined">;
  parseWebhook(payload: unknown, signature?: string): PaymentWebhookEvent | undefined;
}
export interface PaymentWebhookEvent {
  id: string;
  tenantId: string;
  orderId: string;
  status: "pending" | "paid" | "declined" | "refunded";
  raw: object;
}

export class MockPaymentProvider implements PaymentProvider {
  async createPayment(request: PaymentRequest) {
    return { providerId: `mock:${request.orderId}`, status: "approved" as const };
  }
  async getStatus() { return "approved" as const; }
  parseWebhook(payload: unknown) {
    const event = payload as Partial<PaymentWebhookEvent>;
    return event.id && event.tenantId && event.orderId && event.status
      ? { id: event.id, tenantId: event.tenantId, orderId: event.orderId, status: event.status, raw: payload as object }
      : undefined;
  }
}

export class WompiPaymentProvider implements PaymentProvider {
  constructor(private readonly webhookSecret?: string, private readonly publicKey?: string) {}
  async createPayment(request: PaymentRequest) {
    if (!this.publicKey) throw new Error("PROVEEDOR_PAGOS_NO_CONFIGURADO");
    return { providerId: `wompi:stub:${request.orderId}`, status: "pending" as const };
  }
  async getStatus(providerId: string) {
    if (!providerId.startsWith("wompi:")) throw new Error("REFERENCIA_PAGO_INVALIDA");
    return "pending" as const;
  }
  parseWebhook(payload: unknown, signature?: string) {
    if (!this.webhookSecret || !signature) return undefined;
    const serialized = JSON.stringify(payload);
    const expected = createHmac("sha256", this.webhookSecret).update(serialized).digest("hex");
    const actual = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actual.length !== expectedBuffer.length || !timingSafeEqual(actual, expectedBuffer)) return undefined;
    const source = payload as {
      event?: string; data?: { transaction?: { id?: string; reference?: string; status?: string } };
      meta?: { tenantId?: string; orderId?: string };
    };
    const transaction = source.data?.transaction;
    if (!transaction?.id || !source.meta?.tenantId || !source.meta.orderId) return undefined;
    const statuses: Record<string, PaymentWebhookEvent["status"]> = {
      APPROVED: "paid", DECLINED: "declined", ERROR: "declined", VOIDED: "refunded", PENDING: "pending",
    };
    return {
      id: `${source.event ?? "transaction.updated"}:${transaction.id}`,
      tenantId: source.meta.tenantId, orderId: source.meta.orderId,
      status: statuses[transaction.status ?? ""] ?? "pending", raw: payload as object,
    };
  }
}
