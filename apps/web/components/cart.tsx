"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, money, type Menu } from "@/lib/api";

type Item = { productId: string; quantity: number };
export function Cart({ slug }: { slug: string }) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    api<Menu>(`/v1/public/${slug}/menu`).then(setMenu).catch(() => undefined);
    try { setItems((JSON.parse(localStorage.getItem("pedidos-cart") ?? "{}") as { items?: Item[] }).items ?? []); } catch { /* vacío */ }
  }, [slug]);
  const persist = (next: Item[]) => {
    setItems(next);
    localStorage.setItem("pedidos-cart", JSON.stringify({ items: next, expiresAt: Date.now() + 86_400_000 }));
  };
  const total = useMemo(() => items.reduce((sum, item) => sum + (menu?.catalog.products.find(({ id }) => id === item.productId)?.basePriceCents ?? 0) * item.quantity, 0), [items, menu]);
  return <><header className="topbar"><div className="container topbar-inner"><Link className="brand" href={`/${slug}`}>← Seguir comprando</Link><strong>Tu carrito</strong></div></header>
    <main className="container section" style={{ maxWidth: 760 }}>
      <div className="section-title"><div><div className="eyebrow">Paso 1 de 2</div><h1>Revisa tu pedido</h1></div></div>
      {!items.length ? <div className="card empty"><h2>Tu carrito está vacío</h2><p className="muted">Agrega algo rico del menú.</p><Link className="btn" href={`/${slug}`}>Ver menú</Link></div> :
      <div className="card">{items.map((item) => {
        const product = menu?.catalog.products.find(({ id }) => id === item.productId);
        return <div className="cart-line" key={item.productId}><div><strong>{product?.name ?? item.productId}</strong><div className="muted">{money((product?.basePriceCents ?? 0) * item.quantity)}</div></div>
          <button className="btn secondary" aria-label="Restar" onClick={() => persist(item.quantity === 1 ? items.filter((entry) => entry.productId !== item.productId) : items.map((entry) => entry.productId === item.productId ? { ...entry, quantity: entry.quantity - 1 } : entry))}>−</button>
          <span><strong>{item.quantity}</strong> <button className="btn secondary" aria-label="Sumar" onClick={() => persist(items.map((entry) => entry.productId === item.productId ? { ...entry, quantity: entry.quantity + 1 } : entry))}>+</button></span>
        </div>;
      })}<div className="summary section"><div><span>Subtotal</span><strong>{money(total)}</strong></div><p className="muted">El envío y descuentos se confirman en el siguiente paso.</p><Link className="btn" href={`/${slug}/pagar`}>Continuar al pago</Link></div></div>}
    </main></>;
}
