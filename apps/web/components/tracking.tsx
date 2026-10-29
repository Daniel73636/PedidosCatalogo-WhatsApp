"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { API_URL, api, money, type Order } from "@/lib/api";

const stages = ["new", "accepted", "preparing", "ready", "on_the_way", "delivered"];
const labels: Record<string, string> = { new: "Recibido", accepted: "Aceptado", preparing: "Preparando", ready: "Listo", on_the_way: "En camino", delivered: "Entregado", rejected: "Rechazado", canceled: "Cancelado", expired: "Expirado", refunded: "Reembolsado" };
export function Tracking({ token }: { token: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api<Order>(`/v1/public/orders/${token}`).then(setOrder).catch((cause: Error) => setError(cause.message)), [token]);
  useEffect(() => {
    void load();
    const timer = setInterval(load, 15_000);
    const stream = new EventSource(`${API_URL}/v1/public/orders/${token}/events`);
    stream.addEventListener("order.updated", () => void load());
    return () => { clearInterval(timer); stream.close(); };
  }, [load, token]);
  if (error) return <main className="container section"><div className="banner">{error}</div></main>;
  if (!order) return <main className="container section"><p>Cargando tu pedido…</p></main>;
  const position = stages.indexOf(order.status);
  return <><header className="topbar"><div className="container topbar-inner"><Link className="brand" href="/arepa-express">◉ Arepa Express</Link><span className="chip">Actualización en vivo</span></div></header>
    <main className="container section" style={{ maxWidth: 850 }}><div className="eyebrow">Pedido #{order.number}</div><h1>{labels[order.status] ?? order.status}</h1><p className="muted">Hola, {order.customer.name}. Aquí puedes seguir tu pedido.</p>
      <div className="statusline">{stages.map((stage, index) => <div className={`step ${index <= position ? "done" : ""}`} key={stage}>{labels[stage]}</div>)}</div>
      <div className="grid section"><section className="card"><h2>Resumen</h2><div className="summary"><div><span>Tipo</span><strong>{order.cart.fulfillment === "delivery" ? "Domicilio" : "Recoger"}</strong></div><div><span>Pago</span><strong>{order.paymentMethod}</strong></div><div className="total"><span>Total</span><span>{money(order.quote.totalCents)}</span></div></div></section>
      <section className="card"><h2>Historial</h2>{[...order.events].reverse().map((event) => <div className="cart-line" key={`${event.at}-${event.to}`}><div><strong>{labels[event.to] ?? event.to}</strong><div className="muted">{new Date(event.at).toLocaleString("es-CO")}</div></div></div>)}</section></div>
    </main></>;
}
