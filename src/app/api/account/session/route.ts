import { NextResponse } from "next/server";
import { getCurrentAccount } from "@/lib/auth";
import { getMyCustomerRepairsSummary } from "@/lib/repairs";

export async function GET() {
  const account = await getCurrentAccount();
  let recentUpdates = 0;
  if (account?.accountStatus === "active" && account.role === "customer") {
    try {
      recentUpdates = (await getMyCustomerRepairsSummary()).recentUpdates;
    } catch {
      // Session and cart state must remain available during a transient repair-portal failure.
    }
  }
  const response = NextResponse.json({
    account: account
      ? {
          id: account.id,
          firstName: account.firstName,
          role: account.role,
          accountStatus: account.accountStatus,
          recentUpdates,
        }
      : null,
  });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Vary", "Cookie");
  return response;
}
