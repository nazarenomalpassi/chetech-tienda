import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal-document-page";
import { legalDocuments } from "@/config/legal";
export const metadata: Metadata = {
  title: "Envíos y entregas",
  alternates: { canonical: "/envios" },
};
export default function Page() {
  return <LegalDocumentPage document={legalDocuments.envios} />;
}
