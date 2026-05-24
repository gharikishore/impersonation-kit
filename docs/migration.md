# Migration guide — from inline copy to impersonation-kit

This guide walks through migrating an existing inline impersonation implementation (e.g. copy-pasted from Specforge or similar) to consume `@gharikishore/impersonation-kit` via submodule. Allow 30-60 minutes depending on how much custom UX you've layered on.

This guide is validated by Specforge's own migration in intake #952 of META #947.

## Before you start

Take inventory of what you have. Most projects with inline impersonation will have variants of these 8 files:

- `src/lib/api-auth.ts` — cookie + `readSessionUser` + `readRealSessionUser` + `readImpersonationContext`
- `src/lib/admin.ts` — `requireAdmin` + `requireRealAdmin`
- `src/lib/audit.ts` — `insertAuditEntry` + `getImpersonatorId`
- `src/app/api/admin/impersonate/route.ts` — POST + DELETE
- `src/app/api/admin/impersonate/candidates/route.ts` — GET
- `src/components/ImpersonationBanner.tsx` — banner UI
- `src/app/admin/impersonate/page.tsx` — switcher UI
- `src/db/schema/audit.ts` — `impersonated_by_user_id` column

Map yours to this list.

## Strategy: thin shim, not full rewrite

The cleanest migration keeps all existing import paths working — every consumer of `import { readSessionUser } from "@/lib/api-auth"` keeps that import unchanged. The files become thin wrappers around the kit.

This means:
- No "big-bang" refactor across the whole codebase
- Easy rollback if anything misbehaves (revert the 6 wrapper files)
- The kit's responsibilities are isolated to a single new config file

## Step 1 — Add the submodule

```bash
git submodule add https://github.com/gharikishore/impersonation-kit.git .claude/kits/impersonation
```

Update `.gitignore` if needed (see adoption.md Step 1).

## Step 2 — Create the central config

This is the ONE new file in this migration. See `adoption.md` Step 3 for the full template.

Save it as `src/lib/impersonation.ts`. Wire it to YOUR session resolver + admin check + candidate filter + landing-route function + audit writer.

The audit writer is the trickiest part. **If your project already has an `insertAuditEntry` helper that does additional work** (e.g. routing through another submodule like feedback-triage, schema-specific column mapping, transactional inserts), delegate to it from the kit's `auditWriter`:

```typescript
import { insertAuditEntry } from "./audit";  // your existing helper

export const impersonation = createImpersonation({
  // ...
  auditWriter: async (entry) => {
    // Delegate so impersonate.start / impersonate.end entries flow
    // through the same code path as every other audit write.
    await insertAuditEntry({
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

This is what Specforge does to coordinate with feedback-triage (META #930).

## Step 3 — Refactor `src/lib/api-auth.ts` to a shim

Replace the body with thin wrappers around the kit:

```typescript
import { NextRequest } from "next/server";
import type { User } from "@/db/schema";
import { impersonation } from "./impersonation";

export const IMPERSONATE_COOKIE = "myapp_impersonate"; // your project's cookie name

export async function readRealSessionUser(_req?: NextRequest): Promise<User | null> {
  void _req;
  return (await impersonation.readRealSessionUser()) as User | null;
}

export async function readSessionUser(_req?: NextRequest): Promise<User | null> {
  void _req;
  return (await impersonation.readSessionUser()) as User | null;
}

export async function readSessionEmail(_req?: NextRequest): Promise<string | null> {
  void _req;
  const u = await readSessionUser();
  return u?.email ?? null;
}

export type ImpersonationContext = {
  realAdmin: { id: string; email: string };
  actingAs: { id: string; email: string; publicHandle: string | null; displayName: string | null };
};

export async function readImpersonationContext(): Promise<ImpersonationContext | null> {
  const ctx = await impersonation.readImpersonationContext();
  if (!ctx) return null;
  return {
    realAdmin: { id: ctx.realAdmin.id, email: ctx.realAdmin.email },
    actingAs: {
      id: ctx.actingAs.id,
      email: ctx.actingAs.email,
      publicHandle: ctx.actingAs.publicHandle ?? null,
      displayName: ctx.actingAs.displayName ?? null,
    },
  };
}
```

## Step 4 — Refactor `src/lib/admin.ts` to a shim

```typescript
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/db/schema";
import { readRealSessionUser } from "./api-auth";

export function isAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  return user.systemRole === "admin"; // your check
}

export async function requireAdmin(req?: NextRequest): Promise<User | NextResponse> {
  const user = await readRealSessionUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  return user;
}

