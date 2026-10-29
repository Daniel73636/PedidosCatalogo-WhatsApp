export type Money = number;
export type Fulfillment = "delivery" | "pickup" | "dine_in";

export interface ScheduleWindow {
  days: number[];
  from: string;
  to: string;
}
export interface Option {
  id: string;
  name: string;
  priceDeltaCents: Money;
  available: boolean;
}
export interface OptionGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: Option[];
}
export interface Product {
  id: string;
  categoryId: string;
  name: string;
  basePriceCents: Money;
  taxRateBp: number;
  status: "active" | "sold_out" | "hidden";
  trackStock: boolean;
  stockQty?: number;
  variants?: { id: string; name: string; priceCents: Money; stockQty?: number }[];
  optionGroups?: OptionGroup[];
}
export interface Category {
  id: string;
  name: string;
  availableDuring?: ScheduleWindow[];
}
export interface Catalog {
  products: Product[];
  categories: Category[];
}
export interface CartItem {
  productId: string;
  variantId?: string;
  quantity: number;
  optionIds?: string[];
  note?: string;
}
export interface Cart {
  items: CartItem[];
  fulfillment: Fulfillment;
  tipCents?: Money;
}
export interface DeliveryZone {
  id: string;
  name: string;
  feeCents: Money;
  minOrderCents: Money;
  freeOverCents?: Money;
  bounds: { north: number; south: number; east: number; west: number };
}
export interface Store {
  currency: string;
  pricesIncludeTax: boolean;
  open: boolean;
  maxDiscountCents?: Money;
  deliveryZones: DeliveryZone[];
}
export interface Address {
  lat: number;
  lng: number;
}
export interface Coupon {
  code: string;
  kind: "percent" | "fixed";
  value: number;
  minSubtotalCents?: Money;
  maxDiscountCents?: Money;
  activeFrom?: string;
  activeUntil?: string;
}
export interface QuoteLine {
  productId: string;
  name: string;
  quantity: number;
  unitPriceCents: Money;
  options: { id: string; name: string; priceDeltaCents: Money }[];
  subtotalCents: Money;
  taxCents: Money;
  totalCents: Money;
}
export interface Quote {
  currency: string;
  lines: QuoteLine[];
  subtotalCents: Money;
  discountCents: Money;
  taxCents: Money;
  deliveryFeeCents: Money;
  tipCents: Money;
  totalCents: Money;
  zoneId?: string;
  warnings: string[];
  errors: string[];
}

const validCents = (value: number) => Number.isSafeInteger(value) && value >= 0;
const minutes = (hhmm: string) => {
  const [hour = 0, minute = 0] = hhmm.split(":").map(Number);
  return hour * 60 + minute;
};
const isCategoryAvailable = (category: Category | undefined, now: Date) => {
  if (!category?.availableDuring?.length) return true;
  const current = now.getHours() * 60 + now.getMinutes();
  return category.availableDuring.some(
    (window) =>
      window.days.includes(now.getDay()) &&
      current >= minutes(window.from) &&
      current < minutes(window.to),
  );
};
const findZone = (zones: DeliveryZone[], address?: Address) =>
  address &&
  zones.find(
    ({ bounds }) =>
      address.lat <= bounds.north &&
      address.lat >= bounds.south &&
      address.lng <= bounds.east &&
      address.lng >= bounds.west,
  );

