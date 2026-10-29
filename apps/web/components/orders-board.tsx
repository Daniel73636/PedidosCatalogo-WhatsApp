"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ADMIN_KEY, API_URL, api, money, type Order } from "@/lib/api";

const columns = [
  { id: "new", label: "Nuevos" },
  { id: "accepted", label: "Aceptados" },
  { id: "preparing", label: "Preparando" },
  { id: "ready", label: "Listos" },
];
const action: Record<string, { event: string; label: string }> = {
  new: { event: "accept", label: "Aceptar pedido" },
  accepted: { event: "start", label: "Empezar" },
  preparing: { event: "ready", label: "Marcar listo" },
  ready: { event: "deliver", label: "Entregado" },
};
export function OrdersBoard({ kitchen = false }: { kitchen?: boolean }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [sound, setSound] = useState(false);
  const [error, setError] = useState("");
  const previous = useRef(0);
  const audio = useRef<AudioContext | null>(null);
  const beep = useCallback(() => {
    if (!audio.current) return;
    const oscillator = audio.current.createOscillator();
    oscillator.frequency.value = 880;
    oscillator.connect(audio.current.destination);
    oscillator.start();
    oscillator.stop(audio.current.currentTime + 0.18);
  }, []);
  const load = useCallback(() => api<Order[]>("/v1/orders", undefined, true).then((next) => {
    const fresh = next.filter(({ status }) => status === "new").length;
    if (fresh > previous.current && previous.current >= 0) beep();
    previous.current = fresh;
    setOrders(next);
  }).catch((cause: Error) => setError(cause.message)), [beep]);
  useEffect(() => {
    void load();
    const timer = setInterval(load, 10_000);
    const stream = new EventSource(`${API_URL}/v1/events?key=${ADMIN_KEY}`);
    stream.addEventListener("order.new", () => void load());
    stream.addEventListener("order.updated", () => void load());
    return () => { clearInterval(timer); stream.close(); };
  }, [load]);
  const enableSound = () => {
    audio.current = new AudioContext();
    void audio.current.resume();
    setSound(true);
    beep();
  };
  const move = async (order: Order, event: string) => {
    try {
      await api(`/v1/orders/${order.id}/transition`, { method: "PATCH", body: JSON.stringify({ event, version: order.version, actor: "panel" }) }, true);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo cambiar el estado."); await load(); }
  };
  const visible = kitchen ? orders.filter(({ status }) => ["accepted","preparing"].includes(status)) : orders;
  return <><div className="section-title"><div><div className="eyebrow">{kitchen ? "Pantalla de producción" : "Operación en vivo"}</div><h1>{kitchen ? "Cocina" : "Pedidos"}</h1></div><span className="chip">● Actualiza cada 10 s</span></div>
    <div className="toolbar"><button className={`btn ${sound ? "success" : ""}`} onClick={enableSound}>{sound ? "✓ Sonido activo" : "🔔 Activar sonido"}</button><button className="btn secondary" onClick={() => void load()}>Actualizar</button><button className="btn secondary" onClick={() => window.print()}>Imprimir</button></div>
    {!sound && <div className="banner">Activa el sonido para escuchar los pedidos nuevos. Los navegadores exigen una interacción inicial.</div>}{error && <div className="banner">{error}</div>}
    {kitchen ? <div className="kitchen">{visible.map((order) => <OrderCard key={order.id} order={order} move={move} kitchen />)}{!visible.length && <div className="card empty">No hay pedidos en preparación.</div>}</div> :
    <div className="board">{columns.map((column) => <section className="column" key={column.id}><h3>{column.label} · {visible.filter(({ status }) => status === column.id).length}</h3>{visible.filter(({ status }) => status === column.id).map((order) => <OrderCard key={order.id} order={order} move={move} />)}</section>)}</div>}</>;
}
function OrderCard({ order, move, kitchen }: { order: Order; move(order: Order, event: string): void; kitchen?: boolean }) {
  const next = action[order.status];
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60_000));
  return <article className="order-card"><div style={{display:"flex",justifyContent:"space-between"}}><strong>#{order.number} · {order.customer.name}</strong><span className="chip">{minutes} min</span></div>
    <div className="order-meta"><span>{order.cart.fulfillment === "delivery" ? "🛵 Domicilio" : "🥡 Recoger"}</span><span>{money(order.quote.totalCents)}</span></div>
    <ul>{order.cart.items.map((item) => <li key={item.productId}>{item.quantity}× {item.productId.replaceAll("-"," ")}</li>)}</ul>
    {next && <div className="order-actions"><button className="btn big-btn success" onClick={() => move(order, next.event)}>{next.label}</button>{!kitchen && order.status === "new" && <button className="btn big-btn secondary" onClick={() => move(order, "reject")}>Rechazar</button>}</div>}</article>;
}
