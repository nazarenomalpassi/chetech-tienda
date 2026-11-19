// Plantillas de los mails de cuenta. Las sirve la tienda en /emails/auth/<tipo> y el servicio de
// login de Railway las descarga (variables GOTRUE_MAILER_TEMPLATES_*). Las marcas {{ .ConfirmationURL }}
// las completa el servicio de login al mandar cada mail.
import { render } from "@react-email/render";
import { Button, MailLayout, P, Title } from "@/lib/mail/layout";

export const authTemplates = {
  confirmacion: {
    subject: "Confirmá tu mail para terminar",
    preview: "Un toque y tu cuenta de CheTech queda lista.",
    title: "Falta un paso",
    text: "Confirmá tu mail para activar tu cuenta en CheTech.",
    button: "Confirmar mi mail",
    note: "El botón vence en 24 horas. Si no creaste una cuenta, ignorá este mensaje.",
    extra: "Con tu cuenta seguís tus pedidos y tus reparaciones desde el celular.",
  },
  recuperacion: {
    subject: "Cambiá tu contraseña de CheTech",
    preview: "Elegí una contraseña nueva.",
    title: "Cambiá tu contraseña",
    text: "Pediste cambiar la contraseña de tu cuenta en CheTech.",
    button: "Elegir contraseña nueva",
    note: "El botón vence en 1 hora. Si no lo pediste, ignorá este mensaje: tu contraseña sigue igual.",
    extra: "",
  },
  invitacion: {
    subject: "Te invitaron a CheTech",
    preview: "Activá tu cuenta.",
    title: "Te damos la bienvenida",
    text: "Te crearon una cuenta en CheTech. Activala para entrar.",
    button: "Activar mi cuenta",
    note: "Si no esperabas esta invitación, ignorá este mensaje.",
    extra: "",
  },
  "enlace-magico": {
    subject: "Tu enlace para entrar a CheTech",
    preview: "Entrá sin contraseña.",
    title: "Entrá a tu cuenta",
    text: "Usá este botón para entrar a CheTech.",
    button: "Entrar",
    note: "El enlace vence en 1 hora y sirve una sola vez.",
    extra: "",
  },
  "cambio-de-mail": {
    subject: "Confirmá tu mail nuevo",
    preview: "Confirmá el cambio de mail de tu cuenta.",
    title: "Confirmá tu mail nuevo",
    text: "Pediste cambiar el mail de tu cuenta en CheTech.",
    button: "Confirmar el mail nuevo",
    note: "Si no lo pediste, escribinos por WhatsApp.",
    extra: "",
  },
} as const;

export type AuthTemplate = keyof typeof authTemplates;

export async function renderAuthTemplate(kind: AuthTemplate) {
  const copy = authTemplates[kind];
  return render(
    <MailLayout preview={copy.preview}>
      <Title>{copy.title}</Title>
      <P>Hola:</P>
      <P>{copy.text}</P>
      <Button href="{{ .ConfirmationURL }}">{copy.button}</Button>
      <P muted>{copy.note}</P>
      {copy.extra ? <P>{copy.extra}</P> : null}
    </MailLayout>,
  );
}
