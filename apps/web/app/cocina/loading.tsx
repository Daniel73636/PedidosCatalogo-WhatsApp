export default function KitchenLoading() {
  return <div className="kitchen" aria-label="Cargando cocina">
    {[1, 2, 3].map((item) => <div className="card skeleton" key={item} />)}
  </div>;
}
