import { randomBytes, randomUUID } from "node:crypto";
import { createDb, products } from "@pedidos/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { quote } from "@pedidos/domain-pricing";
import { PostgresOrderRepository } from "./repository.js";
import type { DemoOrder } from "./data.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres("PostgresOrderRepository", () => {
  const repository = databaseUrl ? new PostgresOrderRepository(databaseUrl) : undefined;
  const direct = databaseUrl ? createDb(databaseUrl) : undefined;
  const tenantId = "11111111-1111-4111-8111-111111111111";
  const productId = "55555555-5555-4555-8555-555555555555";

  beforeAll(async () => {
    await direct!.db.update(products).set({ stockQty: "30" }).where(eq(products.id, productId));
  });
  afterAll(async () => {
    await repository!.close();
    await direct!.close();
  });

  it("reserva stock atómicamente entre solicitudes concurrentes", async () => {
    const context = await repository!.storeBySlug("arepa-express");
    expect(context).toBeDefined();
    const cart = { fulfillment: "pickup" as const, items: [{ productId, quantity: 1 }] };
    const calculated = quote(cart, context!.catalog, context!.store);
    const makeOrder = (index: number): DemoOrder => {
      const now = new Date().toISOString();
      return {
        id: randomUUID(), tenantId, token: randomBytes(24).toString("base64url"), number: 0,
        status: "new", version: 1,
        customer: { name: `Cliente ${index}`, phone: `+5730011${String(index).padStart(4, "0")}`, privacyConsent: true, privacyPolicyVersion: "2026-11-01" },
        cart, quote: calculated, paymentMethod: "cash", createdAt: now, updatedAt: now,
        events: [{ from: null, to: "new", actor: "cliente", at: now }],
      };
    };
    const results = await Promise.allSettled(Array.from({ length: 31 }, (_, index) =>
      repository!.create(makeOrder(index), `postgres-concurrency-${index}`)));
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(30);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const [product] = await direct!.db.select({ stockQty: products.stockQty }).from(products).where(eq(products.id, productId));
    expect(Number(product?.stockQty)).toBe(0);
  }, 20_000);

  it("persiste administración, privacidad e idempotencia de webhooks por tenant", async () => {
    const product = (await repository!.adminProducts(tenantId)).find(({ id }) => id === productId);
    expect(product).toBeDefined();
    expect((await repository!.updateProduct(tenantId, productId, { status: "sold_out" }))?.status).toBe("sold_out");
    await repository!.updateProduct(tenantId, productId, { status: "active" });

    await direct!.db.update(products).set({ stockQty: "2" }).where(eq(products.id, productId));
    const phone = "+573009991122";
    const now = new Date().toISOString();
    const cart = { fulfillment: "pickup" as const, items: [{ productId, quantity: 1 }] };
    const calculated = quote(cart, (await repository!.storeBySlug("arepa-express"))!.catalog, (await repository!.storeBySlug("arepa-express"))!.store);
    const created = await repository!.create({
      id: randomUUID(), tenantId, token: randomBytes(24).toString("base64url"), number: 0,
      status: "new", version: 1,
      customer: { name: "Cliente privacidad", phone, privacyConsent: true, privacyPolicyVersion: "2026-11-01" },
      cart, quote: calculated, paymentMethod: "transfer", createdAt: now, updatedAt: now,
      events: [{ from: null, to: "new", actor: "cliente", at: now }],
    }, "privacy-export-1");
    const exported = await repository!.exportCustomer(tenantId, phone);
    expect(exported.customer?.name).toBe("Cliente privacidad");
    expect(exported.orders).toHaveLength(1);
    expect(await repository!.setPaymentStatus(tenantId, created.order.id, "paid")).toBe(true);
    expect((await repository!.byId(tenantId, created.order.id))?.paymentStatus).toBe("paid");
    expect(await repository!.deleteCustomer(tenantId, phone)).toBe(true);
    expect((await repository!.exportCustomer(tenantId, phone)).customer).toBeUndefined();

    expect(await repository!.claimPaymentWebhook(tenantId, "wompi", "event-1", { status: "APPROVED" })).toBe(true);
    expect(await repository!.claimPaymentWebhook(tenantId, "wompi", "event-1", { status: "APPROVED" })).toBe(false);
  });
});
