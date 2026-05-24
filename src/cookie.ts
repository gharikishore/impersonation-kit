// Cookie helpers — set/clear/read the impersonation cookie. Bound to the
// kit's config (cookieName + cookieTtlSeconds). Server-side only (uses
// next/headers cookies() API).

import { cookies } from "next/headers";
import type { ImpersonationConfig, KitUser } from "./types";

/**
 * Read the current impersonation cookie value, or null if absent.
 * Returns the impersonated user's id as a string.
 */
export async function readCookie<U extends KitUser>(
  config: ImpersonationConfig<U>,
): Promise<string | null> {
  const c = await cookies();
  return c.get(config.cookieName)?.value ?? null;
}

/**
 * Set the impersonation cookie to a user id. HttpOnly, SameSite=Lax,
 * secure in production. TTL from config.
 */
export async function setCookie<U extends KitUser>(
  config: ImpersonationConfig<U>,
  userId: string,
): Promise<void> {
  const c = await cookies();
  c.set(config.cookieName, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: config.cookieTtlSeconds,
  });
}

/**
 * Delete the impersonation cookie. Returns the previous value (if any)
 * so the caller can audit-log the exit transition.
 */
export async function clearCookie<U extends KitUser>(
  config: ImpersonationConfig<U>,
): Promise<string | null> {
  const c = await cookies();
  const prev = c.get(config.cookieName)?.value ?? null;
  c.delete(config.cookieName);
  return prev;
}
