"use client";
import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { api, money, type Menu } from "@/lib/api";

const fallback: Menu = {
  store: { name: "Arepa Express", slug: "arepa-express", open: true, etaMin: 35, currency: "COP" },
  catalog: {
    categories: [{ id: "arepas", name: "Arepas" }, { id: "bebidas", name: "Bebidas" }],
    products: [
      { id: "reina-pepiada", categoryId: "arepas", name: "Reina Pepiada", basePriceCents: 1_800_000, status: "active", stockQty: 30 },
      { id: "pabellon", categoryId: "arepas", name: "Pabellón", basePriceCents: 2_200_000, status: "active", stockQty: 20 },
      { id: "papelon", categoryId: "bebidas", name: "Papelón con limón", basePriceCents: 700_000, status: "active", stockQty: 40 },
    ],
  },
};
type SavedCart = { productId: string; quantity: number }[];
const readCart = (): SavedCart => {
  try {
    const saved = JSON.parse(localStorage.getItem("pedidos-cart") ?? "{}") as { expiresAt?: number; items?: SavedCart };
    return saved.expiresAt && saved.expiresAt > Date.now() ? saved.items ?? [] : [];
  } catch { return []; }
};

export function Storefront({ slug }: { slug: string }) {
  const [menu, setMenu] = useState(fallback);
  const [items, setItems] = useState<SavedCart>([]);
  const [notice, setNotice] = useState("");
  const [qrCode, setQrCode] = useState("");
  useEffect(() => {
    setItems(readCart());
    api<Menu>(`/v1/public/${slug}/menu`).then(setMenu).catch(() => setNotice("Vista demo: inicia la API para sincronizar disponibilidad."));
  }, [slug]);
  useEffect(() => {
    void QRCode.toDataURL(window.location.href, { width: 220, margin: 1, color: { dark: "#172121", light: "#ffffff" } }).then(setQrCode);
  }, [slug]);
  const save = (next: SavedCart) => {
    setItems(next);
    localStorage.setItem("pedidos-cart", JSON.stringify({ items: next, expiresAt: Date.now() + 86_400_000 }));
  };
  const add = (productId: string) => {
    const current = items.find((item) => item.productId === productId);
    save(current ? items.map((item) => item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item) : [...items, { productId, quantity: 1 }]);
  };
  const total = useMemo(() => items.reduce((sum, item) => sum + (menu.catalog.products.find(({ id }) => id === item.productId)?.basePriceCents ?? 0) * item.quantity, 0), [items, menu]);
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const share = async () => {
    const data = { title: menu.store.name, text: `Mira el menú de ${menu.store.name}`, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(data.url);
        setNotice("Enlace copiado. Ya puedes compartirlo.");
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(data.url);
        setNotice("Enlace copiado. Ya puedes compartirlo.");
      } catch { setNotice("No pudimos compartir el enlace."); }
    }
  };
  return <>
    <header className="topbar"><div className="container topbar-inner">
      <Link className="brand" href={`/${slug}`}>◉ {menu.store.name}</Link>
      <nav className="nav"><a href="#menu">Menú</a><span className="chip">● {menu.store.open ? "Abierto" : "Cerrado"} · {menu.store.etaMin} min</span><Link className="panel-link" href="/pedidos">Panel</Link></nav>
    </div></header>
    <section className="hero"><div className="container">
      <div className="eyebrow">Hechas al momento · Entrega local</div>
      <h1>Arepas que llegan calientes.</h1>
      <p className="muted">Elige, personaliza y sigue tu pedido en tiempo real. Sin llamadas ni filas.</p>
      <div className="toolbar"><button className="btn secondary" onClick={() => void share()}>Compartir menú</button>
        <details className="card"><summary>Mostrar código QR</summary>{qrCode && <img src={qrCode} width={220} height={220} alt={`Código QR del menú de ${menu.store.name}`} />}</details>
      </div>
    </div></section>
    <main id="menu" className="container section">
      {notice && <div className="banner">{notice}</div>}
      <div className="categories">{menu.catalog.categories.map((category) => <a className="chip" href={`#${category.id}`} key={category.id}>{category.name}</a>)}</div>
      {menu.catalog.categories.map((category) => <section id={category.id} className="section" key={category.id}>
        <div className="section-title"><h2>{category.name}</h2><span className="muted">{menu.catalog.products.filter(({ categoryId }) => categoryId === category.id).length} productos</span></div>
        <div className="grid">{menu.catalog.products.filter(({ categoryId, status }) => categoryId === category.id && status !== "hidden").map((product) => <article className="card product" key={product.id}>
          <span className="emoji" aria-hidden>{category.name.toLowerCase().includes("bebida") ? "🥤" : "🫓"}</span>
          <h3>{product.name}</h3>{product.description && <p className="muted">{product.description}</p>}
          <p className="price">{money(product.basePriceCents)}</p>
          <button className="btn" disabled={product.status === "sold_out"} onClick={() => add(product.id)}>{product.status === "sold_out" ? "Agotado" : "Agregar"}</button>
        </article>)}</div>
      </section>)}
    </main>
    {count > 0 && <Link className="btn floating" href={`/${slug}/carrito`}>Ver carrito · {count} · {money(total)}</Link>}
  </>;
}
