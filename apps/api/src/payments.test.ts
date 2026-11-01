import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { WompiPaymentProvider } from "./payments.js";

describe("WompiPaymentProvider", () => {
  it("crea intención pendiente y valida webhook firmado", async () => {
    const secret = "wompi-test-secret";
    const provider = new WompiPaymentProvider(secret, "pub_test_key");
    const intent = await provider.createPayment({
      tenantId: "11111111-1111-4111-8111-111111111111", orderId: "order-1",
      amountCents: 25_000, currency: "COP", idempotencyKey: "payment:order-1",
    });
    expect(intent.status).toBe("pending");
    const payload = {
      event: "transaction.updated", data: { transaction: { id: "tx-1", status: "APPROVED" } },
      meta: { tenantId: "11111111-1111-4111-8111-111111111111", orderId: "order-1" },
    };
    const signature = createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");
    expect(provider.parseWebhook(payload, signature)?.status).toBe("paid");
    expect(provider.parseWebhook(payload, "incorrecta")).toBeUndefined();
  });
});
