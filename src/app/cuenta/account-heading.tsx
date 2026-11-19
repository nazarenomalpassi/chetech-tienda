import Link from "next/link";
import styles from "./account.module.css";

/** Encabezado de cada página de la cuenta, con vuelta opcional a la lista. */
export function AccountHeading({
  title,
  children,
  back,
}: {
  title: string;
  children?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className={styles.heading}>
      {back ? (
        <Link href={back.href} className={styles.back}>
          {back.label}
        </Link>
      ) : null}
      <h1>{title}</h1>
      {children ? <p>{children}</p> : null}
    </header>
  );
}
