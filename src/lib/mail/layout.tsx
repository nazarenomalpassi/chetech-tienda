// Diseño común de los mails: 600 px, una columna, la marca en una franja negra arriba y el cuerpo como
// comprobante. Un solo botón por mail y, debajo, el mismo enlace en texto. HTML con tablas para que
// se vea igual en Gmail, Outlook y el celular.
import type { ReactNode } from "react";

const tinta = "#101010";
const tinta2 = "#3a3d3d";
const tinta3 = "#626767";
const pared = "#f8f8f8";
const linea = "#e0e0e0";

const font = "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif";
const display = "'Helvetica Neue', Arial, sans-serif";

export function MailLayout({ preview, children }: { preview: string; children: ReactNode }) {
  return (
    <html lang="es-AR">
      <head>
        <meta httpEquiv="Content-Type" content="text/html; charset=UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light" />
        <title>CheTech</title>
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: pared, fontFamily: font, color: tinta }}>
        <div style={{ display: "none", maxHeight: 0, overflow: "hidden", opacity: 0 }}>{preview}</div>
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ backgroundColor: pared }}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: "24px 12px" }}>
                <table
                  role="presentation"
                  width={600}
                  cellPadding={0}
                  cellSpacing={0}
                  style={{ width: "100%", maxWidth: 600, backgroundColor: "#ffffff", border: `1px solid ${linea}` }}
                >
                  <tbody>
                    <tr>
                      <td style={{ padding: "18px 28px", backgroundColor: tinta }}>
                        <span style={{ fontFamily: display, fontSize: 22, letterSpacing: "0.14em", color: "#ffffff" }}>
                          <strong style={{ fontWeight: 700 }}>CHE</strong>
                          <span style={{ fontWeight: 400 }}>TECH</span>
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: "8px 28px 28px", fontSize: 16, lineHeight: "24px", color: tinta }}>{children}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: "18px 28px 22px", borderTop: `1px solid ${linea}`, fontSize: 13, lineHeight: "20px", color: tinta3 }}>
                        CheTech, Independencia 784, Río Tercero, Córdoba
                        <br />
                        Lunes a viernes de 09:30 a 19:00. Sábados de 10:00 a 12:30 y de 16:00 a 20:00.
                        <br />
                        <a href="https://wa.me/5493571544683" style={{ color: tinta2 }}>
                          WhatsApp (3571) 544683
                        </a>
                        <br />
                        <a href="https://instagram.com/chetechreparaciones" style={{ color: tinta2 }}>
                          @chetechreparaciones
                        </a>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <h1 style={{ margin: "6px 0 12px", fontFamily: display, fontSize: 24, lineHeight: "30px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: tinta }}>{children}</h1>;
}

export function P({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return <p style={{ margin: "0 0 14px", color: muted ? tinta3 : tinta, fontSize: muted ? 14 : 16, lineHeight: muted ? "21px" : "24px" }}>{children}</p>;
}

export function Button({ href, children }: { href: string; children: ReactNode }) {
  return (
    <>
      <table role="presentation" cellPadding={0} cellSpacing={0} style={{ margin: "18px 0 10px" }}>
        <tbody>
          <tr>
            <td style={{ backgroundColor: tinta, borderRadius: 0 }}>
              <a
                href={href}
                style={{ display: "inline-block", padding: "14px 24px", color: "#ffffff", fontFamily: font, fontSize: 17, fontWeight: 600, textDecoration: "none" }}
              >
                {children}
              </a>
            </td>
          </tr>
        </tbody>
      </table>
      <p style={{ margin: "0 0 16px", fontSize: 13, lineHeight: "19px", color: tinta3, wordBreak: "break-all" }}>
        Si el botón no funciona, copiá este enlace: <a href={href} style={{ color: tinta2 }}>{href}</a>
      </p>
    </>
  );
}

/** Comprobante: número de pedido grande, tabla de productos y total. */
export function Receipt({
  orderNumber,
  items,
  shipping,
  discounts = [],
  total,
  footer,
}: {
  orderNumber: string;
  items: { name: string; quantity: number; subtotal: number }[];
  shipping: number;
  discounts?: { label: string; amount: number }[];
  total: number;
  footer?: string;
}) {
  const money = (value: number) => `$ ${Math.round(value).toLocaleString("es-AR")}`;
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      style={{ margin: "8px 0 18px", border: `1.5px solid ${tinta}`, borderRadius: 0, borderCollapse: "separate" }}
    >
      <tbody>
        <tr>
          <td colSpan={2} style={{ padding: "12px 16px", backgroundColor: tinta, color: "#ffffff", fontFamily: display, fontSize: 24, fontWeight: 700 }}>
            Pedido {orderNumber}
          </td>
        </tr>
        {items.map((item) => (
          <tr key={item.name}>
            <td style={{ padding: "10px 16px", borderBottom: `1px solid ${linea}`, fontSize: 15, lineHeight: "21px" }}>
              {item.quantity} x {item.name}
            </td>
            <td align="right" style={{ padding: "10px 16px", borderBottom: `1px solid ${linea}`, fontSize: 15, whiteSpace: "nowrap", fontWeight: 600 }}>
              {money(item.subtotal)}
            </td>
          </tr>
        ))}
        {shipping > 0 ? (
          <tr>
            <td style={{ padding: "10px 16px", borderBottom: `1px solid ${linea}`, fontSize: 15 }}>Envío</td>
            <td align="right" style={{ padding: "10px 16px", borderBottom: `1px solid ${linea}`, fontSize: 15, fontWeight: 600 }}>
              {money(shipping)}
            </td>
          </tr>
        ) : null}
        {discounts.map((discount) => (
          <tr key={discount.label}>
            <td style={{ padding: "10px 16px", borderBottom: `1px solid ${linea}`, fontSize: 15 }}>{discount.label}</td>
            <td align="right" style={{ padding: "10px 16px", borderBottom: `1px solid ${linea}`, fontSize: 15, whiteSpace: "nowrap", fontWeight: 600 }}>
              − {money(discount.amount)}
            </td>
          </tr>
        ))}
        <tr>
          <td style={{ padding: "12px 16px", fontFamily: display, fontSize: 22, fontWeight: 700 }}>Total</td>
          <td align="right" style={{ padding: "12px 16px", fontFamily: display, fontSize: 26, fontWeight: 700, whiteSpace: "nowrap" }}>
            {money(total)}
          </td>
        </tr>
        {footer ? (
          <tr>
            <td colSpan={2} style={{ padding: "0 16px 12px", fontSize: 14, color: tinta3 }}>
              {footer}
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

/** Datos en dos columnas (alias, CVU, código de retiro). */
export function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ margin: "4px 0 16px", backgroundColor: pared, borderRadius: 0 }}>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <td style={{ padding: "9px 14px", fontSize: 14, color: tinta3, width: "38%" }}>{label}</td>
            <td style={{ padding: "9px 14px", fontSize: 16, fontWeight: 600, color: tinta }}>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
