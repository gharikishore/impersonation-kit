# @gharikishore/impersonation-kit

Reusable admin-impersonation library for Next.js + Drizzle apps. One admin can transparently act as any eligible user for verification + support workflows. Audit log auto-captures both the persona and the real admin who triggered each action.

**Canonical implementation reference:** [`gharikishore/specforge`](https://github.com/gharikishore/specforge) — the working app this kit was extracted from.

## Status

**v0.1.0** — pre-1.0. API may change. Consume via git submodule for now; npm/GitHub Packages distribution later when stable.

## Why

Across multiple projects (Specforge, HmBr Impact, HmBr Store, future apps), admin impersonation has the same shape:
- Admin signs in normally
- Admin selects a candidate user from a switcher
- Cookie is set; auth resolver swaps the effective user
- All non-admin endpoints + UI see the impersonated persona
- Audit log captures both the persona AND the real admin
- Banner pinned with one-click Exit
- Admin operational tooling stays accessible (gate uses real session)

Copy-paste-and-drift across projects becomes maintenance debt. This kit packages the project-agnostic 80% and exposes the project-specific 20% as configuration.

## Quickstart (30 seconds)

```bash
# 1. Add as submodule
git submodule add https://github.com/gharikishore/impersonation-kit.git .claude/kits/impersonation
git submodule update --init --recursive

# 2. Configure once in your app
# src/lib/impersonation.ts
import { createImpersonation } from "../../.claude/kits/impersonation/src";
import { ensureUserBySupabaseSession } from "./server-user";
import { db } from "@/db";

export const impersonation = createImpersonation({
  cookieName: "myapp_impersonate",
  cookieTtlSeconds: 8 * 3600,
  sessionResolver: ensureUserBySupabaseSession,
  isAdmin: (user) => user.systemRole === "admin",
  userById: async (id) => { /* db.select... */ },
  candidateFilter: async () => { /* return list of impersonable users */ },
  defaultLandingFor: (user) => user.systemRole === "admin" ? "/admin" : "/dashboard",
  auditWriter: async (entry, tx) => { /* db.insert(auditLog).values(entry) */ },
});

// 3. Mount the routes
// src/app/api/admin/impersonate/route.ts
export const { POST, DELETE } = createImpersonateRoute(impersonation);

// src/app/api/admin/impersonate/candidates/route.ts
export const { GET } = createCandidatesRoute(impersonation);

// 4. Use the helpers
import { readSessionUser, requireAdmin } from "@/lib/impersonation";

// 5. Mount the banner in your root layout
import { ImpersonationBanner } from "../../.claude/kits/impersonation/src/ui";
// <ImpersonationBanner theme={yourTheme} />

# 6. Mount the switcher page
# src/app/admin/impersonate/page.tsx
export { ImpersonatePage as default } from ".../ui";
```

## Architecture

**Pluggable surfaces:**
- `sessionResolver` — how your app gets the current logged-in user
- `isAdmin` — your project's admin check (`user.systemRole === "admin"` is one common shape)
- `userById` — fetch a user by id (used for impersonation cookie resolution)
- `candidateFilter` — who can be impersonated (the most project-specific decision)
- `defaultLandingFor` — where to land on impersonation start (your project's role-routing)
- `auditWriter` — how to write to your audit log (passthrough or wrapper)
- `theme` (optional) — colour/style tokens for the banner + switcher UI

**Fixed (the design):**
- Cookie-based impersonation with 8-hour default TTL
- Auth resolver: cookie + real session must agree before swap
- Audit auto-stamp: `impersonated_by_user_id` captured for every audit entry written during impersonation
- Admin gate uses REAL session (admin operational tooling stays accessible while impersonating)
- Exit affordance always-on via the banner

## Docs

- [`docs/api.md`](docs/api.md) — full API reference for `createImpersonation()`
- [`docs/adoption.md`](docs/adoption.md) — how to mount in a fresh Next.js + Drizzle app
- [`docs/migration.md`](docs/migration.md) — porting an existing copy-paste impl to the kit

## Design history

The high-level design + the design decisions that produced this kit live in [`claude-patterns/admin-impersonation.md`](https://github.com/gharikishore/claude-patterns/blob/main/admin-impersonation.md). Read that first to understand WHY the design choices are the way they are.
