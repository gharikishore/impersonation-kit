// createImpersonateRoute(kit) — factory returning Next.js POST + DELETE
// handlers for /api/admin/impersonate.
//
// POST  { userId } → start impersonating user. Sets cookie, writes
//                    impersonate.start audit entry, returns
//                    { ok, actingAs, target } where target is the
//                    default landing route from config.defaultLandingFor().
//
// DELETE          → end impersonation. Clears cookie, writes
//                    impersonate.end audit entry.
//
// Both endpoints gate on the REAL admin (requireRealAdmin) so an admin
// already impersonating user A can hop to user B without exiting first.

import { NextRequest, NextResponse } from "next/server";
import type { ImpersonationKit, KitUser } from "../types.js";
import { setCookie, clearCookie } from "../cookie.js";
import { requireRealAdmin } from "../admin-gate.js";

export function createImpersonateRoute<U extends KitUser>(
  kit: ImpersonationKit<U>,
): {
  POST: (req: NextRequest) => Promise<NextResponse>;
  DELETE: (req: NextRequest) => Promise<NextResponse>;
} {
  return {
    POST: async (req: NextRequest) => {
      const auth = await requireRealAdmin(kit._config);
      if (auth instanceof NextResponse) return auth;
      const adminUser = auth;

      const body = (await req.json().catch(() => null)) as { userId?: unknown } | null;
      const targetId = typeof body?.userId === "string" ? body.userId : null;
      if (!targetId) {
        return NextResponse.json(
          { error: "Body must include userId (string)." },
          { status: 400 },
        );
      }
      const target = await kit._config.userById(targetId);
      if (!target) {
        return NextResponse.json(
          { error: "Target user not found." },
          { status: 404 },
        );
      }

      await setCookie(kit._config, target.id);

      await kit._config.auditWriter({
        actorUserId: adminUser.id,
        impersonatedByUserId: adminUser.id,
        action: "impersonate.start",
        targetTable: "users",
        targetId: target.id,
        before: { email: adminUser.email },
        after: {
          actingAsEmail: target.email,
          actingAsHandle: target.publicHandle ?? null,
        },
      });

      return NextResponse.json({
        ok: true,
        actingAs: {
          id: target.id,
          email: target.email,
          publicHandle: target.publicHandle ?? null,
          displayName: target.displayName ?? null,
        },
        target: kit._config.defaultLandingFor(target),
      });
    },

    DELETE: async (req: NextRequest) => {
      void req;
      const auth = await requireRealAdmin(kit._config);
      if (auth instanceof NextResponse) return auth;
      const adminUser = auth;

      const prev = await clearCookie(kit._config);

      if (prev) {
        await kit._config.auditWriter({
          actorUserId: adminUser.id,
          impersonatedByUserId: adminUser.id,
          action: "impersonate.end",
          targetTable: "users",
          targetId: prev,
          before: { actingAsUserId: prev },
          after: { email: adminUser.email },
        });
      }

      return NextResponse.json({ ok: true });
    },
  };
}
