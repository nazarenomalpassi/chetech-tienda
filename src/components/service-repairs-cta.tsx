"use client";

import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { useAccountSummary } from "@/components/account-provider";

export function ServiceRepairsCta() {
  const { account, loading } = useAccountSummary();
  const recentUpdates =
    !loading && account?.accountStatus === "active" && account.role === "customer"
      ? account.recentUpdates
      : 0;

  return (
    <Link className="button ghost" href="/cuenta/reparaciones">
      <ClipboardList />
      {recentUpdates > 0
        ? `Mis reparaciones · ${recentUpdates} ${recentUpdates === 1 ? "novedad" : "novedades"}`
        : "Consultar estado de mi reparación"}
    </Link>
  );
}
