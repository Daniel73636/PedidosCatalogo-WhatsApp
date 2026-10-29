import type { Catalog, Coupon, DeliveryZone, OrderStatus, Store } from "@pedidos/domain-pricing";

export const tenantId = "11111111-1111-4111-8111-111111111111";
export const catalog: Catalog = {
  categories: [
    { id: "arepas", name: "Arepas" },
    { id: "bebidas", name: "Bebidas" },
  ],
  products: [
    {
      id: "reina-pepiada",
      categoryId: "arepas",
      name: "Reina Pepiada",
      basePriceCents: 1_800_000,
      taxRateBp: 800,
      status: "active",
      trackStock: true,
      stockQty: 30,
      optionGroups: [{
        id: "salsas",
        name: "Salsas",
        minSelect: 0,
        maxSelect: 2,
        options: [
          { id: "ajo", name: "Salsa de ajo", priceDeltaCents: 0, available: true },
          { id: "picante", name: "Picante", priceDeltaCents: 0, available: true },
        ],
      }],
    },
    {
      id: "pabellon",
      categoryId: "arepas",
      name: "Pabellón",
      basePriceCents: 2_200_000,
      taxRateBp: 800,
      status: "active",
      trackStock: true,
      stockQty: 20,
    },
    {
      id: "papelon",
      categoryId: "bebidas",
      name: "Papelón con limón",
      basePriceCents: 700_000,
      taxRateBp: 1900,
      status: "active",
      trackStock: true,
      stockQty: 40,
    },
  ],
};
export const zone: DeliveryZone = {
  id: "centro",
  name: "Zona centro",
  feeCents: 500_000,
  minOrderCents: 1_500_000,
  freeOverCents: 5_000_000,
  bounds: { north: 4.72, south: 4.55, east: -74.02, west: -74.18 },
};
export const store: Store & { slug: string; name: string; etaMin: number; status: string } = {
  slug: "arepa-express",
  name: "Arepa Express",
  currency: "COP",
  pricesIncludeTax: true,
  open: true,
  status: "open",
  etaMin: 35,
  deliveryZones: [zone],
};
export const coupons: Coupon[] = [
  { code: "AREPA10", kind: "percent", value: 1000, minSubtotalCents: 2_000_000, maxDiscountCents: 800_000 },
];
export interface DemoOrder {
  id: string;
  token: string;
  number: number;
  status: OrderStatus;
  version: number;
  customer: { name: string; phone: string };
  cart: { items: { productId: string; quantity: number }[]; fulfillment: "delivery" | "pickup" | "dine_in" };
  quote: ReturnType<typeof import("@pedidos/domain-pricing").quote>;
  paymentMethod: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  events: { from: OrderStatus | null; to: OrderStatus; actor: string; at: string; reason?: string }[];
}
export const orders = new Map<string, DemoOrder>();
export const idempotency = new Map<string, string>();
export const whatsappLogs: { at: string; recipient: string; template: string; orderId: string; payload: object }[] = [];
