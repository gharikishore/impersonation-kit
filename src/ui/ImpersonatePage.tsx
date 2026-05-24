"use client";

import { useEffect, useState } from "react";
import type { ImpersonationTheme } from "../types";

// ImpersonatePage — admin-only switcher UI. Lists candidates (via the
// candidates endpoint) + Switch-to-X buttons. POST to the impersonate
// endpoint → full-page reload to the returned target route.
//
// The /api/me check uses the REAL admin session so an admin who is
// already impersonating can still switch (the candidates endpoint gates
// with requireRealAdmin, so it returns the list either way).
//
// Themeable via theme prop. Three customisation surfaces:
//   1. `theme` — colour tokens for the default UI
//   2. `renderRow` — per-row override (consumer owns the row markup)
//      (#976)
//   3. `groupBy` + optional `groupOrder` — section headers grouped by
//      consumer-supplied key (#977)
// When `renderRow` is supplied the default table goes away — consumer
// rows render inside a flat container. When `groupBy` is supplied,
// section headers appear before each group; this composes with
// `renderRow`.

export type ImpersonationRow = {
  id: string;
  email: string;
  displayName: string | null;
  publicHandle: string | null;
  systemRole?: string;
  domainRole?: string | null;
};

type Me = {
  email: string | null;
  isAdmin: boolean;
  impersonating: {
    realAdminEmail: string;
    actingAsEmail: string;
  } | null;
};

export interface ImpersonatePageProps {
  /** Endpoint that returns `{ users: ImpersonationRow[] }`. */
  candidatesEndpoint?: string;
  /** Endpoint that POST/DELETEs the impersonate cookie. */
  impersonateEndpoint?: string;
  /** Endpoint that returns `{ isAdmin, impersonating }`. */
  meEndpoint?: string;
  /** Optional theme tokens (currently only used for the row's switch button). */
  theme?: ImpersonationTheme;
  /** Optional row sort comparator. */
  sortRows?: (a: ImpersonationRow, b: ImpersonationRow) => number;
  /**
   * #976 — Per-row UI override. If supplied, the kit drops its default
   * table and renders consumer-returned nodes inside a flat container.
   * The consumer owns the row markup; the kit owns the iteration +
   * click handler + busy state.
   *
   * Example:
   *   renderRow={(user, { busy, onSwitch }) => (
   *     <YourCard onClick={onSwitch} disabled={busy}>
   *       {user.publicHandle} — {user.email}
   *     </YourCard>
   *   )}
   */
  renderRow?: (
    user: ImpersonationRow,
    opts: { busy: boolean; onSwitch: () => void },
  ) => React.ReactNode;
  /**
   * #977 — Group candidates by the returned key. The kit renders a
   * section header (h2) before each group. Group order defaults to
   * insertion order (first user's group first); override with `groupOrder`.
   * Return null/undefined to put a user in the trailing "ungrouped" group.
   *
   * Composes with `renderRow` — section headers stay kit-default,
   * row UI stays consumer-controlled.
   *
   * Example:
   *   groupBy={(user) =>
   *     user.domainRole?.startsWith('a') ? 'Architects'
   *     : user.domainRole?.startsWith('c') ? 'Creators'
   *     : 'Customers'
   *   }
   */
  groupBy?: (user: ImpersonationRow) => string | null | undefined;
  /** Optional explicit group ordering. Groups not in this array are appended in insertion order. */
  groupOrder?: string[];
}

