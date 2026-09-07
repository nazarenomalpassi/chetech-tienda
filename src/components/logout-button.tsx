"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { logoutAction } from "@/app/auth-actions";
import { useAccountSummary } from "@/components/account-provider";

export function LogoutButton({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const { refresh } = useAccountSummary();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        startTransition(async () => {
          await logoutAction();
          await refresh();
          router.replace("/");
          router.refresh();
        })
      }
    >
      {pending ? "Cerrando sesión…" : children}
    </button>
  );
}
