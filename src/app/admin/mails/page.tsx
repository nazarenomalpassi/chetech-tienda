import { requireAdmin } from "@/lib/auth";
import { mailEnabled } from "@/lib/mail/outbox";
import { loadMailSamples } from "./samples";
import { MailsOverview } from "./views";

export const metadata = { title: "Mails" };

export default async function AdminMailsPage() {
  const admin = await requireAdmin("/admin/mails");
  const samples = await loadMailSamples();
  return <MailsOverview samples={samples} email={admin.email} sending={mailEnabled()} />;
}
