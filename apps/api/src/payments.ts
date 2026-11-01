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
}

export class MockPaymentProvider implements PaymentProvider {
  async createPayment(request: PaymentRequest) {
    return { providerId: `mock:${request.orderId}`, status: "approved" as const };
  }
  async getStatus() { return "approved" as const; }
}

export class WompiPaymentProvider implements PaymentProvider {
  async createPayment(): Promise<never> {
    throw new Error("PROVEEDOR_PAGOS_NO_CONFIGURADO");
  }
  async getStatus(): Promise<never> {
    throw new Error("PROVEEDOR_PAGOS_NO_CONFIGURADO");
  }
}
