import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { catalog, idempotency, orders } from "./data.js";

const otherKey = "tenant-b-secret-key";
process.env.API_KEYS = `22222222-2222-4222-8222-222222222222:${createHash("sha256").update(otherKey).digest("hex")}:orders:read|customers:read`;
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
      payload: { tenantSlug: "arepa-express", email: "admin@arepa.test", password: "Cambiar123!" },
    });
    expect(login.statusCode).toBe(200);
    const accessToken = login.json<{ accessToken: string }>().accessToken;
    expect((await app.inject({ method: "GET", url: "/v1/orders", headers: { authorization: `Bearer ${accessToken}` } })).statusCode).toBe(200);
    const isolated = await app.inject({ method: "GET", url: "/v1/orders", headers: { "x-api-key": otherKey } });
    expect(isolated.statusCode).toBe(200);
    expect(isolated.json()).toEqual([]);
    expect((await app.inject({ method: "GET", url: "/v1/orders", headers: { "x-api-key": "demo-admin-key" } })).statusCode).toBe(401);
  });

  it("exporta clientes solo del tenant autenticado", async () => {
    const created = await app.inject({
      method: "POST", url: "/v1/public/arepa-express/orders",
      headers: { "idempotency-key": "privacy-1", "x-forwarded-for": "10.0.0.8" }, payload: orderPayload,
    });
    expect(created.statusCode).toBe(201);
    const login = await app.inject({
      method: "POST", url: "/v1/auth/login",
      payload: { tenantSlug: "arepa-express", email: "admin@arepa.test", password: "Cambiar123!" },
    });
    const authorization = `Bearer ${login.json<{ accessToken: string }>().accessToken}`;
    const own = await app.inject({ method: "GET", url: `/v1/customers/${encodeURIComponent("+573001112233")}/export`, headers: { authorization } });
    expect(own.statusCode).toBe(200);
    expect(own.json().orders).toHaveLength(1);
    const other = await app.inject({ method: "GET", url: `/v1/customers/${encodeURIComponent("+573001112233")}/export`, headers: { "x-api-key": otherKey } });
    expect(other.json().customer).toBeUndefined();
    expect(other.json().orders).toEqual([]);
  });

  it("deja el webhook de Wompi apagado hasta activar el flag", async () => {
    const response = await app.inject({ method: "POST", url: "/v1/payments/wompi/webhook", payload: { event: "transaction.updated" } });
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("WEBHOOK_DESHABILITADO");
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

  it("resume ventas por hora, productos destacados y CSV", async () => {
    const created = await app.inject({
      method: "POST", url: "/v1/public/arepa-express/orders",
      headers: { "idempotency-key": "report-1", "x-forwarded-for": "10.0.0.9" }, payload: orderPayload,
    });
    const login = await app.inject({
      method: "POST", url: "/v1/auth/login",
      payload: { tenantSlug: "arepa-express", email: "admin@arepa.test", password: "Cambiar123!" },
    });
    const authorization = `Bearer ${login.json<{ accessToken: string }>().accessToken}`;
    let version = created.json().version as number;
    for (const event of ["accept", "start", "ready", "deliver"] as const) {
      const step = await app.inject({
        method: "PATCH", url: `/v1/orders/${created.json().id}/transition`,
        headers: { authorization }, payload: { event, version, actor: "caja" },
      });
      expect(step.statusCode).toBe(200);
      version = step.json().version;
    }
    const summary = await app.inject({ method: "GET", url: "/v1/reports/summary", headers: { authorization } });
    expect(summary.statusCode).toBe(200);
    expect(summary.json().salesByHour.length).toBe(1);
    expect(summary.json().topProducts[0]).toMatchObject({ name: "Reina Pepiada", quantity: 1 });
    const csv = await app.inject({ method: "GET", url: "/v1/reports/orders.csv", headers: { authorization } });
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.body).toContain("Daniel Prueba");
    expect(csv.body).toContain("delivered");
  });
});
