"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { api, money, type Order } from "@/lib/api";

type CartItem = { productId: string; quantity: number };
type Quote = { subtotalCents: number; discountCents: number; taxCents: number; deliveryFeeCents: number; totalCents: number; errors: string[] };
export function Checkout({ slug }: { slug: string }) {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">("delivery");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [couponCode, setCoupon] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    try { setItems((JSON.parse(localStorage.getItem("pedidos-cart") ?? "{}") as { items?: CartItem[] }).items ?? []); } catch { /* vacío */ }
  }, []);
  useEffect(() => {
    if (!items.length) return;
    const timer = setTimeout(() => api<Quote>(`/v1/public/${slug}/quote`, {
      method: "POST",
      body: JSON.stringify({ cart: { items, fulfillment }, address: fulfillment === "delivery" ? { label: "Dirección por confirmar", lat: 4.65, lng: -74.08 } : undefined, couponCode: couponCode || undefined }),
    }).then(setQuote).catch((cause: Error) => setError(cause.message)), 250);
    return () => clearTimeout(timer);
  }, [couponCode, fulfillment, items, slug]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!quote || quote.errors.length) return;
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const order = await api<Order>(`/v1/public/${slug}/orders`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          cart: { items, fulfillment },
          address: fulfillment === "delivery" ? { label: String(form.get("address")), lat: 4.65, lng: -74.08 } : undefined,
          couponCode: couponCode || undefined,
          expectedTotalCents: quote.totalCents,
          customer: { name: form.get("name"), phone: form.get("phone"), privacyConsent: true, privacyPolicyVersion: "2026-11-01" },
          paymentMethod: form.get("payment"),
          notes: form.get("notes") || undefined,
        }),
      });
      localStorage.removeItem("pedidos-cart");
      router.push(`/pedido/${order.token}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos crear el pedido."); setBusy(false); }
  };
  return <><header className="topbar"><div className="container topbar-inner"><Link className="brand" href={`/${slug}/carrito`}>← Volver al carrito</Link><strong>Pago seguro</strong></div></header>
    <main className="container section" style={{ maxWidth: 900 }}><div className="section-title"><div><div className="eyebrow">Paso 2 de 2</div><h1>Confirma tus datos</h1></div></div>
      {error && <div className="banner">{error}</div>}
      {!items.length ? <div className="card empty"><h2>No hay productos</h2><Link className="btn" href={`/${slug}`}>Volver al menú</Link></div> :
      <form className="grid" onSubmit={submit}><div className="card form">
        <div className="field"><label htmlFor="fulfillment">¿Cómo lo recibes?</label><select id="fulfillment" value={fulfillment} onChange={(e) => setFulfillment(e.target.value as "delivery" | "pickup")}><option value="delivery">Entrega a domicilio</option><option value="pickup">Recoger en el local</option></select></div>
        {fulfillment === "delivery" && <div className="field"><label htmlFor="address">Dirección</label><input required id="address" name="address" placeholder="Calle 10 # 20-30, apto 4" /></div>}
        <div className="field"><label htmlFor="name">Nombre</label><input required minLength={2} id="name" name="name" autoComplete="name" /></div>
        <div className="field"><label htmlFor="phone">WhatsApp</label><input required pattern="\+?[1-9][0-9]{7,14}" id="phone" name="phone" defaultValue="+57300" autoComplete="tel" /></div>
        <div className="field"><label htmlFor="payment">Medio de pago</label><select id="payment" name="payment"><option value="cash">Efectivo</option><option value="transfer">Transferencia</option><option value="wallet">Billetera</option></select></div>
        <div className="field"><label htmlFor="notes">Notas (opcional)</label><textarea id="notes" name="notes" maxLength={500} /></div>
        <div className="field"><label><input required type="checkbox" name="privacyConsent" /> Autorizo el tratamiento de mis datos para gestionar este pedido, según la política de privacidad.</label></div>
      </div><aside className="card form"><h2>Resumen</h2><div className="field"><label htmlFor="coupon">Cupón</label><input id="coupon" value={couponCode} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="AREPA10" /></div>
        {!quote ? <p className="muted">Calculando…</p> : <div className="summary"><div><span>Productos</span><span>{money(quote.subtotalCents)}</span></div><div><span>Descuento</span><span>−{money(quote.discountCents)}</span></div><div><span>Envío</span><span>{money(quote.deliveryFeeCents)}</span></div><div className="total"><span>Total</span><span>{money(quote.totalCents)}</span></div>{quote.errors.map((item) => <div className="banner" key={item}>{item}</div>)}</div>}
        <button className="btn big-btn" disabled={busy || !quote || !!quote.errors.length}>{busy ? "Enviando pedido…" : "Confirmar pedido"}</button><small className="muted">Al confirmar, recibirás actualizaciones por WhatsApp (simulado en desarrollo).</small>
      </aside></form>}</main></>;
}
