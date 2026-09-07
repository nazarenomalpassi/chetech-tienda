export default function RepairsLoading() {
  return (
    <div className="repair-loading" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Cargando reparaciones…</span>
      <div className="repair-loading-heading">
        <span />
        <span />
        <span />
      </div>
      <div className="repair-loading-grid" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
    </div>
  );
}
