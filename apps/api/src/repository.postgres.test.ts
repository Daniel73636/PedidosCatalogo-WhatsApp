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
});
