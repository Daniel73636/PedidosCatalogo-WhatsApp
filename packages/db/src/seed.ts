import { createDb } from "./index.js";
import { categories, deliveryZones, optionGroups, options, productOptionGroups, products, stores } from "./schema.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const ids = {
  store: "22222222-2222-4222-8222-222222222222",
  arepas: "33333333-3333-4333-8333-333333333333",
  bebidas: "44444444-4444-4444-8444-444444444444",
  reina: "55555555-5555-4555-8555-555555555555",
  pabellon: "66666666-6666-4666-8666-666666666666",
  papelon: "77777777-7777-4777-8777-777777777777",
  salsas: "88888888-8888-4888-8888-888888888888",
  ajo: "99999999-9999-4999-8999-999999999999",
  picante: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  zone: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};

const { db, close } = createDb();
await db.transaction(async (tx) => {
  await tx.insert(stores).values({
    id: ids.store,
    tenantId,
    slug: "arepa-express",
    name: "Arepa Express",
    status: "open",
    settings: { pricesIncludeTax: true, phone: "+573001234567" },
  }).onConflictDoNothing();
  await tx.insert(categories).values([
    { id: ids.arepas, tenantId, name: "Arepas", position: 1 },
    { id: ids.bebidas, tenantId, name: "Bebidas", position: 2 },
  ]).onConflictDoNothing();
  await tx.insert(products).values([
    { id: ids.reina, tenantId, categoryId: ids.arepas, name: "Reina Pepiada", description: "Pollo, aguacate y mayonesa de la casa", basePriceCents: 1800000, taxRateBp: 800, trackStock: true, stockQty: "30", tags: ["favorita"] },
    { id: ids.pabellon, tenantId, categoryId: ids.arepas, name: "Pabellón", description: "Carne mechada, frijoles, plátano y queso", basePriceCents: 2200000, taxRateBp: 800, trackStock: true, stockQty: "20", tags: ["completa"] },
    { id: ids.papelon, tenantId, categoryId: ids.bebidas, name: "Papelón con limón", description: "Refrescante bebida artesanal", basePriceCents: 700000, taxRateBp: 1900, trackStock: true, stockQty: "40", tags: ["bebida"] },
  ]).onConflictDoNothing();
  await tx.insert(optionGroups).values({ id: ids.salsas, tenantId, name: "Salsas", minSelect: 0, maxSelect: 2 }).onConflictDoNothing();
  await tx.insert(options).values([
    { id: ids.ajo, groupId: ids.salsas, name: "Salsa de ajo", priceDeltaCents: 0 },
    { id: ids.picante, groupId: ids.salsas, name: "Picante", priceDeltaCents: 0 },
  ]).onConflictDoNothing();
  await tx.insert(productOptionGroups).values([
    { productId: ids.reina, groupId: ids.salsas },
    { productId: ids.pabellon, groupId: ids.salsas },
  ]).onConflictDoNothing();
  await tx.insert(deliveryZones).values({
    id: ids.zone,
    tenantId,
    name: "Zona centro",
    bounds: { north: 4.72, south: 4.55, east: -74.02, west: -74.18 },
    feeCents: 500000,
    minOrderCents: 1500000,
    freeOverCents: 5000000,
    etaMin: 35,
  }).onConflictDoNothing();
});
await close();
console.log("Seed Arepa Express cargado.");
