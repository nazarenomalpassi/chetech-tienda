import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal-document-page";
import { legalDocuments } from "@/config/legal";
export const metadata: Metadata = {
  title: "Política de privacidad",
  alternates: { canonical: "/privacidad" },
};
export default function Page() {
  return <LegalDocumentPage document={legalDocuments.privacidad} />;
}
