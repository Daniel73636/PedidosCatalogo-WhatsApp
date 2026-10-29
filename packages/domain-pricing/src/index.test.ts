import { describe, expect, it } from "vitest";
import { quote, transition, type Catalog, type Store } from "./index.js";

const catalog: Catalog = {
  categories: [{ id: "arepas", name: "Arepas" }],
  products: [
    {
      id: "reina",
      categoryId: "arepas",
      name: "Reina Pepiada",
      basePriceCents: 1800,
      taxRateBp: 1900,
      status: "active",
      trackStock: true,
      stockQty: 5,
      variants: [{ id: "grande", name: "Grande", priceCents: 2400 }],
      optionGroups: [
        {
          id: "salsas",
          name: "Salsa",
          minSelect: 1,
          maxSelect: 2,
          options: [
            { id: "ajo", name: "Ajo", priceDeltaCents: 200, available: true },
            { id: "picante", name: "Picante", priceDeltaCents: 100, available: true },
          ],
        },
      ],
    },
  ],
};
const store: Store = {
  currency: "COP",
  pricesIncludeTax: true,
  open: true,
  deliveryZones: [
    {
      id: "centro",
      name: "Centro",
      feeCents: 500,
      minOrderCents: 1000,
      freeOverCents: 5000,
      bounds: { north: 5, south: 4, east: -73, west: -75 },
    },
  ],
};

describe("quote", () => {
  it("calcula variante, adicionales, impuesto incluido y entrega", () => {
    const result = quote(
      {
        fulfillment: "delivery",
        items: [{ productId: "reina", variantId: "grande", optionIds: ["ajo"], quantity: 2 }],
      },
      catalog,
      store,
      { lat: 4.6, lng: -74.1 },
    );
    expect(result.errors).toEqual([]);
    expect(result.subtotalCents).toBe(5200);
    expect(result.deliveryFeeCents).toBe(0);
    expect(result.taxCents).toBe(830);
    expect(result.totalCents).toBe(5200);
  });

  it("aplica cupón porcentual con tope", () => {
    const result = quote(
      { fulfillment: "pickup", items: [{ productId: "reina", optionIds: ["ajo"], quantity: 2 }] },
      catalog,
      store,
      undefined,
      { code: "HOLA", kind: "percent", value: 5000, maxDiscountCents: 1000 },
    );
    expect(result.discountCents).toBe(1000);
    expect(result.totalCents).toBe(3000);
  });

  it("bloquea stock insuficiente, opciones inválidas y cobertura", () => {
    const result = quote(
      { fulfillment: "delivery", items: [{ productId: "reina", quantity: 10 }] },
      catalog,
      store,
      { lat: 1, lng: 1 },
    );
    expect(result.errors).toEqual(
      expect.arrayContaining(["OUT_OF_STOCK:reina", "OPTION_GROUP_INVALID:salsas", "OUTSIDE_COVERAGE"]),
    );
  });

  it("nunca devuelve descuento o total negativo", () => {
    const result = quote(
      { fulfillment: "pickup", items: [{ productId: "reina", optionIds: ["ajo"], quantity: 1 }] },
      catalog,
      store,
      undefined,
      { code: "TODO", kind: "fixed", value: 999_999 },
    );
    expect(result.discountCents).toBe(result.subtotalCents);
    expect(result.totalCents).toBe(0);
  });
});

describe("transition", () => {
  it("recorre preparación y entrega", () => {
    expect(transition("new", "accept")).toBe("accepted");
    expect(transition("accepted", "start")).toBe("preparing");
    expect(transition("preparing", "ready")).toBe("ready");
    expect(transition("ready", "dispatch")).toBe("on_the_way");
    expect(transition("on_the_way", "deliver")).toBe("delivered");
  });

  it("rechaza transiciones inválidas", () => {
    expect(() => transition("new", "deliver")).toThrow("INVALID_TRANSITION");
  });
});
