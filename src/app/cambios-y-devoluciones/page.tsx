import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal-document-page";
import { legalDocuments } from "@/config/legal";
export const metadata: Metadata = {
  title: "Cambios y devoluciones",
  alternates: { canonical: "/cambios-y-devoluciones" },
};
export default function Page() {
  return <LegalDocumentPage document={legalDocuments["cambios-y-devoluciones"]} />;
}
