export default function StoreLoading() {
  return <main className="container section" aria-label="Cargando menú">
    <div className="skeleton-line short" />
    <div className="grid">
      {[1, 2, 3, 4, 5, 6].map((item) => <div className="card skeleton" key={item} />)}
    </div>
  </main>;
}
