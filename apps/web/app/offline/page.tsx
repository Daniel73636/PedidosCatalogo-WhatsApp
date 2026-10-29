import Link from "next/link";
export default function Offline(){return <main className="container section"><div className="card empty"><div style={{fontSize:"4rem"}}>📡</div><h1>Estás sin conexión</h1><p className="muted">Puedes volver a las pantallas visitadas. Los cambios se sincronizarán al recuperar internet.</p><Link className="btn" href="/arepa-express">Reintentar</Link></div></main>}
