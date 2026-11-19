import { LogoutButton } from "@/components/logout-button";
import { requireAccount } from "@/lib/auth";
import { AccountNav } from "./account-nav";
import styles from "./account.module.css";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const account = await requireAccount();
  return (
    <div className={`page ${styles.area}`}>
      <div className={styles.shell}>
        <aside className={styles.side}>
          <div className={styles.who}>
            <strong>{account.firstName || account.fullName || "Mi cuenta"}</strong>
            <span>{account.email}</span>
          </div>
          <AccountNav role={account.role} />
          <LogoutButton className={styles.logout}>Cerrar sesión</LogoutButton>
        </aside>
        <div className={styles.main}>{children}</div>
      </div>
    </div>
  );
}
