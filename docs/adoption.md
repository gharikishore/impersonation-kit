# Adoption guide — adding impersonation-kit to a new project

This guide walks through adding admin impersonation to a fresh Next.js + Drizzle + Supabase application using `@gharikishore/impersonation-kit`. Allow 30 minutes end-to-end.

## Prerequisites

- Next.js 14+ (App Router)
- React 18+
- Drizzle ORM 0.30+
- A users table with at minimum `{ id, email, publicHandle?, displayName?, role-or-systemRole-marker }`
- An audit-log table with `{ actorUserId, impersonatedByUserId, action, targetTable, targetId, before?, after? }`
- A session resolver (Supabase, NextAuth, Clerk, custom) that returns the current logged-in user

## Step 1 — Add the submodule

```bash
git submodule add https://github.com/gharikishore/impersonation-kit.git .claude/kits/impersonation
git submodule update --init --recursive
```

If your project gitignores `.claude/`:

```gitignore
.claude/*
!.claude/patterns
!.claude/kits
```

Commit `.gitmodules` + `.gitignore`.

## Step 2 — Provision the schema

Your audit-log table needs `impersonated_by_user_id`:

```sql
ALTER TABLE audit_log
  ADD COLUMN impersonated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

-- Partial index — most rows have NULL; only impersonation rows index here.
CREATE INDEX audit_log_impersonated_by_idx ON audit_log (impersonated_by_user_id)
  WHERE impersonated_by_user_id IS NOT NULL;
```

(For projects that use Drizzle migrations, generate the migration and apply.)

## Step 3 — Create the central config

Create `src/lib/impersonation.ts` (or wherever your library code lives):

```typescript
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, auditLog, type User } from "@/db/schema";
import { getCurrentUser } from "./auth";  // your existing session resolver
import { createImpersonation } from "../../.claude/kits/impersonation/src";

export const impersonation = createImpersonation<User>({
  cookieName: "myapp_impersonate",
  cookieTtlSeconds: 60 * 60 * 8,

  sessionResolver: getCurrentUser,
  isAdmin: (u) => u.role === "admin",

  userById: async (id) => {
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0] ?? null;
  },

  candidateFilter: async (admin) => {
    // YOUR PROJECT-SPECIFIC FILTER. See "Candidate filter" section below.
    const rows = await db.select().from(users)
      .where(/* who can be impersonated in your project */);
    return rows.filter((u) => u.id !== admin.id);
  },

  defaultLandingFor: (u) => {
    if (u.role === "admin") return "/admin";
    return "/dashboard";
  },

  auditWriter: async (entry) => {
    await db.insert(auditLog).values({
      actorUserId: entry.actorUserId,
      impersonatedByUserId: entry.impersonatedByUserId,
      action: entry.action,
      targetTable: entry.targetTable,
      targetId: entry.targetId,
      before: entry.before ?? null,
      after: entry.after ?? null,
    });
  },
});
```

## Step 4 — Mount the route handlers

```typescript
// app/api/admin/impersonate/route.ts
import { createImpersonateRoute } from "../../../.claude/kits/impersonation/src/routes/impersonate";
import { impersonation } from "@/lib/impersonation";

export const runtime = "nodejs";
export const { POST, DELETE } = createImpersonateRoute(impersonation);
```

```typescript
// app/api/admin/impersonate/candidates/route.ts
import { createCandidatesRoute } from "../../../../.claude/kits/impersonation/src/routes/candidates";
import { impersonation } from "@/lib/impersonation";

export const runtime = "nodejs";
export const { GET } = createCandidatesRoute(impersonation);
```

## Step 5 — Use the auth helpers across your app

Replace your existing "who's logged in?" checks with the kit's `readSessionUser`:

```typescript
// Anywhere you need the effective user (impersonated when applicable)
import { impersonation } from "@/lib/impersonation";

const user = await impersonation.readSessionUser();
```

Replace admin-route guards with `requireAdmin`:

```typescript
// app/api/admin/some-endpoint/route.ts
import { impersonation, GateResponse } from "@/lib/impersonation";

export async function POST(req: Request) {
  try {
    const admin = await impersonation.requireAdmin();
    // ... admin-only work
  } catch (e) {
    if (e instanceof GateResponse) return e.response;
    throw e;
  }
}
```

Wrap audit writes with `insertAuditEntry`:

```typescript
import { impersonation } from "@/lib/impersonation";

await impersonation.insertAuditEntry({
  actorUserId: user.id,
  impersonatedByUserId: null,  // auto-stamped if impersonating
  action: "user.role_changed",
  targetTable: "users",
  targetId: targetUser.id,
  before: { role: previousRole },
  after: { role: newRole },
});
```

## Step 6 — Mount the banner in your root layout

