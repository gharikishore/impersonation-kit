"use client";

import { useEffect, useState } from "react";
import type { ImpersonationTheme } from "../types";

// ImpersonationBanner — pinned banner shown when an admin is impersonating.
// Reads /api/me for the impersonating context block. Renders nothing when
// not impersonating. Click Exit → DELETE the impersonate cookie + full-page
// reload (so every component re-reads /api/me with the new effective
// identity).
//
// Themeable via the `theme` prop (consumer passes ImpersonationTheme tokens).
// Themeless defaults are bare-minimum readable; consumer is expected to
// override for design-system alignment.

type Impersonation = {
  realAdminEmail: string;
  actingAsEmail: string;
  actingAsHandle?: string | null;
  actingAsDisplayName?: string | null;
};

type Me = {
  impersonating: Impersonation | null;
};

export interface ImpersonationBannerProps {
  /** Endpoint that returns `{ impersonating }`. Defaults to `/api/me`. */
  meEndpoint?: string;
  /** Endpoint that DELETEs the impersonation cookie. Defaults to `/api/admin/impersonate`. */
  exitEndpoint?: string;
  /** Optional theme tokens. */
  theme?: ImpersonationTheme;
}

const DEFAULT_THEME: Required<Omit<ImpersonationTheme, "exitButtonStyle">> & { exitButtonStyle: Record<string, string> } = {
  bannerBg: "#1a3a78",          // navy
  bannerFg: "#ffffff",
  bannerBorderColor: "#0d2349",
  exitButtonStyle: {
    background: "#ffffff",
    color: "#1a3a78",
    padding: "4px 12px",
    border: "0",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
  },
};

export function ImpersonationBanner({
  meEndpoint = "/api/me",
  exitEndpoint = "/api/admin/impersonate",
  theme,
}: ImpersonationBannerProps = {}): React.ReactElement | null {
  const [impersonating, setImpersonating] = useState<Impersonation | null>(null);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(meEndpoint, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Me) => { if (!cancelled) setImpersonating(d.impersonating ?? null); })
      .catch(() => { /* swallow — banner just stays hidden */ });
    return () => { cancelled = true; };
  }, [meEndpoint]);

  if (!impersonating) return null;

  const t = { ...DEFAULT_THEME, ...theme, exitButtonStyle: { ...DEFAULT_THEME.exitButtonStyle, ...(theme?.exitButtonStyle ?? {}) } };
  const label = impersonating.actingAsHandle
    ?? impersonating.actingAsDisplayName
    ?? impersonating.actingAsEmail;

  return (
    <div
      style={{
        background: t.bannerBg,
        color: t.bannerFg,
        borderBottom: `1px solid ${t.bannerBorderColor}`,
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: "13px",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      <div>
        Acting as <strong>{label}</strong> ({impersonating.actingAsEmail}) — real admin: {impersonating.realAdminEmail}
      </div>
      <button
        type="button"
        disabled={exiting}
        style={t.exitButtonStyle}
        onClick={async () => {
          setExiting(true);
          try {
            await fetch(exitEndpoint, { method: "DELETE" });
            window.location.href = "/admin/impersonate";
          } catch {
            setExiting(false);
          }
        }}
      >
        {exiting ? "Exiting…" : "Exit impersonation"}
      </button>
    </div>
  );
}
