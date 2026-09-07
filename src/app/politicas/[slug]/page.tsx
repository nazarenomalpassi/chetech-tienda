import { notFound, permanentRedirect } from "next/navigation";

type Props = { params: Promise<{ slug: string }> };

export default async function PolicyPage({ params }: Props) {
  if ((await params).slug !== "garantias") notFound();
  permanentRedirect("/garantias");
}
