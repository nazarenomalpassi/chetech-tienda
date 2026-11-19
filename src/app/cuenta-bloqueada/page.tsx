import Link from "next/link";
import { siteConfig } from "@/config/site";
import styles from "@/components/auth-form.module.css";

export default function BlockedAccountPage() {
  return (
    <div className={`page ${styles.page}`}>
      <header className={styles.head}>
        <h1>Tu cuenta no está activa</h1>
        <p>
          Para revisar qué pasó o pedir tus datos, escribinos a{" "}
          <a href={`mailto:${siteConfig.email}`} className="enlace">
            {siteConfig.email}
          </a>
          .
        </p>
        <p>
          <Link className="btn" href="/">
            Volver al inicio
          </Link>
        </p>
      </header>
    </div>
  );
}
