import Link from "next/link";
import { updatePasswordAction } from "@/app/auth-actions";
import { AuthForm } from "@/components/auth-form";
import { requireAccount } from "@/lib/auth";
import { AccountHeading } from "../account-heading";
import styles from "../account.module.css";

export default async function SecurityPage() {
  const account = await requireAccount("/cuenta/seguridad");
  return (
    <>
      <AccountHeading title="Contraseña">
        {account.emailVerified ? "Tu mail está confirmado." : "Todavía no confirmaste tu mail."} Cambiá la contraseña
        cuando quieras.
      </AccountHeading>
      <AuthForm mode="update" action={updatePasswordAction} embedded />
      <p className={styles.rowMeta}>
        ¿No recordás la actual? No hace falta: si entraste, podés elegir una nueva. Si no podés entrar, pedí un{" "}
        <Link href="/recuperar-contrasena" className="enlace">
          enlace de recuperación
        </Link>
        .
      </p>
    </>
  );
}
