import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal-document-page";
import { CookieChoiceButton } from "@/components/store/cookie-choice-button";
import { legalDocuments } from "@/config/legal";

export const metadata: Metadata = {
  title: "Política de cookies",
  alternates: { canonical: "/cookies" },
};

// El aviso de cookies aparece solo si hay medición configurada; el botón para cambiar la elección, también.
const measuring = Boolean(process.env.NEXT_PUBLIC_GA_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID);

export default function Page() {
  return (
    <LegalDocumentPage
      document={legalDocuments.cookies}
      extra={measuring ? <CookieChoiceButton /> : null}
    />
  );
}
