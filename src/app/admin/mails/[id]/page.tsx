import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { loadMailSamples } from "../samples";
import { MailDetail } from "../views";

export const metadata = { title: "Mails" };

export default async function AdminMailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("/admin/mails");
  const { id } = await params;
  const samples = await loadMailSamples();
  const index = samples.findIndex((sample) => sample.id === id);
  if (index === -1) notFound();
  return <MailDetail samples={samples} index={index} />;
}
