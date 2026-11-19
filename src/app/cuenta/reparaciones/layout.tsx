// El seguimiento de reparaciones conserva su diseño propio: sus estilos se cargan solo acá.
import "@/styles/legacy/repair.css";

export default function RepairsLayout({ children }: { children: React.ReactNode }) {
  return <div className="repair-area">{children}</div>;
}
