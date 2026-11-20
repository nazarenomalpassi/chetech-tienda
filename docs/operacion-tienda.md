# Operación de la tienda

Cómo se prende cada parte de la tienda en Railway. Todo arranca apagado: la tienda funciona con reserva por
WhatsApp hasta que se active al menos un medio de pago en **Administración → Configuración**.

## Servicios y variables

Servicio **Tienda** (proyecto `chetech` en Railway, rama `main`). Las claves de la base no se cargan a mano:
`scripts/railway/with-supabase-keys.mjs` las deriva de `SUPABASE_ROOT_SECRET` al compilar y al arrancar
(clave pública, clave de servicio y `CHECKOUT_ACCESS_SECRET` para los enlaces de pedido).

| Variable | Para qué | Estado |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Dominio público, usado en mails, catálogos y Mercado Pago | Cargada |
| `NEXT_PUBLIC_SUPABASE_URL` | Dirección pública de la base | Cargada |
| `SUPABASE_ROOT_SECRET` | Secreto raíz de la base | Cargada |
| `MERCADOPAGO_ACCESS_TOKEN` | Credencial de producción de Mercado Pago | Falta |
| `MERCADOPAGO_WEBHOOK_SECRET` | Clave secreta de los avisos de pago (Tus integraciones → Webhooks) | Falta |
| `MERCADOPAGO_COLLECTOR_ID` | Número de cuenta que cobra, para rechazar pagos a otra cuenta | Falta (opcional) |
| `PAYMENTS_LIVE_ENABLED` | `true` cobra de verdad; sin ella Mercado Pago queda en modo de prueba | Falta, a propósito |
| `RESEND_API_KEY` | Envío de mails de pedidos | Cargada |
| `MAIL_FROM` | Remitente. Por defecto `CheTech <hola@chetechstore.com>` | Opcional |
| `MAIL_REPLY_TO` | Respuestas. Por defecto el Gmail del local | Opcional |
| `ADMIN_EMAIL` | Dónde llega el aviso de pedido nuevo | Opcional |
| `MAIL_ASSET_URL` | De dónde toman los mails el logo y las fotos. Por defecto la dirección de la tienda | Opcional |
| `NEXT_PUBLIC_GA_ID` | Google Analytics 4 (`G-…`) | Falta |
| `NEXT_PUBLIC_META_PIXEL_ID` | Píxel de Meta | Falta |
| `META_CAPI_TOKEN` | Compras informadas a Meta desde el servidor | Falta (opcional) |

Las `NEXT_PUBLIC_*` se fijan al compilar: después de cargarlas hay que volver a desplegar.

## Mercado Pago

1. Cargar `MERCADOPAGO_ACCESS_TOKEN` y `MERCADOPAGO_WEBHOOK_SECRET` en el servicio Tienda.
2. En Mercado Pago → Tus integraciones → Webhooks, la dirección es
   `https://chetechstore.com/api/payments/mercadopago/webhook`, evento **Pagos**.
3. En Administración → Configuración activar **Ofrecer Mercado Pago**.
4. Probar con una cuenta de prueba: pago aprobado, rechazado y repetido (ver lista de control de la Fase 3).
5. Recién después, `PAYMENTS_LIVE_ENABLED=true` y una compra real de monto bajo, cobrada y devuelta.

Un pedido pasa a pagado solo cuando el servidor consulta el pago y comprueba pedido, moneda, cuenta receptora
y modo real. Si el monto no coincide o el stock ya no alcanza, el pedido queda marcado **Revisar** en Pedidos.

## Mails

### Pedidos (Resend)

Activo desde el 20 de noviembre de 2026.

- Dominio `chetechstore.com` verificado en Resend, región São Paulo (`sa-east-1`), sin seguimiento de
  aperturas ni de clics.
- Registros en Cloudflare, todos "DNS only": `resend._domainkey` (TXT, firma DKIM), `send` y `rsend`
  (CNAME de envío, hacia `*.forge.rmta.net`) y `_dmarc` (TXT, `v=DMARC1; p=none;`).
- Clave de API "Tienda y login (Railway)": solo puede enviar, y solo desde `chetechstore.com`. Está en
  `RESEND_API_KEY` del servicio Tienda. Para cambiarla, se crea una nueva en Resend, se pega ahí y se
  borra la vieja: el login la toma sola de la tienda.
- Remitente: `CheTech <hola@chetechstore.com>`. Las respuestas van a `chetech.reparaciones@gmail.com`
  (`MAIL_REPLY_TO`). El dominio no recibe mails: no tiene MX.

