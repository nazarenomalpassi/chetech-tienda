"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";

export type AccountSummary = {
  id: string;
  firstName: string;
  role: string;
  accountStatus: string;
  recentUpdates: number;
};

type AccountContextValue = {
  account: AccountSummary | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const requestVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const response = await fetch("/api/account/session", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = response.ok
        ? ((await response.json()) as { account?: AccountSummary | null })
        : null;
      if (version === requestVersion.current) setAccount(payload?.account ?? null);
    } catch {
      if (version === requestVersion.current) setAccount(null);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [pathname, refresh]);

  const value = useMemo(() => ({ account, loading, refresh }), [account, loading, refresh]);
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccountSummary() {
  const context = useContext(AccountContext);
  if (!context) throw new Error("useAccountSummary must be used within AccountProvider");
  return context;
}
