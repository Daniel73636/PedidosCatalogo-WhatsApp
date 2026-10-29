import { z } from "zod";

export const fulfillmentSchema = z.enum(["delivery", "pickup", "dine_in"]);
export const cartItemSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().optional(),
  quantity: z.number().int().positive().max(100),
  optionIds: z.array(z.string()).default([]),
  note: z.string().trim().max(240).optional(),
});
export const cartSchema = z.object({
  items: z.array(cartItemSchema).min(1).max(100),
  fulfillment: fulfillmentSchema,
  tipCents: z.number().int().nonnegative().max(100_000).optional(),
});
export const addressSchema = z.object({
  label: z.string().trim().min(5).max(200),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export const quoteRequestSchema = z.object({
  cart: cartSchema,
  address: addressSchema.optional(),
  couponCode: z.string().trim().toUpperCase().max(40).optional(),
});
export const createOrderSchema = quoteRequestSchema.extend({
  expectedTotalCents: z.number().int().nonnegative(),
  customer: z.object({
    name: z.string().trim().min(2).max(100),
    phone: z.string().regex(/^\+?[1-9]\d{7,14}$/),
  }),
  paymentMethod: z.enum(["cash", "transfer", "wallet", "online"]),
  cashChangeForCents: z.number().int().nonnegative().optional(),
  notes: z.string().trim().max(500).optional(),
});
export const transitionRequestSchema = z.object({
  event: z.enum(["accept", "reject", "expire", "cancel", "start", "ready", "dispatch", "deliver", "refund"]),
  version: z.number().int().positive(),
  actor: z.string().default("operador-demo"),
  reason: z.string().max(240).optional(),
});
export const productInputSchema = z.object({
  categoryId: z.string(),
  name: z.string().min(2).max(120),
  description: z.string().max(1000).default(""),
  basePriceCents: z.number().int().nonnegative(),
  taxRateBp: z.number().int().min(0).max(10_000).default(0),
  trackStock: z.boolean().default(false),
  stockQty: z.number().nonnegative().optional(),
  status: z.enum(["active", "sold_out", "hidden"]).default("active"),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;