Los mails esperan en `storefront_outbox` y salen después de cada compra, pago o acción de Administración.
Además, mientras entran visitas la tienda vacía la cola una vez por minuto (`src/lib/background.ts`): así
los recordatorios que encola la base con su reloj no esperan al próximo pedido.
Los que tengan más de 48 horas se descartan (salvo el aviso para el local).

Además de los mails de pedidos, por la misma cola salen (`src/lib/mail/notices.tsx`):

| Mail | Para quién | Cuándo |
| --- | --- | --- |
| Aviso de ingreso | Cliente que dejó su mail en la lista de espera | Cuando se publica lo que pidió |
| Constancia de la solicitud | Cliente que pidió arrepentimiento o un trámite de privacidad con su mail | Al enviar el formulario |
| Aviso de lista de espera | El local (`ADMIN_EMAIL`) | Cuando alguien se anota |
| Aviso de solicitud | El local (`ADMIN_EMAIL`) | Cuando entra un arrepentimiento o un pedido de privacidad |

Mientras `RESEND_API_KEY` no esté cargada estos avisos no se encolan: el día que se active no sale una
tanda de mails viejos. Lo que entró antes se ve igual en Administración.

### Diseño y pruebas

**Administración → Mails** muestra los 21 mails con un pedido de ejemplo y dos productos reales del
catálogo: cuándo sale cada uno, el asunto, cómo se ve en celular y en compu, y la versión solo texto. Cada
uno tiene **Mandarme una prueba** (llega al mail de quien está en Administración con "[Prueba]" en el
asunto) y arriba está **Mandarme los 21**. Las pruebas salen directo por Resend, sin pasar por la cola, y
cuentan para el límite del plan gratis (100 por día).

Cómo están hechos (`src/lib/mail/layout.tsx`):

- Tablas y estilos en línea, 600 px de ancho, letras del sistema: así se ven igual en Gmail, Outlook y
  Apple Mail. Ninguno pesa más de 16 KB, lejos del recorte de Gmail (102 KB).
- Logo, isotipo y código de barras son PNG con el fondo incluido (`public/mail/`), para que el modo oscuro
  de los programas de mail no los deje invisibles.
- Las fotos de productos pasan por `/api/mail/foto`, que las entrega en JPG de 112 o 480 px: Outlook no
  muestra WebP. Solo acepta fotos públicas del depósito de la tienda.
- `/mail/*` y `/api/mail/foto` mandan `Cross-Origin-Resource-Policy: cross-origin` (el resto del sitio
  usa `same-origin`): sin eso, los programas que cargan las imágenes desde su propia página no las
  mostrarían.
- Los mails de compra llevan al pie el enlace al botón de arrepentimiento.

## Lista de espera y solicitudes

- **Administración → Lista de espera:** quién pidió que le avisen (un producto, una tele revisada o una
  placa), con botones para escribirle por WhatsApp o mail y marcarlo como avisado. Arriba quedan los que
  ya tienen stock. El mail automático solo sale cuando no hay dudas (ver `src/lib/waitlist-match.ts`):
  un producto puntual que vuelve a tener stock, o una tele o placa publicada después del pedido. Si la
  persona escribió qué tele busca o dejó WhatsApp, se le escribe a mano.
- **Administración → Solicitudes:** arrepentimientos y pedidos de privacidad con su número de constancia.
  Desde ahí se contacta a la persona y se cambia el estado (recibida, en revisión, respondida, cerrada).

El menú de Administración muestra cuántas hay sin atender.

## Límite de intentos

`src/lib/rate-limit.ts` frena por conexión los intentos repetidos: ingreso (8 cada 5 minutos), registro,
recuperar contraseña, reenvío de verificación, búsqueda, carrito y formularios. Es en memoria y por
réplica: alcanza mientras la tienda corra con una sola.

### Cuentas (servicio de login)

El servicio **Gotrue Auth** manda sus mails por Resend desde el 20 de noviembre de 2026 (confirmación de
cuenta, recuperar contraseña, invitación, enlace mágico y cambio de mail). Tiene cargado:

