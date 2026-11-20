/* eslint-disable @next/next/no-img-element -- es un mail: las imágenes van como <img> con dirección completa. */
// Diseño común de los mails. Es el comprobante del mostrador hecho mail: franja negra con el logo, una
// hoja blanca con el pedido y, al pie del comprobante, el código de barras del sello de garantía.
//
// Reglas, porque cada programa de mail interpreta el HTML a su manera:
// - Tablas y estilos en línea (Gmail, Outlook y el celular los respetan; el CSS suelto no siempre).
// - 600 px de ancho como máximo y una sola columna. En el celular, las dos columnas de datos se apilan.
// - Letra del sistema (Helvetica o Arial): una tipografía propia no carga en Gmail.
// - El logo y el código de barras son imágenes PNG con fondo propio, para que se vean igual con el
//   modo oscuro del celular. Toda imagen lleva texto alternativo o, si es decorativa, alt vacío.
// - Un solo botón por mail y, debajo, el mismo enlace escrito.
import type { ReactNode } from "react";
import { siteConfig } from "@/config/site";

export const mailColors = {
  negro: "#0a0a0a",
  tinta: "#101010",
  tinta2: "#333636",
  tinta3: "#565b5b",
  plata: "#a9aeae",
  linea: "#d6d6d6",
  pared: "#e4e4e4",
  suave: "#f2f2f2",
  blanco: "#ffffff",
} as const;

const { negro, tinta, tinta2, tinta3, plata, linea, pared, suave, blanco } = mailColors;

const font = "'Helvetica Neue', Helvetica, Arial, sans-serif";

/** Dirección pública de la tienda (las imágenes del mail tienen que ser absolutas). */
export function mailSite() {
  const base = (
    process.env.MAIL_ASSET_URL ??
    siteConfig.baseUrl ??
    "https://chetechstore.com"
  ).replace(/\/$/, "");
  return base.includes("localhost") && !process.env.MAIL_ASSET_URL
    ? "https://chetechstore.com"
    : base;
}

/**
 * Foto de producto para el mail: chica, en JPEG y sobre blanco. Las fotos de la tienda son WebP y
 * Outlook de escritorio no las muestra, así que pasan por /api/mail/foto.
 */
