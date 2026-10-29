import {
  bigint,
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const audit = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};
export const stores = pgTable("stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("COP"),
  status: text("status").notNull().default("open"),
  settings: jsonb("settings").notNull().default({}),
  ...audit,
});
export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  availableDuring: jsonb("available_during"),
  ...audit,
});
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    categoryId: uuid("category_id").references(() => categories.id),
    name: text("name").notNull(),
    description: text("description"),
    basePriceCents: bigint("base_price_cents", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("COP"),
    taxRateBp: integer("tax_rate_bp").notNull().default(0),
    trackStock: boolean("track_stock").notNull().default(false),
    stockQty: numeric("stock_qty", { precision: 12, scale: 3 }),
    status: text("status").notNull().default("active"),
    tags: text("tags").array().notNull().default([]),
    ...audit,
  },
  (table) => [uniqueIndex("products_tenant_name_idx").on(table.tenantId, table.name)],
);
export const productVariants = pgTable("product_variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => products.id),
  name: text("name").notNull(),
  priceCents: bigint("price_cents", { mode: "number" }).notNull(),
  stockQty: numeric("stock_qty", { precision: 12, scale: 3 }),
});
export const optionGroups = pgTable("option_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  name: text("name").notNull(),
  minSelect: integer("min_select").notNull().default(0),
  maxSelect: integer("max_select").notNull().default(1),
});
export const options = pgTable("options", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id").notNull().references(() => optionGroups.id),
  name: text("name").notNull(),
  priceDeltaCents: bigint("price_delta_cents", { mode: "number" }).notNull().default(0),
  available: boolean("available").notNull().default(true),
});
export const productOptionGroups = pgTable(
  "product_option_groups",
  {
    productId: uuid("product_id").notNull().references(() => products.id),
    groupId: uuid("group_id").notNull().references(() => optionGroups.id),
    position: integer("position").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.productId, table.groupId] })],
);
export const deliveryZones = pgTable("delivery_zones", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  name: text("name").notNull(),
  bounds: jsonb("bounds").notNull(),
  feeCents: bigint("fee_cents", { mode: "number" }).notNull(),
  minOrderCents: bigint("min_order_cents", { mode: "number" }).notNull().default(0),
  freeOverCents: bigint("free_over_cents", { mode: "number" }),
  etaMin: integer("eta_min"),
});
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    ...audit,
  },
  (table) => [uniqueIndex("customers_tenant_phone_idx").on(table.tenantId, table.phone)],
);
export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  number: integer("number").notNull(),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  token: text("token").notNull().unique(),
  fulfillment: text("fulfillment").notNull(),
  status: text("status").notNull().default("new"),
  paymentStatus: text("payment_status").notNull().default("pending"),
  paymentMethod: text("payment_method").notNull(),
  addressSnapshot: jsonb("address_snapshot"),
  zoneId: uuid("zone_id"),
  subtotalCents: bigint("subtotal_cents", { mode: "number" }).notNull(),
  taxCents: bigint("tax_cents", { mode: "number" }).notNull(),
  deliveryFeeCents: bigint("delivery_fee_cents", { mode: "number" }).notNull(),
  discountCents: bigint("discount_cents", { mode: "number" }).notNull().default(0),
  tipCents: bigint("tip_cents", { mode: "number" }).notNull().default(0),
  totalCents: bigint("total_cents", { mode: "number" }).notNull(),
  notes: text("notes"),
  version: integer("version").notNull().default(1),
  ...audit,
});
export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  productId: uuid("product_id").notNull(),
  nameSnapshot: text("name_snapshot").notNull(),
  unitPriceCents: bigint("unit_price_cents", { mode: "number" }).notNull(),
  qty: numeric("qty", { precision: 10, scale: 3 }).notNull(),
  optionsSnapshot: jsonb("options_snapshot").notNull(),
  note: text("note"),
  lineTotalCents: bigint("line_total_cents", { mode: "number" }).notNull(),
});
export const orderEvents = pgTable("order_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  actor: text("actor"),
  reason: text("reason"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});
export const stockReservations = pgTable("stock_reservations", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  productId: uuid("product_id").notNull().references(() => products.id),
  qty: numeric("qty", { precision: 10, scale: 3 }).notNull(),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  ...audit,
});
export const coupons = pgTable("coupons", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  code: text("code").notNull(),
  kind: text("kind").notNull(),
  value: integer("value").notNull(),
  active: boolean("active").notNull().default(true),
  ...audit,
});
export const whatsappLogs = pgTable("whatsapp_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  orderId: uuid("order_id"),
  recipientMasked: text("recipient_masked").notNull(),
  template: text("template").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Order = typeof orders.$inferSelect;
