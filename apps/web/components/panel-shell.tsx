import Link from "next/link";
const links = [["/pedidos","Pedidos"],["/cocina","Cocina"],["/catalogo","Catálogo"],["/importar","Importar"],["/zonas","Zonas"],["/promos","Promos"],["/clientes","Clientes"],["/reportes","Reportes"],["/ajustes","Ajustes"]];
export function PanelShell({ children }: { children: React.ReactNode }) {
  return <div className="panel-shell"><aside className="sidebar"><Link className="brand" href="/pedidos">◉ Arepa Express</Link><nav>{links.map(([href,label]) => <Link href={href!} key={href}>{label}</Link>)}</nav><Link href="/arepa-express" style={{ display:"block",padding:13,marginTop:20,color:"#ffb089" }}>Ver tienda ↗</Link></aside><main className="main">{children}</main></div>;
}
