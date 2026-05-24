// Admin gate — both requireAdmin and requireRealAdmin use the REAL session.
//
// Critical design decision (Specforge intake #558): the admin gate uses the
// REAL session, NOT the impersonated one. Without this, an admin impersonating
// a non-admin gets locked out of their own admin tooling — breaking cross-tab
// workflows where the admin impersonates in tab B and walks back to tab A on
// /admin/*. The impersonation cookie only affects non-admin endpoints + UI
// surfaces; admin operational tooling stays accessible regardless.
//
// The two functions (requireAdmin + requireRealAdmin) are functionally
// equivalent today but kept distinct for call-site clarity:
//   - requireAdmin       → "this is a normal admin-only endpoint"
//   - requireRealAdmin   → "this is the impersonate endpoint itself, or audit"
// If the design ever diverges, only the differing helper needs to change.

import { NextResponse } from "next/server";
import type { ImpersonationConfig, KitUser } from "./types";
import { readRealSessionUser } from "./auth-resolver";

/**
 * Returns the admin user when the request is authenticated as an admin;
 * otherwise returns a NextResponse with 401 (no session) or 403 (not admin).
 *
 * Call sites:
 *   const ctx = await requireAdmin();
 *   if (ctx instanceof NextResponse) return ctx;
 *   const adminUser = ctx;
 */
export async function requireAdmin<U extends KitUser>(
  config: ImpersonationConfig<U>,
): Promise<U | NextResponse> {
  const user = await readRealSessionUser(config);
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!config.isAdmin(user)) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  return user;
}

/**
 * Functionally identical to requireAdmin today (both REAL-session-bound).
 * Use this at impersonate endpoints + audit-log inserts where "real admin"
 * semantics are load-bearing for the call-site reader.
 */
export async function requireRealAdmin<U extends KitUser>(
  config: ImpersonationConfig<U>,
): Promise<U | NextResponse> {
  return requireAdmin(config);
}
