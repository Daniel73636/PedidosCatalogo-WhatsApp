import { randomBytes, randomUUID } from "node:crypto";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { createOrderSchema, productInputSchema, quoteRequestSchema, transitionRequestSchema } from "@pedidos/contracts";
import { quote, transition, type Cart, type OrderStatus } from "@pedidos/domain-pricing";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { closeAuth, initializeAuth, login, principalFromApiKey, refresh, verifyToken, type Principal } from "./auth.js";
import { coupons, orders, type DemoOrder } from "./data.js";
import { loadEnv } from "./env.js";
import { MockPaymentProvider, WompiPaymentProvider } from "./payments.js";
import { MemoryOrderRepository, PostgresOrderRepository } from "./repository.js";

const env = loadEnv();
const app = Fastify({ logger: env.NODE_ENV !== "test", bodyLimit: 2_000_000, trustProxy: true });
const allowedOrigins = new Set(env.WEB_ORIGIN.split(",").map((origin) => origin.trim()));
await app.register(cors, {
  credentials: true,
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
});
await app.register(cookie);
await app.register(helmet, { contentSecurityPolicy: false });
await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
await initializeAuth(env);
const principals = new WeakMap<FastifyRequest, Principal>();
const paymentProvider = env.PAYMENTS_PROVIDER === "wompi"
  ? new WompiPaymentProvider(env.WOMPI_WEBHOOK_SECRET, env.WOMPI_PUBLIC_KEY)
  : new MockPaymentProvider();
const orderRepository = env.DATABASE_URL && !env.DEMO_MODE
  ? new PostgresOrderRepository(env.DATABASE_URL)
  : new MemoryOrderRepository();

const subscribers = new Set<FastifyReply>();
const broadcast = (event: string, data: unknown) => {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const reply of subscribers) reply.raw.write(payload);
};
const problem = (reply: FastifyReply, status: number, code: string, detail: string, extra?: object) =>
  reply.status(status).type("application/problem+json").send({
    type: `https://pedidos.local/problems/${code.toLowerCase()}`,
    title: code,
    status,
    detail,
    code,
    ...extra,
  });
const parse = <T>(result: { success: boolean; data?: T; error?: { flatten(): unknown } }, reply: FastifyReply) => {
  if (!result.success) {
    problem(reply, 400, "VALIDATION_ERROR", "Revisa los datos enviados.", { fields: result.error?.flatten() });
    return undefined;
  }
  return result.data;
};
const privateGuard = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const authorization = request.headers.authorization;
    const rawApiKey = request.headers["x-api-key"];
    const principal = authorization?.startsWith("Bearer ")
      ? await verifyToken(authorization.slice(7), env, "access")
      : typeof rawApiKey === "string" ? await principalFromApiKey(rawApiKey, env) : undefined;
    if (!principal) return problem(reply, 401, "NO_AUTORIZADO", "Inicia sesión o envía una API key válida.");
    const route = request.routeOptions.url ?? request.url;
    const write = !["GET", "HEAD", "OPTIONS"].includes(request.method);
    const resource = route.includes("/products") || route.includes("/categories") ? "catalog"
      : route.includes("/reports") ? "reports" : route.includes("/customers") ? "customers" : "orders";
    const requiredScope = `${resource}:${write ? "write" : "read"}`;
    if (principal.subject.startsWith("api-key:") && !principal.scopes.includes("*") && !principal.scopes.includes(requiredScope))
      return problem(reply, 403, "ALCANCE_INSUFICIENTE", `La API key requiere ${requiredScope}.`);
    const roleAllowed = principal.role === "owner"
      || (principal.role === "cashier" && resource !== "reports")
      || (principal.role === "kitchen" && resource === "orders")
      || (principal.role === "courier" && resource === "orders");
    if (!roleAllowed) return problem(reply, 403, "ROL_INSUFICIENTE", "Tu rol no permite esta operación.");
    principals.set(request, principal);
  } catch {
    return problem(reply, 401, "TOKEN_INVALIDO", "La sesión venció o no es válida.");
  }
};
const couponFor = (availableCoupons: typeof coupons, code?: string) => availableCoupons.find((coupon) => coupon.code === code?.toUpperCase());
const maskPhone = (phone: string) => `${phone.slice(0, 3)}***${phone.slice(-2)}`;
const sendWhatsappMock = async (order: DemoOrder, template: string) => {
  const log = {
    at: new Date().toISOString(),
    recipient: maskPhone(order.customer.phone),
    template,
    orderId: order.id,
    payload: { number: order.number, status: order.status, tracking: `/pedido/${order.token}` },
  };
  await orderRepository.addWhatsappLog(order.tenantId, order.id, log.recipient, template, log.payload);
  app.log.info({ whatsapp: log }, "[WHATSAPP MOCK]");
};

