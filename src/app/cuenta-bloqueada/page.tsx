import Link from "next/link";
import { siteConfig } from "@/config/site";

export default function BlockedAccountPage() {
  return (
    <section className="section shell empty-state">
      <p className="eyebrow">Acceso restringido</p>
      <h1>Tu cuenta no está activa</h1>
      <p>
        Para revisar el estado o ejercer tus derechos de privacidad, escribinos a{" "}
        <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>.
      </p>
      <Link className="button primary" href="/">
        Volver al inicio
      </Link>
    </section>
  );
}
