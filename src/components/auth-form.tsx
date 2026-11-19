"use client";

import Link from "next/link";
import { Eye, EyeOff, LockKeyhole, PackageSearch, UserRound, Wrench } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { AuthActionState } from "@/app/auth-actions";
import { RepairDemo } from "@/components/repair-demo";
import styles from "./auth-form.module.css";

type Action = (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;
type Mode = "login" | "signup" | "recover" | "update" | "verify";

const copy: Record<Mode, { title: string; subtitle: string; button: string }> = {
  login: {
    title: "Ingresá a tu cuenta",
    subtitle: "Tus pedidos, tus reparaciones y tus datos, en un solo lugar.",
    button: "Ingresar",
  },
  signup: {
    title: "Creá tu cuenta",
    subtitle:
      "Con una cuenta, la próxima compra no te pide los datos y seguís tus reparaciones desde el celular.",
    button: "Crear cuenta",
  },
  recover: {
    title: "Recuperá tu acceso",
    subtitle:
      "Escribí el mail de tu cuenta y te mandamos un enlace para crear una contraseña nueva.",
    button: "Enviar enlace",
  },
  update: {
    title: "Contraseña nueva",
    subtitle: "Elegí una contraseña que no uses en otro lado.",
    button: "Guardar contraseña",
  },
  verify: {
    title: "Revisá tu mail",
    subtitle:
      "Si la cuenta es nueva, te mandamos un enlace para confirmarla. Si el mail ya tenía cuenta, ingresá con tu contraseña o recuperala.",
    button: "Reenviar el enlace",
  },
};

const benefits = [
  {
    icon: PackageSearch,
    title: "Tus pedidos",
    text: "Estado, comprobante y seguimiento de cada compra.",
  },
  {
    icon: Wrench,
    title: "Tus reparaciones",
    text: "Cada novedad del taller, sin tener que preguntar.",
  },
  {
    icon: UserRound,
    title: "Tus datos guardados",
    text: "Nombre, teléfono y direcciones listos para comprar.",
  },
];

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="btn"
      data-size="large"
      data-block="true"
      type="submit"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? "Un momento…" : children}
    </button>
  );
}