export function mailPhoto(url: string | null | undefined, size: 112 | 480 = 112) {
  if (!url || !/^https:\/\/.+\/storage\/v1\/object\/public\//.test(url)) return null;
  return `${mailSite()}/api/mail/foto?s=${size}&u=${encodeURIComponent(url)}`;
}

const money = (value: number) => `$ ${Math.round(value).toLocaleString("es-AR")}`;

/** Atributos de HTML viejo que algunos programas de mail (Outlook) leen y React no tipa, como bgcolor. */
const legacy = (attributes: Record<string, string>) => attributes;

// Estilos que solo pueden ir en <style>: ajustes del celular. Si un programa no los lee, el mail se ve
// igual, con un poco más de margen.
const responsive = `
  @media only screen and (max-width: 620px) {
    .ct-outer { padding: 0 !important; }
    .ct-pad { padding-left: 20px !important; padding-right: 20px !important; }
    .ct-stack { display: block !important; width: 100% !important; box-sizing: border-box !important; }
    .ct-stack-gap { padding: 0 0 10px 0 !important; }
    .ct-title { font-size: 23px !important; line-height: 28px !important; }
    .ct-total { font-size: 22px !important; }
    .ct-step { font-size: 11px !important; letter-spacing: 0 !important; }
    .ct-fl { display: block !important; width: auto !important; padding: 11px 16px 0 !important; border-bottom: 0 !important; font-size: 13px !important; }
    .ct-fv { display: block !important; width: auto !important; padding: 2px 16px 11px !important; }
    .ct-big { font-size: 22px !important; line-height: 28px !important; letter-spacing: 0.06em !important; }
  }
  a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
`;

type LayoutProps = {
  /** Texto que se ve junto al asunto en la bandeja de entrada. */
  preview: string;
  /** Línea chica arriba del título, con el prefijo de la marca: ">>> PEDIDO CHT-000128". */
  kicker?: string;
  /** Por qué le llega este mail. Va al pie. */
  reason?: string;
  /** Mails de una compra: suman el botón de arrepentimiento al pie. */
  purchase?: boolean;
  children: ReactNode;
};

export function MailLayout({ preview, kicker, reason, purchase = false, children }: LayoutProps) {
  const site = mailSite();
  return (
    <html lang="es-AR">
      <head>
        <meta httpEquiv="Content-Type" content="text/html; charset=UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="x-apple-disable-message-reformatting" />
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light" />
        <meta name="format-detection" content="telephone=no, address=no, email=no, date=no" />
        <title>CheTech</title>
        <style>{responsive}</style>
      </head>
      <body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: pared,
          fontFamily: font,
          color: tinta,
          WebkitTextSizeAdjust: "100%",
        }}
      >
        {/* Texto de la bandeja de entrada. El relleno de después evita que el programa complete la
            vista previa con el resto del mail. */}
        <div
          style={{
            display: "none",
            maxHeight: 0,
            maxWidth: 0,
            overflow: "hidden",
            opacity: 0,
            fontSize: 1,
            lineHeight: "1px",
            color: pared,
          }}
        >
          {preview}
          {" ‌".repeat(90)}
        </div>
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          border={0}
          style={{ backgroundColor: pared }}
        >
          <tbody>
            <tr>
              <td align="center" className="ct-outer" style={{ padding: "28px 12px 32px" }}>
                <table
                  role="presentation"
                  width={600}
                  cellPadding={0}
                  cellSpacing={0}
                  border={0}
                  style={{ width: "100%", maxWidth: 600, backgroundColor: blanco }}
                >
                  <tbody>
                    <tr>
                      <td
                        className="ct-pad"
                        style={{ padding: "22px 32px 20px", backgroundColor: negro }}
                      >
                        <a href={site} style={{ textDecoration: "none" }}>
                          <img
                            src={`${site}/mail/logo.png`}
                            width={210}
                            height={37}
                            alt="CheTech, servicio técnico especializado"
                            style={{
                              display: "block",
                              border: 0,
                              width: 210,
                              height: 37,
                              color: blanco,
                              fontFamily: font,
                              fontSize: 18,
                              fontWeight: 700,
                            }}
                          />
                        </a>
                      </td>
                    </tr>
                    <tr>
                      <td
                        className="ct-pad"
                        style={{
                          padding: "30px 32px 32px",
                          fontSize: 16,
                          lineHeight: "24px",
                          color: tinta,
                        }}
                      >
                        {kicker ? (
                          <p
                            style={{
                              margin: "0 0 10px",
                              fontSize: 12,
                              lineHeight: "16px",
                              fontWeight: 700,
                              letterSpacing: "0.12em",
                              textTransform: "uppercase",
                              color: tinta3,
                            }}
                          >
                            {">>> "}
                            {kicker}
                          </p>
                        ) : null}
                        {children}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <Footer site={site} reason={reason} purchase={purchase} />
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}

function Footer({ site, reason, purchase }: { site: string; reason?: string; purchase: boolean }) {
  const link = { color: tinta2, textDecoration: "underline" };
  return (
    <table
      role="presentation"
      width={600}
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{ width: "100%", maxWidth: 600 }}
    >
      <tbody>
        <tr>
          <td
            className="ct-pad"
            style={{ padding: "22px 32px 0", fontSize: 13, lineHeight: "20px", color: tinta3 }}
          >
            <p style={{ margin: "0 0 10px", fontWeight: 700, color: tinta }}>
              CheTech, Independencia 784, Río Tercero, Córdoba
            </p>
            <p style={{ margin: "0 0 10px" }}>
              Lunes a viernes de 09:30 a 19:00. Sábados de 10:00 a 12:30 y de 16:00 a 20:00.
            </p>
            <p style={{ margin: "0 0 14px" }}>
              <a href="https://wa.me/5493571544683" style={link}>
                WhatsApp (3571) 544683
              </a>
              {"    "}
              <a href="https://instagram.com/chetechreparaciones" style={link}>
                Instagram
              </a>
              {"    "}
              <a href={site} style={link}>
                chetechstore.com
              </a>
            </p>
            {purchase ? (
              <p style={{ margin: "0 0 10px" }}>
                Si te arrepentís de una compra online, tenés 10 días corridos desde que la recibís
                para cancelarla:{" "}
                <a href={`${site}/arrepentimiento`} style={link}>
                  Botón de arrepentimiento
                </a>
                .
              </p>
            ) : null}
            {reason ? <p style={{ margin: 0 }}>{reason}</p> : null}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <h1
      className="ct-title"
      style={{
        margin: "0 0 16px",
        fontFamily: font,
        fontSize: 27,
        lineHeight: "32px",
        fontWeight: 800,
        letterSpacing: "0.01em",
        textTransform: "uppercase",
        color: tinta,
      }}
    >
      {children}
    </h1>
  );
}

