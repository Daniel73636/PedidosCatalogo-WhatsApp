import { and, asc, eq, sql } from "drizzle-orm";
import {
  categories, coupons as couponRows, createDb, customers, deliveryZones, optionGroups, options,
  orderEvents, orderItems, orders as orderRows, productOptionGroups, products, stores,
  stockReservations,
} from "@pedidos/db";
import type { Catalog, Coupon, OrderStatus, Store } from "@pedidos/domain-pricing";
import { idempotency, orders, catalog, coupons, store, tenantId as demoTenantId, type DemoOrder } from "./data.js";

export interface StoreContext {
  tenantId: string;
  store: Store & { slug: string; name: string; etaMin: number; status: string };
  catalog: Catalog;
  coupons: Coupon[];
}

export interface OrderRepository {
  readonly kind: "memory" | "postgres";
  ready(): Promise<boolean>;
  storeBySlug(slug: string): Promise<StoreContext | undefined>;
  create(order: DemoOrder, idempotencyKey: string): Promise<{ order: DemoOrder; replay: boolean }>;
  list(tenantId: string, status?: OrderStatus): Promise<DemoOrder[]>;
  byId(tenantId: string, id: string): Promise<DemoOrder | undefined>;
  byToken(token: string): Promise<DemoOrder | undefined>;
  transition(tenantId: string, id: string, expectedVersion: number, next: OrderStatus, actor: string, reason?: string): Promise<DemoOrder | "VERSION_CONFLICT" | undefined>;
  close(): Promise<void>;
}

export class MemoryOrderRepository implements OrderRepository {
  readonly kind = "memory";
  async ready() { return true; }
  async storeBySlug(slug: string) {
    return slug === store.slug ? { tenantId: demoTenantId, store, catalog, coupons } : undefined;
  }
  async create(order: DemoOrder, key: string) {
    const tenantKey = `${order.tenantId}:${key}`;
    const previous = idempotency.get(tenantKey);
    if (previous) return { order: orders.get(previous)!, replay: true };
    const requested = new Map<string, number>();
    for (const item of order.cart.items) requested.set(item.productId, (requested.get(item.productId) ?? 0) + item.quantity);
    for (const [id, qty] of requested) {
      const product = catalog.products.find((entry) => entry.id === id);
      if (product?.trackStock && (product.stockQty ?? 0) < qty) throw new Error(`OUT_OF_STOCK:${product.name}`);
    }
    for (const [id, qty] of requested) {
      const product = catalog.products.find((entry) => entry.id === id);
      if (product?.trackStock) product.stockQty = (product.stockQty ?? 0) - qty;
    }
    orders.set(order.id, order);
    idempotency.set(tenantKey, order.id);
    return { order, replay: false };
  }
  async list(currentTenant: string, status?: OrderStatus) {
    return [...orders.values()].filter((order) => order.tenantId === currentTenant && (!status || order.status === status));
  }
  async byId(currentTenant: string, id: string) {
    const order = orders.get(id);
    return order?.tenantId === currentTenant ? order : undefined;
  }
  async byToken(token: string) { return [...orders.values()].find((order) => order.token === token); }
  async transition(currentTenant: string, id: string, version: number, next: OrderStatus, actor: string, reason?: string) {
    const order = await this.byId(currentTenant, id);
    if (!order) return undefined;
    if (order.version !== version) return "VERSION_CONFLICT" as const;
    const previous = order.status;
    order.status = next;
    order.version++;
    order.updatedAt = new Date().toISOString();
    order.events.push({ from: previous, to: next, actor, at: order.updatedAt, ...(reason ? { reason } : {}) });
    if (["rejected", "canceled", "expired"].includes(next)) {
      for (const item of order.cart.items) {
        const product = catalog.products.find(({ id: productId }) => productId === item.productId);
        if (product?.trackStock) product.stockQty = (product.stockQty ?? 0) + item.quantity;
      }
    }
    return order;
  }
  async close() {}
}