/** Fuente única, pura y determinista para todos los totales del pedido. */
export function quote(
  cart: Cart,
  catalog: Catalog,
  store: Store,
  address?: Address,
  coupon?: Coupon,
  now = new Date(),
): Quote {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lines: QuoteLine[] = [];
  if (!store.open) errors.push("STORE_CLOSED");

  for (const item of cart.items) {
    const product = catalog.products.find(({ id }) => id === item.productId);
    if (!product) {
      errors.push(`PRODUCT_NOT_FOUND:${item.productId}`);
      continue;
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      errors.push(`INVALID_QUANTITY:${product.id}`);
      continue;
    }
    if (product.status !== "active") errors.push(`PRODUCT_UNAVAILABLE:${product.id}`);
    if (!isCategoryAvailable(catalog.categories.find(({ id }) => id === product.categoryId), now))
      errors.push(`CATEGORY_UNAVAILABLE:${product.categoryId}`);

    const variant = item.variantId
      ? product.variants?.find(({ id }) => id === item.variantId)
      : undefined;
    if (item.variantId && !variant) errors.push(`VARIANT_NOT_FOUND:${item.variantId}`);
    const selected = new Set(item.optionIds ?? []);
    const selectedOptions: QuoteLine["options"] = [];
    for (const group of product.optionGroups ?? []) {
      const choices = group.options.filter(({ id }) => selected.has(id));
      if (choices.length < group.minSelect || choices.length > group.maxSelect)
        errors.push(`OPTION_GROUP_INVALID:${group.id}`);
      for (const option of choices) {
        if (!option.available) errors.push(`OPTION_UNAVAILABLE:${option.id}`);
        selectedOptions.push(option);
      }
    }
    const knownOptionIds = new Set(
      (product.optionGroups ?? []).flatMap((group) => group.options.map(({ id }) => id)),
    );
    for (const id of selected) if (!knownOptionIds.has(id)) errors.push(`OPTION_NOT_FOUND:${id}`);

    const stock = variant?.stockQty ?? product.stockQty;
    if (product.trackStock && (stock ?? 0) < item.quantity)
      errors.push(`OUT_OF_STOCK:${product.id}`);
    else if (product.trackStock && stock !== undefined && stock - item.quantity <= 1)
      warnings.push(`LOW_STOCK:${product.id}`);

    const unitPriceCents =
      (variant?.priceCents ?? product.basePriceCents) +
      selectedOptions.reduce((sum, option) => sum + option.priceDeltaCents, 0);
    if (!validCents(unitPriceCents)) errors.push(`INVALID_PRICE:${product.id}`);
    const lineGross = unitPriceCents * item.quantity;
    const taxCents = store.pricesIncludeTax
      ? Math.round(lineGross - lineGross / (1 + product.taxRateBp / 10_000))
      : Math.round((lineGross * product.taxRateBp) / 10_000);
    lines.push({
      productId: product.id,
      name: product.name,
      quantity: item.quantity,
      unitPriceCents,
      options: selectedOptions,
      subtotalCents: lineGross,
      taxCents,
      totalCents: store.pricesIncludeTax ? lineGross : lineGross + taxCents,
    });
  }

  const subtotalCents = lines.reduce((sum, line) => sum + line.subtotalCents, 0);
  let discountCents = 0;
  const couponActive =
    coupon &&
    (!coupon.activeFrom || now >= new Date(coupon.activeFrom)) &&
    (!coupon.activeUntil || now <= new Date(coupon.activeUntil));
  if (coupon && !couponActive) errors.push("COUPON_INACTIVE");
  else if (coupon && subtotalCents < (coupon.minSubtotalCents ?? 0)) errors.push("COUPON_MINIMUM");
  else if (coupon) {
    discountCents =
      coupon.kind === "percent"
        ? Math.round((subtotalCents * Math.min(10_000, coupon.value)) / 10_000)
        : coupon.value;
    discountCents = Math.min(
      subtotalCents,
      discountCents,
      coupon.maxDiscountCents ?? Number.MAX_SAFE_INTEGER,
      store.maxDiscountCents ?? Number.MAX_SAFE_INTEGER,
    );
  }

  const taxBeforeDiscount = lines.reduce((sum, line) => sum + line.taxCents, 0);
  const taxCents =
    subtotalCents === 0
      ? 0
      : Math.round((taxBeforeDiscount * (subtotalCents - discountCents)) / subtotalCents);
  let deliveryFeeCents = 0;
  let zoneId: string | undefined;
  if (cart.fulfillment === "delivery") {
    const zone = findZone(store.deliveryZones, address);
    if (!address) errors.push("ADDRESS_REQUIRED");
    else if (!zone) errors.push("OUTSIDE_COVERAGE");
    else {
      zoneId = zone.id;
      if (subtotalCents < zone.minOrderCents) errors.push("DELIVERY_MINIMUM");
      deliveryFeeCents =
        zone.freeOverCents !== undefined && subtotalCents >= zone.freeOverCents
          ? 0
          : zone.feeCents;
    }
  }
  const tipCents = Math.max(0, Math.trunc(cart.tipCents ?? 0));
  const merchandiseTotal = subtotalCents - discountCents + (store.pricesIncludeTax ? 0 : taxCents);
  const totalCents = Math.max(0, merchandiseTotal + deliveryFeeCents + tipCents);
  return {
    currency: store.currency,
    lines,
    subtotalCents,
    discountCents,
    taxCents,
    deliveryFeeCents,
    tipCents,
    totalCents,
    ...(zoneId ? { zoneId } : {}),
    warnings: [...new Set(warnings)],
    errors: [...new Set(errors)],
  };
}

export const orderTransitions = {
  new: { accept: "accepted", reject: "rejected", expire: "expired", cancel: "canceled" },
  accepted: { start: "preparing", cancel: "canceled" },
  preparing: { ready: "ready", cancel: "canceled" },
  ready: { dispatch: "on_the_way", deliver: "delivered", cancel: "canceled" },
  on_the_way: { deliver: "delivered", cancel: "canceled" },
  delivered: { refund: "refunded" },
  rejected: {},
  canceled: { refund: "refunded" },
  expired: {},
  refunded: {},
} as const;

export type OrderStatus = keyof typeof orderTransitions;
export type OrderEvent = "accept" | "reject" | "expire" | "cancel" | "start" | "ready" | "dispatch" | "deliver" | "refund";

export function transition(status: OrderStatus, event: OrderEvent): OrderStatus {
  const next = (orderTransitions[status] as Partial<Record<OrderEvent, OrderStatus>>)[event];
  if (!next) throw new Error(`INVALID_TRANSITION:${status}:${event}`);
  return next;
}
