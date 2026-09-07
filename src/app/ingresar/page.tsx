import type { Metadata } from "next";
import { loginAction } from "@/app/auth-actions";
import { AuthForm } from "@/components/auth-form";
import { safeReturnPath } from "@/lib/auth";

export const metadata: Metadata = { title: "Ingresar", robots: { index: false, follow: false } };
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthForm mode="login" action={loginAction} next={safeReturnPath(params.next, "/cuenta")} />
  );
}