export function ImpersonatePage({
  candidatesEndpoint = "/api/admin/impersonate/candidates",
  impersonateEndpoint = "/api/admin/impersonate",
  meEndpoint = "/api/me",
  theme,
  sortRows,
  renderRow,
  groupBy,
  groupOrder,
}: ImpersonatePageProps = {}): React.ReactElement {
  const [me, setMe] = useState<Me | null>(null);
  const [users, setUsers] = useState<ImpersonationRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(meEndpoint, { cache: "no-store" })
      .then((r) => r.json())
      .then(setMe)
      .catch(() => setMe({ email: null, isAdmin: false, impersonating: null }));
    fetch(candidatesEndpoint, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { users?: ImpersonationRow[]; error?: string }) => {
        if (d.error) setError(d.error);
        else {
          const list = (d.users ?? []).slice();
          if (sortRows) list.sort(sortRows);
          setUsers(list);
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Load failed"));
  }, [meEndpoint, candidatesEndpoint, sortRows]);

  const gateOk = (me?.isAdmin ?? false) || (me?.impersonating != null);

  async function switchTo(userId: string): Promise<void> {
    setBusy(userId);
    setError(null);
    try {
      const r = await fetch(impersonateEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const body = await r.json();
      if (!r.ok || !body.ok) {
        setError(body.error ?? "Failed");
        setBusy(null);
        return;
      }
      window.location.href = body.target ?? "/";
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(null);
    }
  }

  if (me && !gateOk) {
    return (
      <div style={{ padding: 32, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
        <h1>Admin access required.</h1>
        <p>Sign in as an admin to use the impersonation switcher.</p>
      </div>
    );
  }

  const buttonStyle: Record<string, string> = {
    background: theme?.bannerBg ?? "#1a3a78",
    color: theme?.bannerFg ?? "#ffffff",
    padding: "6px 14px",
    border: "0",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    ...(theme?.exitButtonStyle ?? {}),
  };

  return (
    <div style={{ padding: 32, fontFamily: "ui-sans-serif, system-ui, sans-serif", maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 8 }}>Impersonate user</h1>
      <p style={{ marginBottom: 24, color: "#666", fontSize: 14 }}>
        Select a user to act as. Your real admin session stays bound; all
        actions are audit-logged with both your id and the persona&apos;s.
      </p>
      {error && (
        <div style={{ padding: 12, background: "#fee", color: "#900", borderRadius: 6, marginBottom: 16 }}>
          {error}
        </div>
      )}
      {!users && !error && <div>Loading…</div>}
      {users && users.length === 0 && <div>No impersonable users available.</div>}
      {users && users.length > 0 && renderGroupedOrFlat({
        users,
        groupBy,
        groupOrder,
        renderRow,
        renderDefaultGroup: (groupUsers, groupName) => renderDefaultTable({
          users: groupUsers,
          buttonStyle,
          busy,
          switchTo,
          headingLabel: groupName,
        }),
        renderCustomGroup: (groupUsers, groupName) => (
          <section key={groupName ?? "__ungrouped"} style={{ marginBottom: 24 }}>
            {groupName && <h2 style={{ fontSize: 14, fontWeight: 600, marginTop: 16, marginBottom: 8, color: "#444", textTransform: "uppercase", letterSpacing: 0.6 }}>{groupName}</h2>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {groupUsers.map((u) => (
                <div key={u.id}>
                  {renderRow!(u, { busy: busy === u.id, onSwitch: () => switchTo(u.id) })}
                </div>
              ))}
            </div>
          </section>
        ),
      })}
    </div>
  );
}

// Helper — bundles the grouping logic so it composes cleanly with the
// renderRow override. Returns React nodes for the body region.
function renderGroupedOrFlat(args: {
  users: ImpersonationRow[];
  groupBy?: (u: ImpersonationRow) => string | null | undefined;
  groupOrder?: string[];
  renderRow?: (u: ImpersonationRow, opts: { busy: boolean; onSwitch: () => void }) => React.ReactNode;
  renderDefaultGroup: (groupUsers: ImpersonationRow[], groupName: string | null) => React.ReactNode;
  renderCustomGroup: (groupUsers: ImpersonationRow[], groupName: string | null) => React.ReactNode;
}): React.ReactNode {
  const { users, groupBy, groupOrder, renderRow, renderDefaultGroup, renderCustomGroup } = args;

  // No groupBy → render a single (unlabeled) group.
  if (!groupBy) {
    return renderRow ? renderCustomGroup(users, null) : renderDefaultGroup(users, null);
  }

  // Build insertion-ordered Map of groups.
  const groups = new Map<string | null, ImpersonationRow[]>();
  for (const u of users) {
    const key = groupBy(u) ?? null;
    const list = groups.get(key);
    if (list) list.push(u);
    else groups.set(key, [u]);
  }

  // Order: groupOrder first, then any unlisted keys in insertion order.
  const orderedKeys: (string | null)[] = [];
  if (groupOrder) {
    for (const k of groupOrder) if (groups.has(k)) orderedKeys.push(k);
  }
  for (const k of groups.keys()) {
    if (!orderedKeys.includes(k)) orderedKeys.push(k);
  }

  return (
    <>
      {orderedKeys.map((key) => {
        const groupUsers = groups.get(key) ?? [];
        return renderRow
          ? renderCustomGroup(groupUsers, key)
          : renderDefaultGroup(groupUsers, key);
      })}
    </>
  );
}

// Helper — default table rendering for one group of users.
function renderDefaultTable(args: {
  users: ImpersonationRow[];
  buttonStyle: Record<string, string>;
  busy: string | null;
  switchTo: (userId: string) => void;
  headingLabel: string | null;
}): React.ReactNode {
  const { users, buttonStyle, busy, switchTo, headingLabel } = args;
  return (
    <section key={headingLabel ?? "__ungrouped"} style={{ marginBottom: 24 }}>
      {headingLabel && <h2 style={{ fontSize: 14, fontWeight: 600, marginTop: 16, marginBottom: 8, color: "#444", textTransform: "uppercase", letterSpacing: 0.6 }}>{headingLabel}</h2>}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #ddd", textAlign: "left" }}>
            <th style={{ padding: 8 }}>Handle</th>
            <th style={{ padding: 8 }}>Email</th>
            <th style={{ padding: 8 }}>Role</th>
            <th style={{ padding: 8 }}></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
              <td style={{ padding: 8 }}>{u.publicHandle ?? u.displayName ?? "—"}</td>
              <td style={{ padding: 8, color: "#666" }}>{u.email}</td>
              <td style={{ padding: 8, fontSize: 11, color: "#666" }}>
                {u.systemRole}{u.domainRole ? ` · ${u.domainRole}` : ""}
              </td>
              <td style={{ padding: 8, textAlign: "right" }}>
                <button
                  type="button"
                  disabled={busy === u.id}
                  style={{ ...buttonStyle, opacity: busy === u.id ? 0.6 : 1 }}
                  onClick={() => switchTo(u.id)}
                >
                  {busy === u.id ? "Switching…" : `Switch to ${u.publicHandle ?? u.email}`}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