export function P({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <p
      style={{
        margin: "0 0 14px",
        color: muted ? tinta3 : tinta,
        fontSize: muted ? 14 : 16,
        lineHeight: muted ? "21px" : "24px",
      }}
    >
      {children}
    </p>
  );
}

export function Button({ href, children }: { href: string; children: ReactNode }) {
  return (
    <>
      <table
        role="presentation"
        cellPadding={0}
        cellSpacing={0}
        border={0}
        style={{ margin: "22px 0 12px" }}
      >
        <tbody>
          <tr>
            <td {...legacy({ bgcolor: tinta })} style={{ backgroundColor: tinta }}>
              <a
                href={href}
                style={{
                  display: "inline-block",
                  padding: "15px 26px",
                  color: blanco,
                  fontFamily: font,
                  fontSize: 16,
                  lineHeight: "20px",
                  fontWeight: 700,
                  letterSpacing: "0.02em",
                  textDecoration: "none",
                }}
              >
                {children}
              </a>
            </td>
          </tr>
        </tbody>
      </table>
      <p
        style={{
          margin: "0 0 18px",
          fontSize: 12,
          lineHeight: "18px",
          color: tinta3,
          wordBreak: "break-all",
        }}
      >
        Si el botón no anda, copiá este enlace en el navegador:{" "}
        <a href={href} style={{ color: tinta2 }}>
          {href}
        </a>
      </p>
    </>
  );
}

/**
 * Avance del pedido: una barra por etapa. Las que ya pasaron y la actual van en negro; las que faltan,
 * en gris. El nombre de la etapa actual va en negrita.
 */
