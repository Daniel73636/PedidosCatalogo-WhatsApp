export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  basePriceCents: number;
  status: "active" | "sold_out" | "hidden";
  stockQty?: number;
}
export interface Menu {
  store: { name: string; slug: string; open: boolean; etaMin: number; currency: string };
  catalog: { categories: { id: string; name: string }[]; products: Product[] };
}
export interface Order {
  id: string;
  token: string;
  number: number;
  status: string;
  version: number;
  customer: { name: string; phone: string };
  cart: { fulfillment: string; items: { productId: string; quantity: number }[] };
  paymentMethod: string;
  quote: { totalCents: number; subtotalCents: number; deliveryFeeCents: number; discountCents: number };
  createdAt: string;
  updatedAt: string;
  events: { from: string | null; to: string; actor: string; at: string }[];
}
export const money = (cents: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(cents / 100);

export async function api<T>(path: string, init?: RequestInit, admin = false): Promise<T> {
  const accessToken = admin && typeof window !== "undefined" ? localStorage.getItem("pedidos-access-token") : null;
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { detail?: string };
    throw new Error(body.detail ?? `Error ${response.status}`);
  }
  return response.json() as Promise<T>;
}
