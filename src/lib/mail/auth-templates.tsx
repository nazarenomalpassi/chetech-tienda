// Plantillas de los mails de cuenta. Las sirve la tienda en /emails/auth/<tipo> y el servicio de
// login de Railway las descarga (variables GOTRUE_MAILER_TEMPLATES_*). El servicio de login completa las
// marcas {{ .ConfirmationURL }} y {{ .Email }} al mandar cada mail.
//
// Los vencimientos que se nombran acá son los del servicio de login: sin GOTRUE_MAILER_OTP_EXP cargado,
// todos los enlaces duran 24 horas y sirven una sola vez. Si se cambia esa variable, cambiar el texto.
//
// Este servicio también lo usa el sistema de gestión: los textos hablan de "tu cuenta en CheTech" y no
// solo de la tienda.
import { render } from "@react-email/render";
import { Button, Help, MailLayout, P, Title } from "@/lib/mail/layout";

const email = "{{ .Email }}";

export const authTemplates = {
  confirmacion: {
    subject: "Confirmá tu mail para terminar",
    preview: "Un toque y tu cuenta de CheTech queda lista.",
    title: "Confirmá tu mail",
    text: ["Para terminar de crear tu cuenta en CheTech, confirmá que ", email, " es tu mail."],
    button: "Confirmar mi mail",
    note: "El botón sirve una sola vez y vence en 24 horas. Si no creaste una cuenta, ignorá este mail: no pasa nada.",
    extra: "Con tu cuenta seguís tus pedidos y las reparaciones del taller desde el celular.",
  },
  recuperacion: {
    subject: "Cambiá tu contraseña de CheTech",
    preview: "Elegí una contraseña nueva para tu cuenta.",
    title: "Cambiá tu contraseña",
    text: ["Pediste cambiar la contraseña de la cuenta ", email, "."],
    button: "Elegir contraseña nueva",
    note: "El botón sirve una sola vez y vence en 24 horas. Si no lo pediste, ignorá este mail: tu contraseña sigue igual.",
    extra: "",
  },
  invitacion: {
    subject: "Te invitaron a CheTech",
    preview: "Activá tu cuenta para entrar.",
    title: "Te damos la bienvenida",
    text: ["Te crearon una cuenta en CheTech con el mail ", email, ". Activala para entrar."],
    button: "Activar mi cuenta",
    note: "El botón sirve una sola vez y vence en 24 horas. Si no esperabas esta invitación, ignorá este mail.",
    extra: "",
  },
  "enlace-magico": {
    subject: "Tu enlace para entrar a CheTech",
    preview: "Entrá a tu cuenta sin contraseña.",
    title: "Entrá a tu cuenta",
    text: ["Usá este botón para entrar a la cuenta ", email, " sin escribir la contraseña."],
    button: "Entrar",
    note: "El enlace sirve una sola vez y vence en 24 horas. Si no lo pediste, ignorá este mail.",
    extra: "",
  },
  "cambio-de-mail": {
    subject: "Confirmá tu mail nuevo",
    preview: "Confirmá el cambio de mail de tu cuenta.",
    title: "Confirmá el cambio de mail",
    text: [
      "Pediste cambiar el mail de tu cuenta en CheTech. Confirmalo con este botón para que el cambio quede hecho.",
    ],
    button: "Confirmar el cambio",
    note: "El botón sirve una sola vez y vence en 24 horas. Si no lo pediste, no lo toques y escribinos por WhatsApp.",
    extra: "",
  },
} as const;

export type AuthTemplate = keyof typeof authTemplates;

export async function renderAuthTemplate(kind: AuthTemplate) {
  const copy = authTemplates[kind];
  return render(
    <MailLayout
      preview={copy.preview}
      kicker="Tu cuenta"
      reason="Te escribimos porque se pidió desde CheTech con este mail."
    >
      <Title>{copy.title}</Title>
      <P>Hola:</P>
      <P>
        {copy.text.map((part) =>
          part === email ? (
            <strong key="mail" style={{ overflowWrap: "anywhere" }}>
              {part}
            </strong>
          ) : (
            part
          ),
        )}
      </P>
      <Button href="{{ .ConfirmationURL }}">{copy.button}</Button>
      <P muted>{copy.note}</P>
      {copy.extra ? <P>{copy.extra}</P> : null}
      <Help />
    </MailLayout>,
  );
}
