import type { Metadata } from "next";
import { resendVerificationAction } from "@/app/auth-actions";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = {
  title: "Verificar correo",
  robots: { index: false, follow: false },
};
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthForm
      mode="verify"
      action={resendVerificationAction}
      defaultEmail={params.email?.slice(0, 254)}
    />
  );
}
