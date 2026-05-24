// createCandidatesRoute(kit) — Next.js GET handler that returns the list
// of users the admin is allowed to impersonate.
//
// The actual filter (who's eligible) is owned by the consumer via
// config.candidateFilter — that's the most project-specific decision in
// the whole kit. Gates on the REAL admin (so an admin already
// impersonating can still switch).

import { NextRequest, NextResponse } from "next/server";
import type { ImpersonationKit, KitUser } from "../types.js";
import { requireRealAdmin } from "../admin-gate.js";

export function createCandidatesRoute<U extends KitUser>(
  kit: ImpersonationKit<U>,
): {
  GET: (req: NextRequest) => Promise<NextResponse>;
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
  };
}