export function Steps({ steps, current }: { steps: string[]; current: number }) {
  const width = `${Math.floor(100 / steps.length)}%`;
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{ margin: "6px 0 22px" }}
    >
      <tbody>
        <tr>
          {steps.map((step, index) => (
            <td
              key={step}
              width={width}
              valign="top"
              style={{ width, paddingRight: index < steps.length - 1 ? 4 : 0 }}
            >
              <div
                style={{
                  height: 6,
                  lineHeight: "6px",
                  fontSize: 1,
                  backgroundColor: index <= current ? tinta : linea,
                }}
              >
                &nbsp;
              </div>
              <p
                className="ct-step"
                style={{
                  margin: "8px 0 0",
                  fontSize: 12,
                  lineHeight: "16px",
                  letterSpacing: "0.02em",
                  fontWeight: index === current ? 700 : 400,
                  color: index <= current ? tinta : tinta3,
                }}
              >
                {step}
              </p>
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

type ReceiptItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  image?: string | null;
  href?: string | null;
};

/**
 * Comprobante: número de pedido, productos con su foto, envío, descuentos y total. Cierra con el código
 * de barras del sello de garantía, como el papel que se entrega en el local.
 */
export function Receipt({
  orderNumber,
  date,
  items,
  shipping,
  discounts = [],
  total,
  footer,
}: {
  orderNumber: string;
  date?: string;
  items: ReceiptItem[];
  shipping: number;
  discounts?: { label: string; amount: number }[];
  total: number;
  footer?: string;
}) {
  const site = mailSite();
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const row = { padding: "7px 0", fontSize: 15, lineHeight: "20px", color: tinta2 };
  const amount = {
    ...row,
    textAlign: "right" as const,
    whiteSpace: "nowrap" as const,
    color: tinta,
  };
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{ margin: "6px 0 22px", border: `1.5px solid ${tinta}`, borderCollapse: "separate" }}
    >
      <tbody>
        <tr>
          <td style={{ padding: "13px 18px", backgroundColor: tinta, color: blanco }}>
            <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
              <tbody>
                <tr>
                  <td
                    style={{
                      fontSize: 18,
                      lineHeight: "24px",
                      fontWeight: 800,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: blanco,
                    }}
                  >
                    Pedido {orderNumber}
                  </td>
                  {date ? (
                    <td
                      align="right"
                      style={{
                        fontSize: 13,
                        lineHeight: "24px",
                        color: plata,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {date}
                    </td>
                  ) : null}
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
        <tr>
          <td style={{ padding: "6px 18px 0" }}>
            <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
              <tbody>
                {items.map((item, index) => {
                  const photo = mailPhoto(item.image);
                  const name = item.href ? (
                    <a href={item.href} style={{ color: tinta, textDecoration: "none" }}>
                      {item.name}
                    </a>
                  ) : (
                    item.name
                  );
                  return (
                    <tr key={`${item.name}-${index}`}>
                      <td
                        width={56}
                        valign="top"
                        style={{ width: 56, padding: "12px 0", borderBottom: `1px solid ${linea}` }}
                      >
                        {photo ? (
                          <img
                            src={photo}
                            width={56}
                            height={56}
                            alt=""
                            style={{
                              display: "block",
                              width: 56,
                              height: 56,
                              border: `1px solid ${linea}`,
                              backgroundColor: blanco,
                            }}
                          />
                        ) : (
                          <table
                            role="presentation"
                            width={56}
                            cellPadding={0}
                            cellSpacing={0}
                            border={0}
                          >
                            <tbody>
                              <tr>
                                <td
                                  width={56}
                                  height={56}
                                  align="center"
                                  valign="middle"
                                  {...legacy({ bgcolor: negro })}
                                  style={{ width: 56, height: 56, backgroundColor: negro }}
                                >
                                  <img
                                    src={`${site}/mail/isotipo.png`}
                                    width={28}
                                    height={16}
                                    alt=""
                                    style={{ display: "block", width: 28, height: 16, border: 0 }}
                                  />
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        )}
                      </td>
                      <td
                        valign="top"
                        style={{
                          padding: "12px 12px 12px 14px",
                          borderBottom: `1px solid ${linea}`,
                        }}
                      >
                        <p
                          style={{
                            margin: 0,
                            fontSize: 15,
                            lineHeight: "20px",
                            fontWeight: 600,
                            color: tinta,
                          }}
                        >
                          {name}
                        </p>
                        <p
                          style={{
                            margin: "3px 0 0",
                            fontSize: 13,
                            lineHeight: "18px",
                            color: tinta3,
                          }}
                        >
                          {item.quantity} × {money(item.unitPrice)}
                        </p>
                      </td>
                      <td
                        valign="top"
                        align="right"
                        style={{
                          padding: "12px 0",
                          borderBottom: `1px solid ${linea}`,
                          fontSize: 15,
                          lineHeight: "20px",
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                          color: tinta,
                        }}
                      >
                        {money(item.subtotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </td>
        </tr>
        <tr>
          <td style={{ padding: "10px 18px 4px" }}>
            <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
              <tbody>
                {shipping > 0 || discounts.length ? (
                  <tr>
                    <td style={row}>Subtotal</td>
                    <td style={amount}>{money(subtotal)}</td>
                  </tr>
                ) : null}
                {shipping > 0 ? (
                  <tr>
                    <td style={row}>Envío</td>
                    <td style={amount}>{money(shipping)}</td>
                  </tr>
                ) : null}
                {discounts.map((discount) => (
                  <tr key={discount.label}>
                    <td style={row}>{discount.label}</td>
                    <td style={amount}>− {money(discount.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td
                    style={{
                      padding: "12px 0 6px",
                      fontSize: 17,
                      lineHeight: "24px",
                      fontWeight: 800,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: tinta,
                      borderTop: `1.5px solid ${tinta}`,
                    }}
                  >
                    Total
                  </td>
                  <td
                    className="ct-total"
                    align="right"
                    style={{
                      padding: "12px 0 6px",
                      fontSize: 26,
                      lineHeight: "30px",
                      fontWeight: 800,
                      whiteSpace: "nowrap",
                      color: tinta,
                      borderTop: `1.5px solid ${tinta}`,
                    }}
                  >
                    {money(total)}
                  </td>
                </tr>
                {footer ? (
                  <tr>
                    <td
                      colSpan={2}
                      style={{
                        padding: "2px 0 6px",
                        fontSize: 13,
                        lineHeight: "19px",
                        color: tinta3,
                      }}
                    >
                      {footer}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </td>
        </tr>
        <tr>
          <td style={{ padding: "10px 18px 14px" }}>
            <img
              src={`${site}/mail/barras.png`}
              width={160}
              height={20}
              alt=""
              style={{ display: "block", width: 160, height: 20, border: 0 }}
            />
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 11,
                lineHeight: "14px",
                letterSpacing: "0.18em",
                color: tinta3,
              }}
            >
              {orderNumber}
            </p>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** Datos en dos columnas (alias, CVU, código de retiro). */
export function Facts({ rows, large }: { rows: [string, string][]; large?: string }) {
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{ margin: "4px 0 20px", backgroundColor: suave }}
    >
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <td
              className="ct-fl"
              valign="top"
              style={{
                padding: "11px 16px",
                fontSize: 14,
                lineHeight: "20px",
                color: tinta3,
                width: "36%",
                borderBottom: `1px solid ${blanco}`,
              }}
            >
              {label}
            </td>
            <td
              className={label === large ? "ct-fv ct-big" : "ct-fv"}
              valign="top"
              style={{
                padding: "11px 16px",
                fontSize: label === large ? 26 : 16,
                lineHeight: label === large ? "30px" : "20px",
                fontWeight: label === large ? 800 : 600,
                letterSpacing: label === large ? "0.12em" : "0",
                color: tinta,
                borderBottom: `1px solid ${blanco}`,
                wordBreak: "break-word",
              }}
            >
              {value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Entrega y pago, uno al lado del otro (apilados en el celular). */
export function Details({ blocks }: { blocks: { label: string; lines: string[] }[] }) {
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{ margin: "0 0 20px" }}
    >
      <tbody>
        <tr>
          {blocks.map((block, index) => (
            <td
              key={block.label}
              className="ct-stack ct-stack-gap"
              width={`${Math.floor(100 / blocks.length)}%`}
              valign="top"
              style={{ padding: index < blocks.length - 1 ? "0 8px 0 0" : "0 0 0 8px" }}
            >
              <table
                role="presentation"
                width="100%"
                cellPadding={0}
                cellSpacing={0}
                border={0}
                style={{ backgroundColor: suave }}
              >
                <tbody>
                  <tr>
                    <td style={{ padding: "14px 16px" }}>
                      <p
                        style={{
                          margin: "0 0 4px",
                          fontSize: 12,
                          lineHeight: "16px",
                          fontWeight: 700,
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          color: tinta3,
                        }}
                      >
                        {block.label}
                      </p>
                      {block.lines.map((line, lineIndex) => (
                        <p
                          key={line}
                          style={{
                            margin: 0,
                            fontSize: lineIndex === 0 ? 15 : 14,
                            lineHeight: "21px",
                            fontWeight: lineIndex === 0 ? 700 : 400,
                            color: lineIndex === 0 ? tinta : tinta2,
                          }}
                        >
                          {line}
                        </p>
                      ))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

/** Ayuda al final del mail: a quién escribir si algo no cierra. */
export function Help({ children }: { children?: ReactNode }) {
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{ margin: "8px 0 0", borderTop: `1px solid ${linea}` }}
    >
      <tbody>
        <tr>
          <td style={{ padding: "18px 0 0", fontSize: 14, lineHeight: "21px", color: tinta2 }}>
            {children ?? (
              <>
                ¿Dudas? Respondé este mail o escribinos por{" "}
                <a href="https://wa.me/5493571544683" style={{ color: tinta, fontWeight: 700 }}>
                  WhatsApp al (3571) 544683
                </a>
                .
              </>
            )}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
