"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAccountSummary } from "@/components/account-provider";

const MINIMUM_REFRESH_INTERVAL_MS = 10_000;

export function RepairFocusRefresh() {
  const router = useRouter();
  const { refresh: refreshAccount } = useAccountSummary();
  const lastRefreshAt = useRef(Date.now());

  useEffect(() => {
    const refresh = () => {
      const now = Date.now();
      if (now - lastRefreshAt.current < MINIMUM_REFRESH_INTERVAL_MS) return;
      lastRefreshAt.current = now;
      router.refresh();
      void refreshAccount();
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshAccount, router]);

  return null;
}
