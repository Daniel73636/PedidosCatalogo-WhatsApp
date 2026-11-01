import { afterEach, describe, expect, it } from "vitest";
import { orders, type DemoOrder } from "./data.js";
import { MemoryOrderRepository } from "./repository.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const otherTenant = "22222222-2222-4222-8222-222222222222";

const sample = (id: string, currentTenant: string, phone: string): DemoOrder => {
  const now = new Date().toISOString();
  return {
    id, tenantId: currentTenant, token: id, number: 1, status: "new", version: 1,
    customer: { name: "Ana", phone, privacyConsent: true, privacyPolicyVersion: "2026-11-01" },
    cart: { items: [], fulfillment: "pickup" },
    quote: {
      currency: "COP", lines: [], subtotalCents: 0, taxCents: 0, deliveryFeeCents: 0,
      discountCents: 0, tipCents: 0, totalCents: 0, warnings: [], errors: [],
    },
    paymentMethod: "cash", createdAt: now, updatedAt: now,
    events: [{ from: null, to: "new", actor: "cliente", at: now }],
  };
};

describe("repositorio en memoria", () => {
  const repository = new MemoryOrderRepository();
  afterEach(() => orders.clear());

  it("deduplica webhooks y guarda el estado de pago del tenant", async () => {
    orders.set("pay-1", sample("pay-1", tenantId, "+573001110000"));
    expect(await repository.claimPaymentWebhook(tenantId, "wompi", "evt-1", { status: "APPROVED" })).toBe(true);
    expect(await repository.claimPaymentWebhook(tenantId, "wompi", "evt-1", { status: "APPROVED" })).toBe(false);
    expect(await repository.setPaymentStatus(tenantId, "pay-1", "paid")).toBe(true);
    expect(await repository.setPaymentStatus(otherTenant, "pay-1", "declined")).toBe(false);
    expect(orders.get("pay-1")?.paymentStatus).toBe("paid");
  });

  it("no exporta ni anonimiza clientes de otro tenant", async () => {
    orders.set("a", sample("a", tenantId, "+573001110001"));
    orders.set("b", sample("b", otherTenant, "+573001110001"));
    expect((await repository.exportCustomer(tenantId, "+573001110001")).orders).toHaveLength(1);
    expect(await repository.deleteCustomer(tenantId, "+573001110001")).toBe(true);
    expect(orders.get("b")?.customer.name).toBe("Ana");
    expect((await repository.exportCustomer(otherTenant, "+573001110001")).customer?.name).toBe("Ana");
  });
});
