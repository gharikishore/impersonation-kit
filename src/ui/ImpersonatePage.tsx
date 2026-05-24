"use client";

import { useEffect, useState } from "react";
import type { ImpersonationTheme } from "../types.js";

// ImpersonatePage — admin-only switcher UI. Lists candidates (via the
// candidates endpoint) + Switch-to-X buttons. POST to the impersonate
// endpoint → full-page reload to the returned target route.
//
// The /api/me check uses the REAL admin session so an admin who is
// already impersonating can still switch (the candidates endpoint gates
// with requireRealAdmin, so it returns the list either way).
//
// Themeable via theme prop. Consumer can supply a render-row callback to
// fully override per-row UI; otherwise a basic table is rendered.

type ImpersonationRow = {
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
}

export function ImpersonatePage({
  candidatesEndpoint = "/api/admin/impersonate/candidates",
  impersonateEndpoint = "/api/admin/impersonate",
  meEndpoint = "/api/me",
  theme,
  sortRows,
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
      {users && users.length > 0 && (
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
      )}
    </div>
  );
}
