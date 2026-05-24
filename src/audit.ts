// Audit-log auto-stamping. Every audit entry written during an admin-
// impersonated session must capture who actually clicked the button. The
// admin's id goes on audit_log.impersonated_by_user_id; the effective user
// (the persona) stays in actor_user_id so existing queries still surface
// the persona as the action's owner.
//
// Mental model: many admins may share the same persona handle over time.
// The (actor_user_id, impersonated_by_user_id) pair is the governance
// guarantee that lets a future investigation trace any action back to the
// human who triggered it.

import type { AuditEntry, ImpersonationConfig, KitUser } from "./types.js";
import { readCookie } from "./cookie.js";

/**
 * Resolves the impersonating admin's id from the current request, if any.
 * Returns null when the cookie is absent, stale, or the real session
 * doesn't belong to an admin (defense-in-depth: a demoted-from-admin user
 * with a leftover cookie won't stamp anyone).
 */
export async function getImpersonatorId<U extends KitUser>(
  config: ImpersonationConfig<U>,
): Promise<string | null> {
  if (!(await readCookie(config))) return null;
  const real = await config.sessionResolver();
  if (!real || !config.isAdmin(real)) return null;
  return real.id;
}

/**
 * Drop-in for `db.insert(auditLog).values({...})` (and the transactional
 * variant). Auto-stamps impersonated_by_user_id when the current request
 * is operating under an admin impersonation cookie.
 *
 * Caller-supplied `impersonatedByUserId` is preserved — the auto-stamp
 * only fills in when the field is null/undefined. Required for the
 * impersonate endpoints themselves, which set the id explicitly as the
 * source of truth.
 */
export async function insertAuditEntry<U extends KitUser>(
  config: ImpersonationConfig<U>,
  values: AuditEntry,
): Promise<void> {
  const impersonatedByUserId =
    values.impersonatedByUserId !== undefined && values.impersonatedByUserId !== null
      ? values.impersonatedByUserId
      : await getImpersonatorId(config);
  await config.auditWriter({ ...values, impersonatedByUserId });
}