app.get("/health", async () => ({ ok: true, service: "pedidos-api" }));
app.get("/ready", async (_request, reply) => {
  const ready = await orderRepository.ready();
  return reply.status(ready ? 200 : 503).send({ ready, dependencies: { orderRepository: orderRepository.kind } });
});
app.post("/v1/auth/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
  const { tenantSlug, email, password } = request.body as { tenantSlug?: string; email?: string; password?: string };
  if (!tenantSlug || !email || !password) return problem(reply, 400, "CREDENCIALES_REQUERIDAS", "Comercio, correo y contraseña son obligatorios.");
  const session = await login(tenantSlug, email, password, env);
  if (!session) return problem(reply, 401, "CREDENCIALES_INVALIDAS", "Correo o contraseña incorrectos.");
  reply.setCookie("refresh_token", session.refreshToken, {
    httpOnly: true, sameSite: "strict", secure: env.NODE_ENV === "production", path: "/v1/auth", maxAge: 7 * 24 * 60 * 60,
  });
  return { accessToken: session.accessToken, user: session.principal };
});
app.post("/v1/auth/refresh", async (request, reply) => {
  const token = request.cookies.refresh_token;
  if (!token) return problem(reply, 401, "REFRESH_REQUERIDO", "La sesión debe renovarse.");
  try {
    const session = await refresh(token, env);
    reply.setCookie("refresh_token", session.refreshToken, {
      httpOnly: true, sameSite: "strict", secure: env.NODE_ENV === "production", path: "/v1/auth", maxAge: 7 * 24 * 60 * 60,
    });
    return { accessToken: session.accessToken };
  } catch {
    return problem(reply, 401, "REFRESH_INVALIDO", "La sesión no se pudo renovar.");
  }
});
app.post("/v1/payments/wompi/webhook", async (request, reply) => {
  if (!env.PAYMENT_WEBHOOK_ENABLED || env.PAYMENTS_PROVIDER !== "wompi")
    return problem(reply, 404, "WEBHOOK_DESHABILITADO", "El webhook de pagos no está habilitado.");
  const signature = request.headers["x-event-checksum"];
  const event = paymentProvider.parseWebhook(request.body, typeof signature === "string" ? signature : undefined);
  if (!event) return problem(reply, 401, "FIRMA_WEBHOOK_INVALIDA", "No fue posible validar el evento de pago.");
  if (!(await orderRepository.byId(event.tenantId, event.orderId)))
    return problem(reply, 404, "ORDER_NOT_FOUND", "Pedido no encontrado.");
  const claimed = await orderRepository.claimPaymentWebhook(event.tenantId, "wompi", event.id, event.raw);
  if (!claimed) return { ok: true, duplicate: true };
  await orderRepository.setPaymentStatus(event.tenantId, event.orderId, event.status);
  return { ok: true, duplicate: false };
});
app.get("/v1/public/:slug/menu", async (request, reply) => {
  const context = await orderRepository.storeBySlug((request.params as { slug: string }).slug);
  if (!context) return problem(reply, 404, "STORE_NOT_FOUND", "Tienda no encontrada.");
  return { store: context.store, catalog: context.catalog, generatedAt: new Date().toISOString() };
});
app.post("/v1/public/:slug/coverage", async (request, reply) => {
  const context = await orderRepository.storeBySlug((request.params as { slug: string }).slug);
  if (!context) return problem(reply, 404, "TIENDA_NO_ENCONTRADA", "Tienda no encontrada.");
  const body = request.body as { lat?: number; lng?: number };
  if (typeof body.lat !== "number" || typeof body.lng !== "number")
    return problem(reply, 400, "VALIDATION_ERROR", "Ubicación inválida.");
  const coveredZone = context.store.deliveryZones.find(({ bounds }) =>
    body.lat! <= bounds.north && body.lat! >= bounds.south && body.lng! <= bounds.east && body.lng! >= bounds.west);
  return coveredZone ? { covered: true, zoneId: coveredZone.id, feeCents: coveredZone.feeCents, etaMin: context.store.etaMin } : { covered: false };
});
app.post("/v1/public/:slug/quote", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
  const context = await orderRepository.storeBySlug((request.params as { slug: string }).slug);
  if (!context) return problem(reply, 404, "TIENDA_NO_ENCONTRADA", "Tienda no encontrada.");
  const input = parse(quoteRequestSchema.safeParse(request.body), reply);
  if (!input) return;
  return quote(input.cart, context.catalog, context.store, input.address, couponFor(context.coupons, input.couponCode), new Date());
});
app.post("/v1/public/:slug/orders", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
  const context = await orderRepository.storeBySlug((request.params as { slug: string }).slug);
  if (!context) return problem(reply, 404, "TIENDA_NO_ENCONTRADA", "Tienda no encontrada.");
  const key = request.headers["idempotency-key"];
  if (!key || Array.isArray(key)) return problem(reply, 400, "IDEMPOTENCY_KEY_REQUIRED", "Envía Idempotency-Key.");
  const input = parse(createOrderSchema.safeParse(request.body), reply);
  if (!input) return;
  const calculated = quote(input.cart, context.catalog, context.store, input.address, couponFor(context.coupons, input.couponCode), new Date());
  if (calculated.errors.length) {
    const outOfStock = calculated.errors.some((error) => error.startsWith("OUT_OF_STOCK"));
    return problem(reply, outOfStock ? 409 : 422, outOfStock ? "OUT_OF_STOCK" : "QUOTE_INVALID", "El carrito no se puede procesar.", { quote: calculated });
  }
  if (calculated.totalCents !== input.expectedTotalCents)
    return problem(reply, 409, "PRICE_CHANGED", "El total del carrito cambió.", { quote: calculated });

  const now = new Date().toISOString();
  const id = randomUUID();
  const order: DemoOrder = {
    id,
    tenantId: context.tenantId,
    token: randomBytes(24).toString("base64url"),
    number: orders.size + 1,
    status: "new",
    version: 1,
    customer: input.customer,
    cart: input.cart as Cart,
    quote: calculated,
    paymentMethod: input.paymentMethod,
    ...(input.notes ? { notes: input.notes } : {}),
    createdAt: now,
    updatedAt: now,
    events: [{ from: null, to: "new", actor: "cliente", at: now }],
  };
  try {
    const persisted = await orderRepository.create(order, key);
    if (!persisted.replay) {
      await sendWhatsappMock(persisted.order, "order_received");
      broadcast("order.new", persisted.order);
    }
    return reply.status(persisted.replay ? 200 : 201).send(persisted.order);
  } catch (cause) {
    if (cause instanceof Error && cause.message.startsWith("OUT_OF_STOCK"))
      return problem(reply, 409, "OUT_OF_STOCK", "Ya no hay unidades suficientes para completar el pedido.");
    throw cause;
  }
});
app.get("/v1/public/orders/:token", async (request, reply) => {
  const order = await orderRepository.byToken((request.params as { token: string }).token);
  if (!order) return problem(reply, 404, "ORDER_NOT_FOUND", "Pedido no encontrado.");
  return order;
});
app.get("/v1/public/orders/:token/events", async (request, reply) => {
  const token = (request.params as { token: string }).token;
  if (!(await orderRepository.byToken(token))) return problem(reply, 404, "ORDER_NOT_FOUND", "Pedido no encontrado.");
  reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const timer = setInterval(() => reply.raw.write(`event: ping\ndata: {}\n\n`), 20_000);
  subscribers.add(reply);
  request.raw.on("close", () => { clearInterval(timer); subscribers.delete(reply); });
});
app.post("/v1/public/orders/:token/proof", async (request, reply) => {
  const order = await orderRepository.byToken((request.params as { token: string }).token);
  if (!order) return problem(reply, 404, "ORDER_NOT_FOUND", "Pedido no encontrado.");
  broadcast("order.payment_proof", { orderId: order.id, received: true });
  return reply.status(202).send({ ok: true, status: "payment_review", mock: true });
});
app.post("/v1/public/:slug/cart-recovery", async () => ({ ok: true, mock: true, message: "Carrito guardado durante 24 horas." }));

