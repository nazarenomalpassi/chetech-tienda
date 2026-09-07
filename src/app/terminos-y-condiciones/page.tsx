import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal-document-page";
import { legalDocuments } from "@/config/legal";
export const metadata: Metadata = {
  title: "Términos y condiciones",
  alternates: { canonical: "/terminos-y-condiciones" },
};
export default function Page() {
  return <LegalDocumentPage document={legalDocuments["terminos-y-condiciones"]} />;
}