export async function requireRealAdmin(req?: NextRequest): Promise<User | NextResponse> {
  return requireAdmin(req);
}
```

(You can also import these directly from the kit — `import { requireAdmin } from ".../kits/impersonation/src/admin-gate"` — but keeping the shim layer makes call sites stable.)

## Step 5 — `src/lib/audit.ts` — depends on your project

Three scenarios:

**A. You have no other audit-helper layer.** Migrate to the kit's `insertAuditEntry`:

```typescript
import { impersonation } from "./impersonation";

export async function insertAuditEntry(entry, txOrDb = db): Promise<void> {
  // ... call impersonation.insertAuditEntry, or use the direct kit import
  // for the txOrDb variant
}
```

**B. You already have an audit-helper layer (e.g. another submodule like feedback-triage).** KEEP IT. Just confirm your `impersonation.ts` `auditWriter` delegates through it (Step 2). Don't migrate audit.ts.

**C. You have custom audit fields (e.g. metadata column).** Use option B — keep your existing audit helper and bridge from `impersonation.ts`'s `auditWriter`.

## Step 6 — Replace the route handlers

```typescript
// app/api/admin/impersonate/route.ts
import { createImpersonateRoute } from "../../../../../.claude/kits/impersonation/src/routes/impersonate";
import { impersonation } from "@/lib/impersonation";

export const runtime = "nodejs";
export const { POST, DELETE } = createImpersonateRoute(impersonation);
```

```typescript
// app/api/admin/impersonate/candidates/route.ts
import { createCandidatesRoute } from "../../../../../../.claude/kits/impersonation/src/routes/candidates";
import { impersonation } from "@/lib/impersonation";

export const runtime = "nodejs";
export const { GET } = createCandidatesRoute(impersonation);
```

## Step 7 — Replace the banner

If your banner is plain-styled, swap directly:

```typescript
"use client";
import { ImpersonationBanner as KitBanner } from "../../.claude/kits/impersonation/src/ui/ImpersonationBanner";

export default function ImpersonationBanner() {
  return (
    <KitBanner
      theme={{
        bannerBg: "#7a1212",
        bannerFg: "#ffffff",
        bannerBorderColor: "#5a0e0e",
        exitButtonStyle: {
          background: "#ffffff",
          color: "#7a1212",
          padding: "4px 12px",
          borderRadius: "4px",
          fontWeight: "600",
          fontSize: "13px",
          border: "0",
          cursor: "pointer",
        },
      }}
    />
  );
}
```

If your banner uses your design-kit components (Vellum, etc.), KEEP YOUR INLINE BANNER. The kit's UI is intentionally framework-light; design-kit alignment is a per-project concern.

## Step 8 — Switcher page

Same logic as the banner: kit's `<ImpersonatePage />` is plain-styled. If you have a design-kit-aligned switcher, keep it. Just confirm it hits the same endpoints (`/api/admin/impersonate/candidates` GET + `/api/admin/impersonate` POST).

## Step 9 — Schema is unchanged

The kit doesn't define schema. Your `audit_log.impersonated_by_user_id` column stays as-is. No migration needed.

## Step 10 — Typecheck

```bash
npx tsc --noEmit --skipLibCheck
```

Should be zero new errors. Pre-existing errors unrelated to impersonation are unaffected.

## Step 11 — End-to-end smoke test

Same as adoption.md Step 8. Verify:
1. Sign in as admin
2. `/admin/impersonate` lists candidates
3. Switch → land on persona's route, banner pinned
4. Role-gated UI shows persona
5. Exit → back to `/admin/impersonate`, banner gone
6. Audit log: `impersonate.start` + `impersonate.end` entries with `impersonated_by_user_id`

## Step 12 — Commit

```bash
git add .gitmodules .gitignore .claude/kits/impersonation src/lib/impersonation.ts src/lib/api-auth.ts src/lib/admin.ts src/components/ImpersonationBanner.tsx src/app/api/admin/impersonate/*
git commit -m "Migrate to impersonation-kit submodule"
```

## What didn't change

Important boundary clarification — this migration affects ONLY the impersonation flow. The kit does NOT:
- Replace your auth (Supabase, NextAuth, Clerk continue as-is)
- Replace your audit-log table (just adds the impersonator-id column)
- Replace your existing user table (just adapts its shape via the `KitUser` interface)
- Replace your design system (UI components are themeable or replaceable)

## Rollback

If something breaks: revert the 6 wrapper files to their pre-kit state. The kit's submodule stays initialized but unused. Re-attempt after fixing the root cause.

## Reference

Specforge's complete migration is at commit `0e3b846`:
- Submodule add: `.gitmodules` + `.claude/kits/impersonation`
- Central config: `src/lib/impersonation.ts`
- Audit reconciliation with feedback-triage: `src/lib/impersonation.ts` → `auditWriter` delegates to `insertAuditEntry` from feedback-triage
- 6 wrapper files: see the commit diff

Read it for a real-world example of every pattern in this guide.