```typescript
// app/layout.tsx
import { ImpersonationBanner } from "../.claude/kits/impersonation/src/ui";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <ImpersonationBanner theme={{ bannerBg: "#7a1212" }} />
        {children}
      </body>
    </html>
  );
}
```

You'll need an `/api/me` endpoint that returns `{ impersonating }`:

```typescript
// app/api/me/route.ts
import { impersonation } from "@/lib/impersonation";

export async function GET() {
  const user = await impersonation.readSessionUser();
  const ctx = await impersonation.readImpersonationContext();
  return Response.json({
    email: user?.email ?? null,
    isAdmin: user ? impersonation._config.isAdmin(user) : false,
    impersonating: ctx ? {
      realAdminEmail: ctx.realAdmin.email,
      actingAsEmail: ctx.actingAs.email,
      actingAsHandle: ctx.actingAs.publicHandle ?? null,
      actingAsDisplayName: ctx.actingAs.displayName ?? null,
    } : null,
  });
}
```

## Step 7 — Mount the switcher page

```typescript
// app/admin/impersonate/page.tsx
"use client";
import { ImpersonatePage } from "../../../.claude/kits/impersonation/src/ui";

export default function Page() {
  return <ImpersonatePage theme={{ bannerBg: "#7a1212" }} />;
}
```

For Vellum-style or design-system-themed UI: roll your own page that calls the same endpoints (`/api/admin/impersonate/candidates` GET + `/api/admin/impersonate` POST). The kit's page is a good reference implementation.

## Step 8 — Provision an admin + test

1. Sign in as your admin user.
2. Navigate to `/admin/impersonate`.
3. Click "Switch to X" on a candidate.
4. Verify: page reloads to the persona's landing route, banner pinned at top showing "Acting as X — real admin: Y".
5. Browse the app — role-gated UI shows the persona's view.
6. Click "Exit impersonation" → reload to `/admin/impersonate`.
7. Check the audit log: two new entries with `action='impersonate.start'` + `action='impersonate.end'`, both with `impersonated_by_user_id = your admin's id`.

## Candidate filter — the most project-specific decision

The kit owns no opinion on who can be impersonated. Common shapes:

### Pattern A — Test/seed accounts only (Specforge approach)
Use when impersonation is for verifying role-gated UI with seeded test users; never for acting-as-real-customers.

```typescript
candidateFilter: async (admin) => {
  const rows = await db
    .select()
    .from(users)
    .innerJoin(roleSeeds, eq(roleSeeds.email, users.email))
    .where(eq(roleSeeds.isTestAccount, true));
  return rows.filter((r) => r.users.id !== admin.id).map((r) => r.users);
},
```

### Pattern B — All non-admin users (B2C support tooling)
Use when admins need to act as any customer for support workflows. Add extra audit-trail discipline.

```typescript
candidateFilter: async (admin) => {
  const rows = await db.select().from(users).where(ne(users.role, "admin"));
  return rows.filter((u) => u.id !== admin.id);
},
```

### Pattern C — Workspace members (B2B SaaS)
Use when admins are scoped to specific workspaces.

```typescript
candidateFilter: async (admin) => {
  const memberRows = await db
    .select({ user: users })
    .from(users)
    .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
    .where(inArray(workspaceMembers.workspaceId, admin.adminWorkspaces));
  return memberRows.map((r) => r.user).filter((u) => u.id !== admin.id);
},
```

### Pattern D — Marketplace (separate buyer + seller pools)
Use when the admin needs to test marketplace workflows from both sides. The admin selects a buyer OR a seller persona depending on which side of the workflow they're verifying. The kit doesn't enforce a specific grouping — sort/group inside the switcher UI by `users.role` or a similar discriminator.

```typescript
candidateFilter: async (admin) => {
  const rows = await db
    .select()
    .from(users)
    .where(inArray(users.role, ["buyer", "seller"]));
  return rows.filter((u) => u.id !== admin.id);
  // UI tip: in your /admin/impersonate page, group the results into two
  // columns (Buyers / Sellers) so the admin picks the side of the workflow
  // before picking a specific persona.
},
```

## Troubleshooting

**Cookie not setting**: confirm `cookieName` doesn't collide with another cookie. Confirm route runtime is `nodejs` (not `edge` — edge runtime has different cookie semantics).

**Banner not appearing after switch**: confirm `/api/me` is returning `impersonating` correctly. Check browser network tab for the response shape.

**`requireAdmin` returns 403 when impersonating non-admin**: this is the intended behavior — admin gate uses REAL session, not effective. If this breaks your workflow, see Specforge intake #558 in the design history.

**Audit entries missing `impersonated_by_user_id`**: confirm all audit writes go through `insertAuditEntry`, not raw `db.insert(auditLog).values(...)`.

## Next

- Read [`api.md`](api.md) for the full API surface
- See `gharikishore/specforge` for a working consumer example
- See [`migration.md`](migration.md) if you're porting an existing copy-paste impl
