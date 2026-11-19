import Link from "next/link";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <div className={`page ${styles.page}`}>
      <p className={styles.code} aria-hidden>
        404
      </p>
      <h1>No encontramos esta página</h1>
      <p>Puede que el enlace esté mal escrito o que el producto ya no esté publicado.</p>
      <div className={styles.actions}>
        <Link className="btn" href="/productos">
          Ver productos
        </Link>
        <Link className="btn" data-variant="secondary" href="/">
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