```
GOTRUE_SMTP_HOST=smtp.resend.com
GOTRUE_SMTP_PORT=465
GOTRUE_SMTP_USER=resend
GOTRUE_SMTP_PASS=${{Tienda.RESEND_API_KEY}}   (referencia: toma la clave del servicio Tienda)
GOTRUE_SMTP_ADMIN_EMAIL=hola@chetechstore.com
GOTRUE_SMTP_SENDER_NAME=CheTech
GOTRUE_URI_ALLOW_LIST=https://chetechstore.com/**,https://www.chetechstore.com/**,https://gestion.chetechstore.com/**,https://sistema-de-gestion-production-bc36cfd9.up.railway.app/**
GOTRUE_MAILER_TEMPLATES_CONFIRMATION=https://chetechstore.com/emails/auth/confirmacion
GOTRUE_MAILER_TEMPLATES_RECOVERY=https://chetechstore.com/emails/auth/recuperacion
GOTRUE_MAILER_TEMPLATES_INVITE=https://chetechstore.com/emails/auth/invitacion
GOTRUE_MAILER_TEMPLATES_MAGIC_LINK=https://chetechstore.com/emails/auth/enlace-magico
GOTRUE_MAILER_TEMPLATES_EMAIL_CHANGE=https://chetechstore.com/emails/auth/cambio-de-mail
GOTRUE_MAILER_SUBJECTS_CONFIRMATION=Confirmá tu mail para terminar
GOTRUE_MAILER_SUBJECTS_RECOVERY=Cambiá tu contraseña de CheTech
GOTRUE_MAILER_SUBJECTS_INVITE=Te invitaron a CheTech
GOTRUE_MAILER_SUBJECTS_MAGIC_LINK=Tu enlace para entrar a CheTech
GOTRUE_MAILER_SUBJECTS_EMAIL_CHANGE=Confirmá tu mail nuevo
```

Las plantillas se arman en `src/lib/mail/auth-templates.tsx` y el servicio de login las guarda un rato
en memoria: un cambio de diseño puede tardar en llegarle (o se reinicia **Gotrue Auth**). Los enlaces
vencen a las 24 horas (`GOTRUE_MAILER_OTP_EXP` sin cargar); si algún día se cambia, hay que cambiar
también el texto "vence en 24 horas".

El servicio de login también lo usa el sistema de gestión: sus mails de login salen igual, con la
plantilla de CheTech, y la lista de direcciones permitidas incluye las de gestión para que sus enlaces
sigan volviendo ahí. Cada envío se ve en Resend → Emails.

## Cobros, entregas y portada

Todo se edita en **Administración → Configuración** y la tienda lo toma en menos de un minuto:

- Transferencia: alias o CVU obligatorio para activarla. Reserva en horas hábiles del local.
- Pago al retirar: solo con retiro, con monto máximo opcional.
- Entrega CheTech: una fila por zona con su precio.
- Correo Argentino: tarifa fija por paquete chico, mediano y grande. Los productos marcados “no viaja” no se ofrecen.
- Canales del televisor de la portada y producto del video de la semana (lo usa `/ig`).

## Vencimientos

`pg_cron` corre `storefront-expire-orders` cada 5 minutos: vence reservas sin pagar, libera stock y encola
los recordatorios. Se puede revisar con `select * from cron.job;`.

## Promoción

- Enlace de la biografía de Instagram: `https://chetechstore.com/ig` (cuenta como origen Instagram).
- Enlaces medibles: agregar `?utm_source=instagram&utm_medium=historia&utm_campaign=<campaña>&utm_content=<pieza>`.
- Catálogos: `https://chetechstore.com/feeds/meta.xml` (Meta Commerce Manager) y
  `https://chetechstore.com/feeds/google.xml` (Merchant Center). Se actualizan cada hora.
- Tablero por origen: Administración → Tablero.

## Pruebas y mantenimiento

```
npm test          # pagos, horarios, origen de visitas, claves de pedido, lista de espera y contrato de la tienda
npm run lint
npm run build
npm run css:prune # borra de src/styles/legacy/*.css las reglas que ya no usa ninguna página
```

### Pruebas en el navegador

La carpeta `e2e/` recorre la tienda como un cliente, en celular y en escritorio (Playwright):

- **Compra:** elige un producto, lo suma al carrito, cambia la cantidad y llega al formulario de
  "Finalizar compra". No envía el pedido: no deja nada en la base ni manda mensajes.
- **Celular:** ninguna página pública se pasa de 320 ni de 390 px de ancho.
- **Accesibilidad:** reglas automáticas de WCAG 2.2 A y AA (contraste, nombres de botones y campos) en las
  páginas principales, y que el carrito se pueda abrir, recorrer y cerrar con el teclado.

```
npx playwright install chromium                         # una sola vez: baja el navegador
npm run build && npm run test:e2e                       # contra la versión local
BASE_URL=https://chetechstore.com npm run test:e2e      # contra la tienda publicada
```

La prueba en seco de la base (`supabase/tests/storefront_v3_commerce_dry_run.sql`) corre todo dentro de una
transacción y la revierte: se puede repetir sin dejar rastros.
