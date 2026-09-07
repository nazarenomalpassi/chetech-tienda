import Link from "next/link";
export default function NotFound() {
  return (
    <section className="section shell empty-cart">
      <span className="error-code">404</span>
      <h1>No encontramos esta página.</h1>
      <p>Volvé al inicio o explorá nuestro catálogo.</p>
      <Link className="button primary" href="/">
        Volver al inicio
      </Link>
    </section>
  );
}