export class PostgresOrderRepository implements OrderRepository {
  readonly kind = "postgres";
  private readonly connection;
  constructor(url: string) { this.connection = createDb(url); }
  async ready() {
    try { await this.connection.db.execute(sql`select 1`); return true; } catch { return false; }
  }
  async storeBySlug(slug: string): Promise<StoreContext | undefined> {
    return this.connection.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.store_slug', ${slug}, true)`);
      const [storeRow] = await tx.select().from(stores).where(eq(stores.slug, slug)).limit(1);
      if (!storeRow) return undefined;
      await this.setTenant(tx as never, storeRow.tenantId);
      const [categoryRows, productRows, zoneRows, couponData, groupLinks] = await Promise.all([
        tx.select().from(categories).where(eq(categories.tenantId, storeRow.tenantId)).orderBy(asc(categories.position)),
        tx.select().from(products).where(eq(products.tenantId, storeRow.tenantId)),
        tx.select().from(deliveryZones).where(eq(deliveryZones.tenantId, storeRow.tenantId)),
        tx.select().from(couponRows).where(and(eq(couponRows.tenantId, storeRow.tenantId), eq(couponRows.active, true))),
        tx.select({
          productId: productOptionGroups.productId, groupId: optionGroups.id, groupName: optionGroups.name,
          minSelect: optionGroups.minSelect, maxSelect: optionGroups.maxSelect,
          optionId: options.id, optionName: options.name, priceDeltaCents: options.priceDeltaCents, available: options.available,
        }).from(productOptionGroups)
          .innerJoin(optionGroups, eq(productOptionGroups.groupId, optionGroups.id))
          .innerJoin(options, eq(options.groupId, optionGroups.id))
          .where(eq(optionGroups.tenantId, storeRow.tenantId)),
      ]);
      const settings = storeRow.settings as { pricesIncludeTax?: boolean; etaMin?: number };
      const mappedZones = zoneRows.map((zone) => ({
        id: zone.id, name: zone.name, feeCents: zone.feeCents, minOrderCents: zone.minOrderCents,
        ...(zone.freeOverCents === null ? {} : { freeOverCents: zone.freeOverCents }),
        bounds: zone.bounds as { north: number; south: number; east: number; west: number },
      }));
      return {
        tenantId: storeRow.tenantId,
        store: {
          slug: storeRow.slug, name: storeRow.name, currency: storeRow.currency,
          pricesIncludeTax: settings.pricesIncludeTax ?? true, open: storeRow.status === "open",
          status: storeRow.status, etaMin: settings.etaMin ?? zoneRows[0]?.etaMin ?? 35,
          deliveryZones: mappedZones,
        },
        catalog: {
          categories: categoryRows.map((category) => ({ id: category.id, name: category.name })),
          products: productRows.map((product) => {
            const links = groupLinks.filter((link) => link.productId === product.id);
            const groupIds = [...new Set(links.map((link) => link.groupId))];
            return {
              id: product.id, categoryId: product.categoryId ?? "", name: product.name,
              basePriceCents: product.basePriceCents, taxRateBp: product.taxRateBp,
              status: product.status as "active" | "sold_out" | "hidden", trackStock: product.trackStock,
              ...(product.stockQty === null ? {} : { stockQty: Number(product.stockQty) }),
              optionGroups: groupIds.map((groupId) => {
                const entries = links.filter((link) => link.groupId === groupId);
                const first = entries[0]!;
                return {
                  id: groupId, name: first.groupName, minSelect: first.minSelect, maxSelect: first.maxSelect,
                  options: entries.map((entry) => ({
                    id: entry.optionId, name: entry.optionName,
                    priceDeltaCents: entry.priceDeltaCents, available: entry.available,
                  })),
                };
              }),
            };
          }),
        },
        coupons: couponData.map((coupon) => ({
          code: coupon.code, kind: coupon.kind as "percent" | "fixed", value: coupon.value,
        })),
      };
    });
  }
  private async setTenant(tx: { execute(query: unknown): Promise<unknown> }, tenantId: string) {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
  }
  async create(order: DemoOrder, idempotencyKey: string) {
    let replay = false;
    let persistedId = order.id;
    await this.connection.db.transaction(async (tx) => {
      await this.setTenant(tx as never, order.tenantId);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${order.tenantId}))`);
      const [existing] = await tx.select({ id: orderRows.id }).from(orderRows).where(and(
        eq(orderRows.tenantId, order.tenantId), eq(orderRows.idempotencyKey, idempotencyKey),
      )).limit(1);
      if (existing) { replay = true; persistedId = existing.id; return; }

      const requested = new Map<string, number>();
      for (const item of order.cart.items) requested.set(item.productId, (requested.get(item.productId) ?? 0) + item.quantity);
      for (const [productId, quantity] of requested) {
        const reserved = await tx.execute(sql`
          update products set stock_qty = stock_qty - ${quantity}, updated_at = now()
          where id = ${productId}::uuid and tenant_id = ${order.tenantId}::uuid
            and track_stock = true and stock_qty::numeric >= ${quantity}
          returning id
        `);
        const [product] = await tx.select({ trackStock: products.trackStock }).from(products)
          .where(and(eq(products.id, productId), eq(products.tenantId, order.tenantId))).limit(1);
        if (!product) throw new Error("PRODUCT_NOT_FOUND");
        if (product.trackStock && reserved.count !== 1) throw new Error("OUT_OF_STOCK");
      }

      const [customer] = await tx.insert(customers).values({
        tenantId: order.tenantId, name: order.customer.name, phone: order.customer.phone,
        privacyConsentAt: new Date(), privacyPolicyVersion: order.customer.privacyPolicyVersion,
      }).onConflictDoUpdate({
        target: [customers.tenantId, customers.phone],
        set: { name: order.customer.name, privacyConsentAt: new Date(), privacyPolicyVersion: order.customer.privacyPolicyVersion, updatedAt: new Date() },
      }).returning({ id: customers.id });
      if (!customer) throw new Error("CUSTOMER_CREATE_FAILED");
      const numberRows = await tx.select({ number: sql<number>`coalesce(max(${orderRows.number}), 0) + 1` }).from(orderRows)
        .where(eq(orderRows.tenantId, order.tenantId));
      order.number = Number(numberRows[0]?.number ?? 1);
      await tx.insert(orderRows).values({
        id: order.id, tenantId: order.tenantId, idempotencyKey, number: order.number,
        customerId: customer.id, token: order.token, fulfillment: order.cart.fulfillment,
        status: order.status, paymentMethod: order.paymentMethod,
        subtotalCents: order.quote.subtotalCents, taxCents: order.quote.taxCents,
        deliveryFeeCents: order.quote.deliveryFeeCents, discountCents: order.quote.discountCents,
        tipCents: order.quote.tipCents, totalCents: order.quote.totalCents,
        notes: order.notes, version: order.version,
      });
      for (const item of order.cart.items) {
        const line = order.quote.lines.find(({ productId }) => productId === item.productId);
        if (!line) continue;
        await tx.insert(orderItems).values({
          orderId: order.id, productId: item.productId, nameSnapshot: line.name,
          unitPriceCents: line.unitPriceCents, qty: String(item.quantity),
          optionsSnapshot: line.options, lineTotalCents: line.totalCents,
        });
        const [product] = await tx.select({ trackStock: products.trackStock }).from(products).where(eq(products.id, item.productId)).limit(1);
        if (product?.trackStock) await tx.insert(stockReservations).values({
          orderId: order.id, productId: item.productId, qty: String(item.quantity),
        });
      }
      await tx.insert(orderEvents).values({ orderId: order.id, toStatus: "new", actor: "cliente" });
    });
    return { order: (await this.byId(order.tenantId, persistedId))!, replay };
  }
  async list(tenantId: string, status?: OrderStatus) {
    const rows = await this.connection.db.transaction(async (tx) => {
      await this.setTenant(tx as never, tenantId);
      return tx.select({ id: orderRows.id }).from(orderRows)
        .where(status ? and(eq(orderRows.tenantId, tenantId), eq(orderRows.status, status)) : eq(orderRows.tenantId, tenantId))
        .orderBy(asc(orderRows.createdAt));
    });
    return (await Promise.all(rows.map(({ id }) => this.byId(tenantId, id)))).filter((order): order is DemoOrder => Boolean(order));
  }
  async byId(tenantId: string, id: string) {
    return this.load(tenantId, eq(orderRows.id, id));
  }
  async byToken(token: string) {
    const [row] = await this.connection.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.order_token', ${token}, true)`);
      return tx.select({ tenantId: orderRows.tenantId }).from(orderRows).where(eq(orderRows.token, token)).limit(1);
    });
    return row ? this.load(row.tenantId, eq(orderRows.token, token)) : undefined;
  }
  private async load(tenantId: string, predicate: ReturnType<typeof eq>): Promise<DemoOrder | undefined> {
    return this.connection.db.transaction(async (tx) => {
      await this.setTenant(tx as never, tenantId);
      const [row] = await tx.select({
        order: orderRows, customerName: customers.name, customerPhone: customers.phone,
        policyVersion: customers.privacyPolicyVersion,
      }).from(orderRows).innerJoin(customers, eq(orderRows.customerId, customers.id))
        .where(and(eq(orderRows.tenantId, tenantId), predicate)).limit(1);
      if (!row) return undefined;
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, row.order.id));
      const events = await tx.select().from(orderEvents).where(eq(orderEvents.orderId, row.order.id)).orderBy(asc(orderEvents.at));
      return {
        id: row.order.id, tenantId: row.order.tenantId, token: row.order.token, number: row.order.number,
        status: row.order.status as OrderStatus, version: row.order.version,
        customer: { name: row.customerName, phone: row.customerPhone, privacyConsent: true, privacyPolicyVersion: row.policyVersion ?? "desconocida" },
        cart: { fulfillment: row.order.fulfillment as DemoOrder["cart"]["fulfillment"], items: items.map((item) => ({ productId: item.productId, quantity: Number(item.qty) })) },
        quote: {
          currency: "COP", lines: items.map((item) => ({
            productId: item.productId, name: item.nameSnapshot, quantity: Number(item.qty),
            unitPriceCents: item.unitPriceCents, options: item.optionsSnapshot as DemoOrder["quote"]["lines"][number]["options"],
            subtotalCents: item.lineTotalCents, taxCents: 0, totalCents: item.lineTotalCents,
          })),
          subtotalCents: row.order.subtotalCents, taxCents: row.order.taxCents,
          deliveryFeeCents: row.order.deliveryFeeCents, discountCents: row.order.discountCents,
          tipCents: row.order.tipCents, totalCents: row.order.totalCents, warnings: [], errors: [],
        },
        paymentMethod: row.order.paymentMethod, ...(row.order.notes ? { notes: row.order.notes } : {}),
        createdAt: row.order.createdAt.toISOString(), updatedAt: row.order.updatedAt.toISOString(),
        events: events.map((event) => ({
          from: event.fromStatus as OrderStatus | null, to: event.toStatus as OrderStatus,
          actor: event.actor ?? "sistema", at: event.at.toISOString(), ...(event.reason ? { reason: event.reason } : {}),
        })),
      };
    });
  }
  async transition(tenantId: string, id: string, version: number, next: OrderStatus, actor: string, reason?: string) {
    let conflict = false;
    let missing = false;
    await this.connection.db.transaction(async (tx) => {
      await this.setTenant(tx as never, tenantId);
      const [current] = await tx.select({ status: orderRows.status }).from(orderRows)
        .where(and(eq(orderRows.id, id), eq(orderRows.tenantId, tenantId))).limit(1);
      if (!current) { missing = true; return; }
      const changed = await tx.update(orderRows).set({ status: next, version: version + 1, updatedAt: new Date() })
        .where(and(eq(orderRows.id, id), eq(orderRows.tenantId, tenantId), eq(orderRows.version, version))).returning({ id: orderRows.id });
      if (!changed.length) { conflict = true; return; }
      await tx.insert(orderEvents).values({ orderId: id, fromStatus: current.status, toStatus: next, actor, reason });
      if (["rejected", "canceled", "expired"].includes(next)) {
        await tx.execute(sql`
          update products p set stock_qty = p.stock_qty + r.qty, updated_at = now()
          from stock_reservations r
          where r.order_id = ${id}::uuid and r.product_id = p.id and r.released_at is null
        `);
        await tx.update(stockReservations).set({ releasedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(stockReservations.orderId, id), sql`${stockReservations.releasedAt} is null`));
      }
    });
    if (missing) return undefined;
    if (conflict) return "VERSION_CONFLICT";
    return this.byId(tenantId, id);
  }
  async close() { await this.connection.close(); }
}
