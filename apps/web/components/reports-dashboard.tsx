"use client";
import { useEffect, useState } from "react";
import { API_URL, api, money } from "@/lib/api";

interface Summary {
  orders: number;
  salesCents: number;
  salesByHour: { hour: number; salesCents: number }[];
  topProducts: { name: string; quantity: number }[];
}

export function ReportsDashboard() {
  const [summary, setSummary] = useState<Summary>();
  const [error, setError] = useState("");
  const load = () => api<Summary>("/v1/reports/summary", undefined, true).then(setSummary).catch((cause: Error) => setError(cause.message));
  useEffect(() => { void load(); }, []);
  const download = async () => {
    const token = localStorage.getItem("pedidos-access-token");
    const response = await fetch(`${API_URL}/v1/reports/orders.csv`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    if (!response.ok) return setError("No pudimos descargar el reporte.");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(await response.blob());
    link.download = "pedidos.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return <>
    <div className="section-title"><div><div className="eyebrow">Analítica</div><h1>Reportes</h1><p className="muted">Ventas entregadas y productos más pedidos.</p></div><button className="btn" onClick={() => void download()}>Descargar CSV</button></div>
    {error && <div className="banner" role="alert">{error} <button className="btn secondary" onClick={load}>Reintentar</button></div>}
    {!summary ? <div className="grid">{[1,2,3].map((item) => <div className="card skeleton" key={item} />)}</div> : <>
      <div className="grid"><div className="card"><div className="muted">Ventas entregadas</div><h2>{money(summary.salesCents)}</h2></div><div className="card"><div className="muted">Pedidos totales</div><h2>{summary.orders}</h2></div></div>
      <div className="grid section"><section className="card"><h2>Ventas por hora</h2>{summary.salesByHour.length ? <ul>{summary.salesByHour.map((row) => <li key={row.hour}>{String(row.hour).padStart(2, "0")}:00 · {money(row.salesCents)}</li>)}</ul> : <p className="muted">Aún no hay ventas entregadas.</p>}</section>
        <section className="card"><h2>Productos destacados</h2>{summary.topProducts.length ? <ol>{summary.topProducts.map((row) => <li key={row.name}>{row.name} · {row.quantity}</li>)}</ol> : <p className="muted">Los productos aparecerán cuando entregues pedidos.</p>}</section></div>
    </>}
  </>;
}
