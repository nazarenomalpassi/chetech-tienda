import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal-document-page";
import { legalDocuments } from "@/config/legal";
export const metadata: Metadata = {
  title: "Medios de pago",
  alternates: { canonical: "/medios-de-pago" },
};
export default function Page() {
  return <LegalDocumentPage document={legalDocuments["medios-de-pago"]} />;
}
