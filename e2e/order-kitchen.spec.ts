import { expect, test } from "@playwright/test";

const apiUrl = "http://127.0.0.1:4100";

test("menú público crea pedido y cocina lo recibe", async ({ page, request }) => {
  await page.goto("/arepa-express");
  await expect(page.getByRole("link", { name: /Arepa Express/ }).first()).toBeVisible();

  const cart = { fulfillment: "pickup", items: [{ productId: "reina-pepiada", quantity: 1 }] };
  const quoted = await request.post(`${apiUrl}/v1/public/arepa-express/quote`, { data: { cart } });
  expect(quoted.ok()).toBeTruthy();
  const quote = await quoted.json() as { totalCents: number };

  const created = await request.post(`${apiUrl}/v1/public/arepa-express/orders`, {
    headers: { "Idempotency-Key": `e2e-${Date.now()}` },
    data: {
      cart, expectedTotalCents: quote.totalCents,
      customer: {
        name: "Pedido E2E", phone: "+573009998877",
        privacyConsent: true, privacyPolicyVersion: "2026-11-01",
      },
      paymentMethod: "cash",
    },
  });
  expect(created.status()).toBe(201);
  const order = await created.json() as { number: number };

  const authenticated = await request.post(`${apiUrl}/v1/auth/login`, {
    data: { email: "admin@arepa.test", password: "Cambiar123!" },
  });
  const { accessToken } = await authenticated.json() as { accessToken: string };
  await page.addInitScript((token) => localStorage.setItem("pedidos-access-token", token), accessToken);
  await page.goto("/cocina");

  await expect(page.getByText(`#${order.number} · Pedido E2E`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Activar sonido" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Activar vibración" })).toBeVisible();
});
