// Auth resolver — readSessionUser (effective) + readRealSessionUser +
// readImpersonationContext. These are the helpers consumer code uses to
// answer "who is acting on this request?".
//
// Defense-in-depth points enforced here:
// 1. Cookie alone is insufficient — the real session MUST still be admin.
// 2. Stale cookies (target user deleted) fall back to the real admin.
// 3. Self-impersonation (admin acting as themselves) is treated as no-op
//    so readImpersonationContext returns null (banner suppressed).

import type {
  ImpersonationConfig,
  ImpersonationContext,
  KitUser,
} from "./types";
import { readCookie } from "./cookie";

/**
 * Effective session user — returns the impersonated user when the real
 * session is admin AND the impersonation cookie points to a valid user;
 * otherwise the real user. Most consumer code should use this directly:
 * role-gated UI, RLS callers, and any "who am I?" checks see the persona.
 */
export async function readSessionUser<U extends KitUser>(
  config: ImpersonationConfig<U>,
): Promise<U | null> {
  const real = await config.sessionResolver();
  if (!real) return null;
  if (!config.isAdmin(real)) return real;

  const targetId = await readCookie(config);
  if (!targetId) return real;

  const target = await config.userById(targetId);
  if (!target) return real;        // stale cookie — fall back to real admin
  return target;
}

/**
 * Real (cookie-bound) session user, ignoring any impersonation cookie.
 * Used by the admin-impersonate endpoints themselves (they MUST be gated
 * on the REAL admin so demoted-from-admin users can't keep impersonating
 * with a stale cookie) and by requireAdmin/requireRealAdmin.
 */
export async function readRealSessionUser<U extends KitUser>(
  config: ImpersonationConfig<U>,
): Promise<U | null> {
  return config.sessionResolver();
}

/**
 * Returns the impersonation context when active (real admin + acting-as
 * user). Returns null when:
 * - No real session, or real isn't admin
 * - No impersonation cookie
 * - Target user doesn't exist (stale cookie)
 * - Self-impersonation (admin acting as themselves; suppress banner)
 *
 * Consumer renders the persistent banner based on this.
 */
export async function readImpersonationContext<U extends KitUser>(
  config: ImpersonationConfig<U>,
): Promise<ImpersonationContext<U> | null> {
  const real = await config.sessionResolver();
  if (!real || !config.isAdmin(real)) return null;

  const targetId = await readCookie(config);
  if (!targetId) return null;

  const target = await config.userById(targetId);
  if (!target) return null;
  if (target.id === real.id) return null;  // no-op impersonation

  return {
    realAdmin: { id: real.id, email: real.email } as Pick<U, "id" | "email">,
    actingAs: {
      id: target.id,
      email: target.email,
      publicHandle: target.publicHandle ?? null,
      displayName: target.displayName ?? null,
    } as Pick<U, "id" | "email" | "publicHandle" | "displayName">,
  };
}
