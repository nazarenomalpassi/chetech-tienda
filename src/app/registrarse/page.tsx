import type { Metadata } from "next";
import { signupAction } from "@/app/auth-actions";
import { AuthForm } from "@/components/auth-form";
import { safeReturnPath } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Crear cuenta",
  robots: { index: false, follow: false },
};
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthForm mode="signup" action={signupAction} next={safeReturnPath(params.next, "/cuenta")} />
  );
}
