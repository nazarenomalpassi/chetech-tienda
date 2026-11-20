// La página de servicio técnico conserva su diseño propio: sus estilos se cargan solo acá.
import "@/styles/legacy/service.css";
import { montechCompacta } from "@/lib/fonts-compacta";

export default function ServiceLayout({ children }: { children: React.ReactNode }) {
  // La envoltura no dibuja nada (display: contents): solo trae la letra compacta de esta zona.
  return (
    <div className={`zona-compacta ${montechCompacta.variable}`} style={{ display: "contents" }}>
      {children}
    </div>
  );
}
