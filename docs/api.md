# API reference — @gharikishore/impersonation-kit

## `createImpersonation(config) → ImpersonationKit`

Factory function that captures your project's configuration once and returns a `kit` object with all helpers pre-bound.

### Config (`ImpersonationConfig<U>`)

```typescript
interface ImpersonationConfig<U extends KitUser = KitUser> {
  cookieName: string;
  cookieTtlSeconds: number;
  sessionResolver: () => Promise<U | null>;
  isAdmin: (user: U) => boolean;
  userById: (id: string) => Promise<U | null>;
  candidateFilter: (realAdmin: U) => Promise<U[]>;
  defaultLandingFor: (impersonatedUser: U) => string;
  auditWriter: (entry: AuditEntry) => Promise<void>;
  theme?: ImpersonationTheme;
}
```

| Field | Required | Purpose |
|---|---|---|
| `cookieName` | yes | Cookie key. Use a project prefix (`myapp_impersonate`). |
| `cookieTtlSeconds` | yes | Cookie lifetime. Recommended 8 hours (`60 * 60 * 8`). |
| `sessionResolver` | yes | Returns the REAL (cookie-bound) logged-in user. Your Supabase / NextAuth / Clerk / custom resolver. |
| `isAdmin` | yes | Your admin check. The whole impersonation flow gates on this — non-admins can never impersonate. |
| `userById` | yes | Fetch a user by id. Used to resolve the cookie value to a User row. |
| `candidateFilter` | yes | Returns who the admin can impersonate. **This is the most project-specific decision.** See examples below. |
| `defaultLandingFor` | yes | Returns the route the persona lands on when impersonation starts. |
| `auditWriter` | yes | Writes an audit-log entry. The kit auto-stamps `impersonatedByUserId` before calling this. |
| `theme` | no | Visual tokens for the built-in banner + page UI. |

### Returned kit (`ImpersonationKit<U>`)

```typescript
interface ImpersonationKit<U extends KitUser = KitUser> {
  readSessionUser(): Promise<U | null>;
  readRealSessionUser(): Promise<U | null>;
  readImpersonationContext(): Promise<ImpersonationContext<U> | null>;
  requireAdmin(): Promise<U>;          // throws GateResponse on 401/403
  requireRealAdmin(): Promise<U>;      // throws GateResponse on 401/403
  insertAuditEntry(entry): Promise<void>;
  getImpersonatorId(): Promise<string | null>;
  _config: ImpersonationConfig<U>;
}
```

| Method | Returns | When to use |
|---|---|---|
| `readSessionUser` | Effective user (impersonated when applicable, real otherwise) | Most calls. RLS callers, role-gated UI, "who am I?" checks. |
| `readRealSessionUser` | Real session user, ignoring impersonation cookie | Banner label, impersonate endpoint itself. |
| `readImpersonationContext` | `{ realAdmin, actingAs }` or null | Render the banner. Returns null when not impersonating (or on self-impersonation no-op). |
| `requireAdmin` | The admin user or throws | Inside admin-only Next.js route handlers. Catch `GateResponse` to return the 401/403. |
| `requireRealAdmin` | Same as above, semantically marks "real-admin context" | At impersonate endpoints + audit calls. |
| `insertAuditEntry` | void | Wrap your audit writes — auto-stamps impersonator id when applicable. |
| `getImpersonatorId` | Admin id when impersonating, else null | Manual audit composition. |

### Direct (non-throwing) variants

Importable from the kit root for consumers who prefer `U | NextResponse` return types instead of throwing:

```typescript
import {
  readSessionUser, readRealSessionUser, readImpersonationContext,
  requireAdmin, requireRealAdmin,
  insertAuditEntry, getImpersonatorId,
  readCookie, setCookie, clearCookie,
} from "@gharikishore/impersonation-kit";
```

These take the `config` as their first argument instead of being pre-bound.

## `createImpersonateRoute(kit) → { POST, DELETE }`

Returns Next.js App Router handlers for `/api/admin/impersonate`.

```typescript
// app/api/admin/impersonate/route.ts
export const { POST, DELETE } = createImpersonateRoute(impersonation);
```

- **POST** with body `{ userId: string }`: starts impersonation. Returns `{ ok, actingAs, target }` where `target` is the `defaultLandingFor(user)` route.
- **DELETE**: ends impersonation. Returns `{ ok }`.

Both endpoints gate on `requireRealAdmin`.

## `createCandidatesRoute(kit) → { GET }`

Returns Next.js App Router handler for `/api/admin/impersonate/candidates`.

```typescript
// app/api/admin/impersonate/candidates/route.ts
export const { GET } = createCandidatesRoute(impersonation);
```

- **GET**: returns `{ users: User[] }` — the list from `config.candidateFilter(admin)`.

Gates on `requireRealAdmin`.

## `<ImpersonationBanner />`

Pinned banner showing impersonation context. Renders nothing when not impersonating.

```tsx
import { ImpersonationBanner } from "@gharikishore/impersonation-kit/ui";

// In your root layout
<ImpersonationBanner
  meEndpoint="/api/me"                      // default
  exitEndpoint="/api/admin/impersonate"     // default
  theme={{ bannerBg: "#7a1212", ... }}      // optional
/>
```

Requires `/api/me` to return `{ impersonating: { realAdminEmail, actingAsEmail, actingAsHandle?, actingAsDisplayName? } | null }`.

## `<ImpersonatePage />`

Admin switcher UI. List of candidates + Switch-to-X buttons.

```tsx
import { ImpersonatePage } from "@gharikishore/impersonation-kit/ui";

// app/admin/impersonate/page.tsx
export default function Page() {
  return <ImpersonatePage
    sortRows={(a, b) => a.email.localeCompare(b.email)}
    theme={{ bannerBg: "#7a1212" }}
  />;
}
```

Specforge keeps its own admin/impersonate page (Vellum-styled). Most consumers will use this default and theme it.

## Types

See [`src/types.ts`](../src/types.ts) for the source-of-truth interfaces:

- `KitUser` — minimum user shape (id, email, optional handle + displayName)
- `ImpersonationConfig<U>` — factory config
- `ImpersonationKit<U>` — returned object
- `ImpersonationContext<U>` — banner-render context
- `AuditEntry` — audit-log entry shape
- `ImpersonationTheme` — UI theme tokens
