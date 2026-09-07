"use client";

import Link from "next/link";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { AuthActionState } from "@/app/auth-actions";

type Action = (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;
type Mode = "login" | "signup" | "recover" | "update" | "verify";

const copy = {
  login: {
    eyebrow: "Acceso seguro",
    title: "Ingresá a tu cuenta",
    subtitle: "Retomá tu carrito y consultá tus pedidos.",
    button: "Ingresar",
  },
  signup: {
    eyebrow: "Nueva cuenta",
    title: "Creá tu cuenta",
    subtitle: "Guardá tus datos para comprar más rápido.",
    button: "Crear cuenta",
  },
  recover: {
    eyebrow: "Recuperación",
    title: "Recuperá tu acceso",
    subtitle: "Te enviaremos un enlace seguro si la cuenta existe.",
    button: "Enviar enlace",
  },
  update: {
    eyebrow: "Seguridad",
    title: "Nueva contraseña",
    subtitle: "Elegí una contraseña nueva y difícil de adivinar.",
    button: "Guardar contraseña",
  },
  verify: {
    eyebrow: "Registro recibido",
    title: "Revisá tu correo o ingresá",
    subtitle:
      "Si la cuenta es nueva, te enviamos un enlace de confirmación. Si ya estaba registrada, ingresá con tu contraseña o recuperá el acceso.",
    button: "Reenviar si está pendiente",
  },
};

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button className="button primary auth-submit" type="submit" disabled={pending}>
      {pending ? "Procesando…" : children}
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
    <label className="auth-field">
      <span>{label}</span>
      <div>
        <LockKeyhole aria-hidden="true" />
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
        >
          {visible ? <EyeOff /> : <Eye />}
        </button>
      </div>
      <small id={`${name}-hint`}>Mínimo 10 caracteres, con letras y números.</small>
    </label>
  );
}

export function AuthForm({
  mode,
  action,
  next,
  defaultEmail = "",
}: {
  mode: Mode;
  action: Action;
  next?: string;
  defaultEmail?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const text = copy[mode];
  const needsEmail = mode !== "update";
  return (
    <section className="auth-page section">
      <div className="auth-shell">
        <div className="auth-intro">
          <p className="eyebrow">{text.eyebrow}</p>
          <h1>{text.title}</h1>
          <p>{text.subtitle}</p>
          <div className="auth-security-note">
            <LockKeyhole />
            <span>Sesión protegida por Supabase Auth. Chetech nunca puede ver tu contraseña.</span>
          </div>
        </div>
        <form className="auth-card" action={formAction} noValidate>
          {next && <input type="hidden" name="next" value={next} />}
          {mode === "signup" && (
            <div className="auth-name-grid">
              <label className="auth-field">
                <span>Nombre</span>
                <input name="firstName" maxLength={80} autoComplete="given-name" required />
              </label>
              <label className="auth-field">
                <span>Apellido</span>
                <input name="lastName" maxLength={80} autoComplete="family-name" required />
              </label>
            </div>
          )}
          {needsEmail && (
            <label className="auth-field">
              <span>Correo electrónico</span>
              <div>
                <Mail aria-hidden="true" />
                <input
                  name="email"
                  type="email"
                  maxLength={254}
                  autoComplete="email"
                  defaultValue={defaultEmail}
                  required
                />
              </div>
            </label>
          )}
          {(mode === "login" || mode === "signup") && (
            <PasswordField
              name="password"
              label="Contraseña"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          )}
          {mode === "update" && (
            <>
              <PasswordField name="password" label="Nueva contraseña" autoComplete="new-password" />
              <PasswordField
                name="passwordConfirmation"
                label="Repetí la contraseña"
                autoComplete="new-password"
              />
            </>
          )}
          {mode === "signup" && (
            <div className="auth-consents">
              <label>
                <input type="checkbox" name="termsAccepted" required />
                <span>
                  Acepto los{" "}
                  <Link href="/terminos-y-condiciones" target="_blank">
                    términos
                  </Link>{" "}
                  y la{" "}
                  <Link href="/privacidad" target="_blank">
                    política de privacidad
                  </Link>
                  .
                </span>
              </label>
              <label>
                <input type="checkbox" name="marketingConsent" />
                <span>Quiero recibir novedades comerciales. Es opcional y puedo retirarlo.</span>
              </label>
            </div>
          )}
          {state.error && (
            <p className="form-message error" role="alert">
              {state.error}
            </p>
          )}
          {state.message && (
            <p className="form-message success" role="status">
              {state.message}
            </p>
          )}
          <Submit>{text.button}</Submit>
          {mode === "login" && (
            <div className="auth-links">
              <Link href="/recuperar-contrasena">Olvidé mi contraseña</Link>
              <Link href={`/registrarse${next ? `?next=${encodeURIComponent(next)}` : ""}`}>
                Crear cuenta
              </Link>
            </div>
          )}
          {mode === "signup" && (
            <p className="auth-switch">
              ¿Ya tenés cuenta?{" "}
              <Link href={`/ingresar${next ? `?next=${encodeURIComponent(next)}` : ""}`}>
                Ingresar
              </Link>
            </p>
          )}
          {mode === "recover" && (
            <p className="auth-switch">
              <Link href="/ingresar">Volver a ingresar</Link>
            </p>
          )}
          {mode === "verify" && (
            <div className="auth-links">
              <Link href="/ingresar">Ingresar a mi cuenta</Link>
              <Link
                href={`/recuperar-contrasena${
                  defaultEmail ? `?email=${encodeURIComponent(defaultEmail)}` : ""
                }`}
              >
                Recuperar contraseña
              </Link>
            </div>
          )}
        </form>
      </div>
    </section>
  );
}
