# Design history + anti-patterns

The "why" behind the kit's API + behaviour decisions. Read this when you hit a confusing edge case during adoption / migration and want to understand the original design rationale.

## Anti-patterns (avoid)

These are the failure modes the kit was specifically designed to prevent. If you find yourself working around the kit, check whether you're falling into one of these.

1. **Don't make `requireAdmin()` use the effective user.** Locking admin out of their own tooling during impersonation is broken UX. Without this, an admin who impersonates a non-admin in tab B and then walks back to tab A on `/admin/*` immediately gets re-prompted for access. See Specforge intake #558. The kit enforces this by binding both `requireAdmin` and `requireRealAdmin` to `readRealSessionUser`.

2. **Don't auto-impersonate** on sign-in or via session-restore. Impersonation is an explicit click → explicit POST. Anything else and you can't audit when it started. The kit's route handler factories only set the cookie on explicit `POST /api/admin/impersonate { userId }`.

3. **Don't allow long-lived impersonation cookies.** 8 hours is the design ceiling (`cookieTtlSeconds: 60 * 60 * 8`). Daily-rotate is fine; weekly-persistent is not. Left-open-laptop safety matters more than convenience.

4. **Don't let the impersonation cookie outlive the admin's session.** If the admin signs out, clear it. If the admin's role is revoked, the cookie becomes inert automatically (the resolver checks real-session-is-admin every request via `sessionResolver` + `isAdmin`).

5. **Don't impersonate real signed-up users without an explicit business reason + escalated audit trail.** The kit owns no opinion on this — the `candidateFilter` is the consumer's call. But Specforge's posture (limit to test/seed accounts) is the conservative default. Real-user impersonation is a different (and weirder) trust posture — gate it separately if you ever need it.

6. **Don't skip the audit-log integration.** The whole point of the pattern is governance defensibility. If every audit row written during impersonation doesn't carry `impersonated_by_user_id`, you lose the trail. The kit's `insertAuditEntry` auto-stamps this for you — use it everywhere, not raw `db.insert(auditLog).values(...)`.

## Defense-in-depth in the auth resolver

The `readSessionUser` flow has three guard rails baked in:

1. **The cookie alone is not enough — the real session MUST still be admin.** A demoted-from-admin user with a leftover cookie produces no impersonation. The resolver checks `isAdmin(real)` on every request.
2. **Stale cookies fall back gracefully.** If the target user was deleted (cookie points to a non-existent id), `userById` returns null and the resolver returns the real admin.
3. **Self-impersonation is a no-op.** An admin who somehow impersonates themselves gets `readImpersonationContext: null` (banner suppressed). The audit-log entries are still written if they're explicitly triggered, but the runtime UI behaves as if impersonation isn't active.

## The actor / impersonator distinction

Mental model: every audit row has two identity columns.

- `actor_user_id` — the persona (the user the system thinks performed the action). This is what your business-logic queries surface.
- `impersonated_by_user_id` — the human who actually clicked the button. NULL for normal (non-impersonated) actions.

Both are needed for any future governance investigation. The kit's `insertAuditEntry` auto-stamps `impersonated_by_user_id` based on the current request's impersonation state — but only when the caller hasn't explicitly set it (so the impersonate-route entries, which set both ids explicitly, are preserved).

## Why the admin gate uses the REAL session

Originally `requireAdmin` was bound to the effective user. This produced the cross-tab lockout: impersonate in tab B → walk back to tab A on `/admin/backlog` → page returns 403 → admin can't escape without first opening the impersonate page to exit.

The fix (Specforge intake #558): admin gate uses the REAL session. The impersonation cookie only affects non-admin endpoints + user-facing UI. Admin operational tooling (backlog, sessions, notifications, etc.) stays accessible regardless of impersonation state.

In practice this means:
- A non-admin can never become "admin" by setting the cookie — `requireAdmin` would still 403 them
- An admin impersonating a non-admin can still use admin-only routes — `requireAdmin` sees their real admin session
- The two helpers (`requireAdmin` + `requireRealAdmin`) are functionally identical today, but kept distinct so call sites remain readable about intent

## Why the full-page reload on impersonation start + exit

When you switch personas, every component re-reads `/api/me`. The simplest way to ensure consistent state is a full-page reload to the persona's landing route (`defaultLandingFor(target)`). No need for a global state propagation system, no risk of stale role-gated UI bleeding through.

Same on exit: DELETE the cookie + navigate to `/admin/impersonate`. The "navigate to the impersonate page" choice (intake #103) prevents the admin from landing on whichever page the impersonated user was looking at — that page often renders as logged-out chrome once the role context is gone.

## The candidate filter is the most project-specific decision

The kit owns no opinion on who's impersonable. This is the ONE substantive decision each consumer makes per project. Examples in [`adoption.md`](adoption.md) Section 8.

Specforge's choice: only seed accounts where `role_seeds.is_test_account = true` are eligible. The 12 demo seeds (creator-c1..c6, architect-a1/a2/a3/pa/cw_pa, test customer). Real signed-up users are NOT impersonable — admin acting-as-a-real-person is a different trust posture than admin acting-as-test-fixture. See Specforge intake #131 for the design decision.

## Specforge intake references

Read these for the original design discussions:

- **#68** — Original implementation. Cookie + auth resolver + switcher UI.
- **#70** — Blocked direct sign-in to demo accounts; impersonation is the ONLY way to reach them.
- **#71** — Audit propagation. `impersonated_by_user_id` column + `insertAuditEntry()` helper.
- **#103** — Exit-impersonation navigation lands on `/admin/impersonate`, not `/`.
- **#131** — Candidate filter tightened: only `role_seeds.is_test_account = true`. Real users excluded.
- **#136** — Banned direct sign-in for the 12 impersonable seed accounts.
- **#137** — Role-appropriate landing on impersonation start.
- **#558** — Admin gate uses real session, not effective. Fixes cross-tab lockout.
- **#947** — Pattern 3 kit extraction META. The conversion from inline copy-paste to this kit.
- **#952** — Specforge migration to consume this kit. Reference implementation.
