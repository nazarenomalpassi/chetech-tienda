import { siteConfig } from "@/config/site";
import { requireAdmin } from "@/lib/auth";

export default async function AdminSettingsPage() {
  await requireAdmin();
  return (
    <>
      <div className="admin-heading">
        <p className="eyebrow">Tienda</p>
        <h1>Configuración</h1>
        <p>Estado de las integraciones y decisiones que requieren credenciales reales.</p>
      </div>
      <div className="admin-settings-grid">
        <article>
          <span className="status-pill active">Activo</span>
          <h2>Supabase Auth</h2>
          <p>Correo y contraseña, verificación, recuperación y sesiones SSR.</p>
        </article>
        <article>
          <span className="status-pill">Pendiente</span>
          <h2>SMTP transaccional</h2>
          <p>
            Debe configurarse un proveedor real antes de producción para evitar el límite del correo
            de prueba de Supabase.
          </p>
        </article>
        <article>
          <span className="status-pill">No configurado</span>
          <h2>Google y MFA</h2>
          <p>
            La arquitectura está preparada, pero no se inventaron credenciales OAuth ni se activó
            MFA sin enrolamiento.
          </p>
        </article>
        <article>
          <span className="status-pill">No cargado</span>
          <h2>Analítica</h2>
          <p>
            No se cargan Meta Pixel ni GA4. Requerirán IDs reales y consentimiento para cookies no
            esenciales.
          </p>
        </article>
        <article>
          <span className="status-pill active">Operativo</span>
          <h2>WhatsApp</h2>
          <p>
            {siteConfig.phoneDisplay}. Cada apertura nace de un pedido numerado y no se cuenta como
            compra confirmada.
          </p>
        </article>
        <article>
          <span className="status-pill active">Fuente protegida</span>
          <h2>Inventario</h2>
          <p>
            Precio, stock y categorías continúan sincronizados desde el sistema interno del local.
          </p>
        </article>
      </div>
    </>
  );
}
