// createCandidatesRoute(kit) — Next.js GET + POST handlers for
// /api/admin/impersonate/candidates.
//
// GET  → list candidates (delegates to config.candidateFilter)
// POST → create a new impersonable user (delegates to config.createCandidate
//        when configured; otherwise returns 501). Audit-logs candidate.created.
//
// Both gate on the REAL admin.

import { NextRequest, NextResponse } from "next/server";
import type { ImpersonationKit, KitUser, CreateCandidateInput } from "../types";
import { requireRealAdmin } from "../admin-gate";

export function createCandidatesRoute<U extends KitUser>(
  kit: ImpersonationKit<U>,
): {
  GET: (req: NextRequest) => Promise<NextResponse>;
  POST: (req: NextRequest) => Promise<NextResponse>;
} {
  return {
    GET: async (req: NextRequest) => {
      void req;
      const auth = await requireRealAdmin(kit._config);
      if (auth instanceof NextResponse) return auth;
      const admin = auth;

      const users = await kit._config.candidateFilter(admin);
      return NextResponse.json({ users });
    },

    /**
     * Intake #978 — Create a new impersonable user.
     * Gated by the consumer-supplied `createCandidate` config callback;
     * returns 501 (Not Implemented) if not configured. Audit-logs the
     * creation event.
     */
    POST: async (req: NextRequest) => {
      const auth = await requireRealAdmin(kit._config);
      if (auth instanceof NextResponse) return auth;
      const admin = auth;

      if (typeof kit._config.createCandidate !== "function") {
        return NextResponse.json(
          { error: "createCandidate not configured on this kit instance — POST disabled." },
          { status: 501 },
        );
      }

      const body = (await req.json().catch(() => null)) as Partial<CreateCandidateInput> | null;
      if (!body || typeof body.email !== "string" || !isLikelyEmail(body.email)) {
        return NextResponse.json(
          { error: "Body must include a valid email (string)." },
          { status: 400 },
        );
      }

      const input: CreateCandidateInput = {
        email: body.email.trim().toLowerCase(),
        publicHandle: nonEmptyString(body.publicHandle),
        displayName: nonEmptyString(body.displayName),
        roleLabel: nonEmptyString(body.roleLabel),
        roleGroup: nonEmptyString(body.roleGroup),
      };

      let user: U;
      try {
        user = await kit._config.createCandidate(input);
      } catch (e) {
        const message = e instanceof Error ? e.message : "createCandidate failed";
        return NextResponse.json({ error: message }, { status: 500 });
      }

      await kit._config.auditWriter({
        actorUserId: admin.id,
        impersonatedByUserId: admin.id,
        action: "candidate.created",
        targetTable: "users",
        targetId: user.id,
        after: {
          email: user.email,
          publicHandle: user.publicHandle ?? null,
          displayName: user.displayName ?? null,
          roleLabel: input.roleLabel ?? null,
          roleGroup: input.roleGroup ?? null,
        },
      });

      return NextResponse.json({ ok: true, user });
    },
  };
}

function isLikelyEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function nonEmptyString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}
