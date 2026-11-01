"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, money, type Order } from "@/lib/api";

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
  const [loading, setLoading] = useState(true);
  const [sound, setSound] = useState(false);
  const [vibrate, setVibrate] = useState(false);
  const [awake, setAwake] = useState(false);
  const [error, setError] = useState("");
  const previous = useRef(0);
  const audio = useRef<AudioContext | null>(null);
  const wakeLock = useRef<{ release(): Promise<void> } | null>(null);
  const beep = useCallback(() => {
    if (vibrate && "vibrate" in navigator) navigator.vibrate([250, 100, 250]);
    if (!audio.current) return;
    const oscillator = audio.current.createOscillator();
    oscillator.frequency.value = 880;
    oscillator.connect(audio.current.destination);
    oscillator.start();
    oscillator.stop(audio.current.currentTime + 0.18);
  }, [vibrate]);
  const load = useCallback(() => api<Order[]>("/v1/orders", undefined, true).then((next) => {
    const fresh = next.filter(({ status }) => status === "new").length;
    if (fresh > previous.current && previous.current >= 0) beep();
    previous.current = fresh;
    setOrders(next);
    setError("");
  }).catch((cause: Error) => setError(cause.message)).finally(() => setLoading(false)), [beep]);
  useEffect(() => {
    void load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    if (!kitchen || !("wakeLock" in navigator)) return;
    const requestWakeLock = async () => {
      try {
        wakeLock.current = await (navigator as Navigator & { wakeLock: { request(type: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock.request("screen");
        setAwake(true);
      } catch { setAwake(false); }
    };
    void requestWakeLock();
    const resume = () => { if (document.visibilityState === "visible" && !wakeLock.current) void requestWakeLock(); };
    document.addEventListener("visibilitychange", resume);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      void wakeLock.current?.release();
      wakeLock.current = null;
    };
  }, [kitchen]);
  const enableSound = () => {
    audio.current = new AudioContext();
    void audio.current.resume();
    setSound(true);
    beep();
  };
  const toggleVibrate = () => {
    const enabled = !vibrate;
    setVibrate(enabled);
    if (enabled && "vibrate" in navigator) navigator.vibrate(120);
  };
  const move = async (order: Order, event: string) => {
    try {
      await api(`/v1/orders/${order.id}/transition`, { method: "PATCH", body: JSON.stringify({ event, version: order.version, actor: "panel" }) }, true);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo cambiar el estado."); await load(); }
  };
  const visible = kitchen ? orders.filter(({ status }) => ["new","accepted","preparing"].includes(status)) : orders;
  return <><div className="section-title"><div><div className="eyebrow">{kitchen ? "Pantalla de producción" : "Operación en vivo"}</div><h1>{kitchen ? "Cocina" : "Pedidos"}</h1></div><span className="chip">● Actualiza cada 10 s {kitchen && `· ${awake ? "Pantalla activa" : "Bloqueo no disponible"}`}</span></div>
    <div className="toolbar"><button className={`btn ${sound ? "success" : ""}`} onClick={enableSound}>{sound ? "✓ Sonido activo" : "🔔 Activar sonido"}</button>{kitchen && <button className={`btn ${vibrate ? "success" : "secondary"}`} aria-pressed={vibrate} onClick={toggleVibrate}>{vibrate ? "✓ Vibración activa" : "📳 Activar vibración"}</button>}<button className="btn secondary" onClick={() => void load()}>Actualizar</button><button className="btn secondary" onClick={() => window.print()}>Imprimir</button></div>
    {!sound && <div className="banner">Activa el sonido para enterarte apenas llegue un pedido nuevo.</div>}
    {error && <div className="banner" role="alert"><strong>No pudimos actualizar los pedidos.</strong> Revisa la conexión y <button className="btn secondary" onClick={() => void load()}>vuelve a intentar</button>.</div>}
    {loading ? <div className="kitchen" aria-label="Cargando pedidos">{[1,2,3].map((item) => <div className="card skeleton" key={item} />)}</div> :
    kitchen ? <div className="kitchen">{visible.map((order) => <OrderCard key={order.id} order={order} move={move} kitchen />)}{!visible.length && !error && <div className="card empty"><h2>Todo al día</h2><p className="muted">No hay pedidos en preparación por ahora.</p></div>}</div> :
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