function PasswordField({
  name,
  label,
  autoComplete,
}: {
  name: string;
  label: string;
  autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="field">
      <span>{label}</span>
      <div className={styles.password}>
        <input
          name={name}
          type={visible ? "text" : "password"}
          minLength={10}
          maxLength={72}
          autoComplete={autoComplete}
          required
          aria-describedby={`${name}-hint`}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={visible}
        >
          {visible ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </button>
      </div>
      <small id={`${name}-hint`}>Al menos 10 caracteres, con letras y números.</small>
    </label>
  );
}

export function AuthForm({
  mode,
  action,
  next,
  defaultEmail = "",
  embedded = false,
}: {
  mode: Mode;
  action: Action;
  next?: string;
  defaultEmail?: string;
  /** Solo el formulario, sin encabezado: para usarlo dentro de Mi cuenta. */
  embedded?: boolean;
}) {
  const [state, formAction] = useActionState(action, {});
  // Quien llega desde "Seguí tu reparación" lee de entrada para qué sirve ingresar.
  const forRepairs = mode === "login" && Boolean(next?.startsWith("/cuenta/reparaciones"));
  const text = forRepairs
    ? {
        ...copy.login,
        title: "Seguí tu reparación",
        subtitle: "Ingresá con el mail que dejaste en el local y mirá en qué paso está tu equipo.",
      }
    : copy[mode];
  const needsEmail = mode !== "update";
  const withNext = (path: string) => `${path}${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  const form = (
    <form
      className={styles.card}
      data-embedded={embedded || undefined}
      action={formAction}
      noValidate
    >
      <div className="barras" aria-hidden />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {mode === "signup" ? (
        <div className={styles.names}>
          <label className="field">
            <span>Nombre</span>
            <input name="firstName" maxLength={80} autoComplete="given-name" required />
          </label>
          <label className="field">
            <span>Apellido</span>
            <input name="lastName" maxLength={80} autoComplete="family-name" required />
          </label>
        </div>
      ) : null}
      {needsEmail ? (
        <label className="field">
          <span>Mail</span>
          <input
            name="email"
            type="email"
            maxLength={254}
            autoComplete="email"
            inputMode="email"
            defaultValue={defaultEmail}
            required
          />
        </label>
      ) : null}
      {mode === "login" || mode === "signup" ? (
        <PasswordField
          name="password"
          label="Contraseña"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
      ) : null}
      {mode === "update" ? (
        <>
          <PasswordField name="password" label="Contraseña nueva" autoComplete="new-password" />
          <PasswordField
            name="passwordConfirmation"
            label="Repetí la contraseña"
            autoComplete="new-password"
          />
        </>
      ) : null}
      {mode === "signup" ? (
        <div className={styles.consents}>
          <label className={styles.check}>
            <input type="checkbox" name="termsAccepted" required />
            <span>
              Acepto los{" "}
              <Link href="/terminos-y-condiciones" className="enlace" target="_blank">
                términos
              </Link>{" "}
              y la{" "}
              <Link href="/privacidad" className="enlace" target="_blank">
                política de privacidad
              </Link>
              .
            </span>
          </label>
          <label className={styles.check}>
            <input type="checkbox" name="marketingConsent" />
            <span>
              Quiero recibir ofertas por mail o WhatsApp. Es opcional y me puedo dar de baja cuando
              quiera.
            </span>
          </label>
        </div>
      ) : null}
      {state.error ? (
        <p className="aviso" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p className="aviso" data-tipo="ok" role="status">
          {state.message}
        </p>
      ) : null}
      <Submit>{text.button}</Submit>
      {mode === "login" ? (
        <div className={styles.links}>
          <Link href="/recuperar-contrasena" className="enlace">
            Olvidé mi contraseña
          </Link>
          <Link href={withNext("/registrarse")} className="enlace">
            Crear una cuenta
          </Link>
        </div>
      ) : null}
      {mode === "signup" ? (
        <p className={styles.switch}>
          ¿Ya tenés cuenta?{" "}
          <Link href={withNext("/ingresar")} className="enlace">
            Ingresá
          </Link>
        </p>
      ) : null}
      {mode === "recover" ? (
        <p className={styles.switch}>
          <Link href="/ingresar" className="enlace">
            Volver a ingresar
          </Link>
        </p>
      ) : null}
      {mode === "verify" ? (
        <div className={styles.links}>
          <Link href="/ingresar" className="enlace">
            Ingresar
          </Link>
          <Link
            href={`/recuperar-contrasena${defaultEmail ? `?email=${encodeURIComponent(defaultEmail)}` : ""}`}
            className="enlace"
          >
            Recuperar la contraseña
          </Link>
        </div>
      ) : null}
    </form>
  );

  if (embedded) return form;

  return (
    <div className={`page ${styles.page}`}>
      <div className={styles.layout}>
        <header className={styles.head}>
          <h1>{text.title}</h1>
          <p>{text.subtitle}</p>
        </header>

        {form}

        <div className={styles.extra}>
          {mode === "login" || mode === "signup" ? <RepairDemo /> : null}
          {mode === "login" || mode === "signup" ? (
            <ul className={styles.benefits}>
              {benefits.map(({ icon: Icon, title, text: detail }, index) => (
                <li key={title} style={{ "--i": index } as React.CSSProperties}>
                  <span className={styles.benefitIcon} aria-hidden>
                    <Icon />
                  </span>
                  <div>
                    <strong>{title}</strong>
                    <span>{detail}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          <p className={styles.note}>
            <LockKeyhole aria-hidden />
            Tu contraseña viaja cifrada y nadie del local puede verla.
          </p>
        </div>
      </div>
    </div>
  );
}
