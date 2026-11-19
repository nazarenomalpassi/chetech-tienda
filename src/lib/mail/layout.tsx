// Diseño común de los mails: 600 px, una columna, la carta de ajuste arriba y el cuerpo como
// comprobante. Un solo botón por mail y, debajo, el mismo enlace en texto. HTML con tablas para que
// se vea igual en Gmail, Outlook y el celular.
import type { ReactNode } from "react";

const tinta = "#15181a";
const tinta2 = "#3d4347";
const tinta3 = "#5d6569";
const pared = "#f4f5f3";
const linea = "#d5d8d5";
const carta = ["#c9ccc8", "#f5c400", "#00a7c7", "#1e9e4a", "#c2268f", "#d93025", "#1f4fd8"];

const font = "'Barlow', 'Helvetica Neue', Arial, sans-serif";
const display = "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif";

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
                  style={{ width: "100%", maxWidth: 600, backgroundColor: "#ffffff", border: `1px solid ${linea}`, borderRadius: 10, overflow: "hidden" }}
                >
                  <tbody>
                    <tr>
                      <td>
                        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
                          <tbody>
                            <tr>
                              {carta.map((color) => (
                                <td key={color} height={8} style={{ backgroundColor: color, height: 8, lineHeight: "8px", fontSize: 0 }}>
                                  &nbsp;
                                </td>
                              ))}
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: "22px 28px 4px" }}>
                        <span style={{ fontFamily: display, fontSize: 26, fontWeight: 700, letterSpacing: "0.02em", color: tinta }}>CheTech</span>
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
  return <h1 style={{ margin: "6px 0 12px", fontFamily: display, fontSize: 32, lineHeight: "34px", fontWeight: 700, color: tinta }}>{children}</h1>;
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
            <td style={{ backgroundColor: tinta, borderRadius: 6 }}>
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
  total,
  footer,
}: {
  orderNumber: string;
  items: { name: string; quantity: number; subtotal: number }[];
  shipping: number;
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
      style={{ margin: "8px 0 18px", border: `1.5px solid ${tinta}`, borderRadius: 8, borderCollapse: "separate" }}
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
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ margin: "4px 0 16px", backgroundColor: pared, borderRadius: 8 }}>
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
