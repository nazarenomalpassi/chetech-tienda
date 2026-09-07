import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, FileText } from "lucide-react";
import { legalConfig, legalLinks } from "@/config/legal";

export const metadata: Metadata = {
  title: "Centro legal",
  description: "Políticas legales, comerciales y de privacidad de Chetech.",
  alternates: { canonical: "/legal" },
};

export default function LegalCenterPage() {
  return (
    <section className="section shell legal-center">
      <p className="eyebrow">Información clara</p>
      <h1>Centro legal</h1>
      <p className="lead">
        Encontrá las condiciones comerciales, políticas de privacidad y canales para ejercer tus
        derechos.
      </p>
      <div className="legal-link-grid">
        {legalLinks.map((link, index) => (
          <Link key={link.href} href={link.href}>
            <FileText />
            <small>{String(index + 1).padStart(2, "0")}</small>
            <strong>{link.label}</strong>
            <ArrowUpRight />
          </Link>
        ))}
      </div>
      <p className="legal-center-meta">
        Versión {legalConfig.version} · Actualizada el {legalConfig.lastUpdated}
      </p>
    </section>
  );
}