app.get("/v1/events", { preHandler: privateGuard }, async (request, reply) => {
  reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const timer = setInterval(() => reply.raw.write(`event: ping\ndata: {}\n\n`), 20_000);
  subscribers.add(reply);
  request.raw.on("close", () => { clearInterval(timer); subscribers.delete(reply); });
});
app.get("/v1/orders", { preHandler: privateGuard }, async (request) => {
  const status = (request.query as { status?: OrderStatus }).status;
  const principal = principals.get(request)!;
  return orderRepository.list(principal.tenantId, status);
});
app.patch("/v1/orders/:id/transition", { preHandler: privateGuard }, async (request, reply) => {
  const principal = principals.get(request)!;
  const order = await orderRepository.byId(principal.tenantId, (request.params as { id: string }).id);
  if (!order) return problem(reply, 404, "ORDER_NOT_FOUND", "Pedido no encontrado.");
  const input = parse(transitionRequestSchema.safeParse(request.body), reply);
  if (!input) return;
  let next: OrderStatus;
  try { next = transition(order.status, input.event); }
  catch { return problem(reply, 409, "INVALID_TRANSITION", `No se puede aplicar ${input.event} desde ${order.status}.`); }
  const changed = await orderRepository.transition(principal.tenantId, order.id, input.version, next, input.actor, input.reason);
  if (changed === "VERSION_CONFLICT") return problem(reply, 412, "VERSION_CONFLICT", "El pedido cambió en otro dispositivo.", { order });
  if (!changed) return problem(reply, 404, "ORDER_NOT_FOUND", "Pedido no encontrado.");
  await sendWhatsappMock(changed, `order_${next}`);
  broadcast("order.updated", changed);
  return changed;
});
app.post("/v1/orders/:id/assign-courier", { preHandler: privateGuard }, async (request, reply) => {
  const orderId = (request.params as { id: string }).id;
  if (!(await orderRepository.byId(principals.get(request)!.tenantId, orderId)))
    return problem(reply, 404, "ORDER_NOT_FOUND", "Pedido no encontrado.");
  return { ok: true, orderId, courier: request.body };
});
app.post("/v1/orders/:id/payment/validate", { preHandler: privateGuard }, async (request, reply) => {
  const order = await orderRepository.byId(principals.get(request)!.tenantId, (request.params as { id: string }).id);
  if (!order) return problem(reply, 404, "ORDER_NOT_FOUND", "Pedido no encontrado.");
  const payment = await paymentProvider.createPayment({
    tenantId: order.tenantId, orderId: order.id, amountCents: order.quote.totalCents, currency: "COP",
    idempotencyKey: `payment:${order.id}`,
  });
  const paymentStatus = payment.status === "approved" ? "paid" : "pending";
  await orderRepository.setPaymentStatus(order.tenantId, order.id, paymentStatus);
  return { ok: true, orderId: order.id, paymentStatus, providerId: payment.providerId };
});

