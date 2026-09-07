import type { Metadata } from "next";
import { recoverPasswordAction } from "@/app/auth-actions";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = {
  title: "Recuperar contraseña",
  robots: { index: false, follow: false },
};
export default async function RecoverPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthForm
      mode="recover"
      action={recoverPasswordAction}
      defaultEmail={params.email?.slice(0, 254)}
    />
  );
}
