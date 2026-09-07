import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal-document-page";
import { legalDocuments } from "@/config/legal";
export const metadata: Metadata = { title: "Garantías", alternates: { canonical: "/garantias" } };
export default function Page() {
  return <LegalDocumentPage document={legalDocuments.garantias} />;
}
