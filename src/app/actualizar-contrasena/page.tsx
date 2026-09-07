import type { Metadata } from "next";
import { updatePasswordAction } from "@/app/auth-actions";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = {
  title: "Actualizar contraseña",
  robots: { index: false, follow: false },
};
export default function UpdatePasswordPage() {
  return <AuthForm mode="update" action={updatePasswordAction} />;
}
