import Link from "next/link";
import { updatePasswordAction } from "@/app/auth-actions";
import { AuthForm } from "@/components/auth-form";
import { requireAccount } from "@/lib/auth";

export default async function SecurityPage() {
  const account = await requireAccount("/cuenta/seguridad");
  return (
    <>
      <div className="account-heading">
        <p className="eyebrow">Seguridad</p>
        <h1>Protegé tu acceso</h1>
        <p>
          {account.emailVerified
            ? "Tu correo está verificado."
            : "Tu correo todavía no fue verificado."}
        </p>
      </div>
      <div className="embedded-auth-form">
        <AuthForm mode="update" action={updatePasswordAction} />
      </div>
      <p className="account-help">
        Si no recordás tu contraseña,{" "}
        <Link href="/recuperar-contrasena">solicitá un enlace de recuperación</Link>.
      </p>
    </>
  );
}