app.get("/v1/products", { preHandler: privateGuard }, async (request) => orderRepository.adminProducts(principals.get(request)!.tenantId));
app.post("/v1/products", { preHandler: privateGuard }, async (request, reply) => {
  const input = parse(productInputSchema.safeParse(request.body), reply);
  if (!input) return;
  const product = await orderRepository.createProduct(principals.get(request)!.tenantId, input);
  return reply.status(201).send(product);
});
app.patch("/v1/products/:id", { preHandler: privateGuard }, async (request, reply) => {
  const product = await orderRepository.updateProduct(principals.get(request)!.tenantId, (request.params as { id: string }).id, request.body as never);
  if (!product) return problem(reply, 404, "PRODUCT_NOT_FOUND", "Producto no encontrado.");
  broadcast("catalog.updated", { productId: product.id });
  return product;
});
app.delete("/v1/products/:id", { preHandler: privateGuard }, async (request, reply) => {
  const product = await orderRepository.updateProduct(principals.get(request)!.tenantId, (request.params as { id: string }).id, { status: "hidden" });
  if (!product) return problem(reply, 404, "PRODUCT_NOT_FOUND", "Producto no encontrado.");
  return reply.status(204).send();
});
app.post("/v1/products/:id/sold-out", { preHandler: privateGuard }, async (request, reply) => {
  const current = (await orderRepository.adminProducts(principals.get(request)!.tenantId))
    .find(({ id }) => id === (request.params as { id: string }).id);
  const product = current && await orderRepository.updateProduct(principals.get(request)!.tenantId, current.id, {
    status: current.status === "sold_out" ? "active" : "sold_out",
  });
  if (!product) return problem(reply, 404, "PRODUCT_NOT_FOUND", "Producto no encontrado.");
  broadcast("catalog.updated", { productId: product.id, status: product.status });
  return product;
});
app.get("/v1/categories", { preHandler: privateGuard }, async (request) => (await orderRepository.adminLists(principals.get(request)!.tenantId)).categories);
app.get("/v1/delivery-zones", { preHandler: privateGuard }, async (request) => (await orderRepository.adminLists(principals.get(request)!.tenantId)).zones);
app.get("/v1/coupons", { preHandler: privateGuard }, async (request) => (await orderRepository.adminLists(principals.get(request)!.tenantId)).coupons);
app.post("/v1/menu-import", { preHandler: privateGuard }, async () => ({ id: randomUUID(), status: "needs_review", mock: true }));
app.get("/v1/menu-import/:id", { preHandler: privateGuard }, async (request) => ({ id: (request.params as { id: string }).id, status: "needs_review", suggestions: [] }));
app.get("/v1/reports/summary", { preHandler: privateGuard }, async (request) => {
  const all = await orderRepository.list(principals.get(request)!.tenantId);
  const delivered = all.filter(({ status }) => status === "delivered");
  const productTotals = new Map<string, number>();
  const hourly = new Map<number, number>();
  for (const order of delivered) {
    hourly.set(new Date(order.createdAt).getHours(), (hourly.get(new Date(order.createdAt).getHours()) ?? 0) + order.quote.totalCents);
    for (const line of order.quote.lines) productTotals.set(line.name, (productTotals.get(line.name) ?? 0) + line.quantity);
  }
  return {
    orders: all.length, salesCents: delivered.reduce((sum, order) => sum + order.quote.totalCents, 0),
    salesByHour: [...hourly].sort(([a], [b]) => a - b).map(([hour, salesCents]) => ({ hour, salesCents })),
    topProducts: [...productTotals].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, quantity]) => ({ name, quantity })),
  };
});
app.get("/v1/reports/orders.csv", { preHandler: privateGuard }, async (request, reply) => {
  const all = await orderRepository.list(principals.get(request)!.tenantId);
  const escape = (value: unknown) => `"${String(value).replaceAll("\"", "\"\"")}"`;
  const csv = ["numero,fecha,estado,total_cop,cliente", ...all.map((order) =>
    [order.number, order.createdAt, order.status, order.quote.totalCents / 100, order.customer.name].map(escape).join(","))].join("\n");
  return reply.type("text/csv; charset=utf-8").header("Content-Disposition", "attachment; filename=pedidos.csv").send(`\uFEFF${csv}`);
});
app.patch("/v1/store/status", { preHandler: privateGuard }, async (request) => {
  const status = (request.body as { status: "open" | "paused" | "closed" }).status;
  await orderRepository.setStoreStatus(principals.get(request)!.tenantId, status);
  broadcast("store.updated", { status });
  return { status, open: status === "open" };
});
app.get("/v1/whatsapp/logs", { preHandler: privateGuard }, async (request) =>
  orderRepository.listWhatsappLogs(principals.get(request)!.tenantId));
app.get("/v1/customers/:phone/export", { preHandler: privateGuard }, async (request) => {
  const phone = (request.params as { phone: string }).phone;
  const principal = principals.get(request)!;
  return { ...(await orderRepository.exportCustomer(principal.tenantId, phone)), generatedAt: new Date().toISOString() };
});
app.delete("/v1/customers/:phone", { preHandler: privateGuard }, async (request, reply) => {
  const phone = (request.params as { phone: string }).phone;
  const principal = principals.get(request)!;
  const deleted = await orderRepository.deleteCustomer(principal.tenantId, phone);
  return deleted ? reply.status(204).send() : problem(reply, 404, "CLIENTE_NO_ENCONTRADO", "Cliente no encontrado.");
});

export { app };
app.addHook("onClose", async () => { await Promise.all([orderRepository.close(), closeAuth()]); });
if (env.NODE_ENV !== "test") await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
