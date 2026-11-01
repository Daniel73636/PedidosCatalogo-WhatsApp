import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { catalog, idempotency, orders } from "./data.js";

const otherKey = "tenant-b-secret-key";
process.env.API_KEYS = `22222222-2222-4222-8222-222222222222:${createHash("sha256").update(otherKey).digest("hex")}:orders:read`;
process.env.JWT_SECRET = "test-secret-with-at-least-thirty-two-characters";

let app: Awaited<typeof import("./server.js")>["app"];

beforeAll(async () => {
  ({ app } = await import("./server.js"));
  await app.ready();
});
beforeEach(() => {
  orders.clear();
  idempotency.clear();
  for (const product of catalog.products) {
    if (product.id === "reina-pepiada") product.stockQty = 30;
  }
});
afterAll(async () => app.close());

const orderPayload = {
  cart: { items: [{ productId: "reina-pepiada", quantity: 1 }], fulfillment: "pickup" },
  expectedTotalCents: 1_800_000,
  customer: {
    name: "Daniel Prueba", phone: "+573001112233",
    privacyConsent: true, privacyPolicyVersion: "2026-11-01",
  },
  paymentMethod: "cash",
};

describe("seguridad multi-tenant", () => {
  it("autentica con JWT y rechaza una API key de otro tenant", async () => {
    const login = await app.inject({
      method: "POST", url: "/v1/auth/login",
      payload: { email: "admin@arepa.test", password: "Cambiar123!" },
    });
    expect(login.statusCode).toBe(200);
    const accessToken = login.json<{ accessToken: string }>().accessToken;
    expect((await app.inject({ method: "GET", url: "/v1/orders", headers: { authorization: `Bearer ${accessToken}` } })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/v1/orders", headers: { "x-api-key": otherKey } })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/v1/orders", headers: { "x-api-key": "demo-admin-key" } })).statusCode).toBe(401);
  });
});

describe("pedidos", () => {
  it("repite exactamente la misma respuesta con Idempotency-Key", async () => {
    const headers = { "idempotency-key": "idem-1", "x-forwarded-for": "10.0.0.1" };
    const first = await app.inject({ method: "POST", url: "/v1/public/arepa-express/orders", headers, payload: orderPayload });
    const second = await app.inject({ method: "POST", url: "/v1/public/arepa-express/orders", headers, payload: orderPayload });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().id).toBe(first.json().id);
    expect(catalog.products[0]?.stockQty).toBe(29);
  });

  it("no sobrevende stock bajo solicitudes concurrentes", async () => {
    const attempts = await Promise.all(Array.from({ length: 31 }, (_, index) =>
      app.inject({
        method: "POST", url: "/v1/public/arepa-express/orders",
        headers: { "idempotency-key": `concurrent-${index}`, "x-forwarded-for": `10.1.0.${index + 1}` },
        payload: orderPayload,
      })));
    expect(attempts.filter(({ statusCode }) => statusCode === 201)).toHaveLength(30);
    expect(attempts.filter(({ statusCode }) => statusCode === 409)).toHaveLength(1);
    expect(catalog.products[0]?.stockQty).toBe(0);
  });
});
