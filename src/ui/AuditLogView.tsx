// AuditLogView — presentational audit-log table. No hooks, so it renders
// inside a React Server Component. The consumer fetches + normalizes rows
// (via createAuditReader) and resolves labels/hrefs (only it knows its users
// table), then hands fully-resolved rows here.
//
// Interactivity is native + zero-JS: filters are a GET <form>, pagination +
// target links are plain <a>. Styling is neutral (works on any Tailwind
// consumer); pass `className` to wrap in a branded surface.

import * as React from "react";

export type AuditLogViewRow = {
  id: string;
  /** Pre-formatted timestamp (consumer controls locale). */
  at: string;
  action: string;
  /** Resolved actor name/email. */
  actorLabel: string;
  /** Resolved real-admin name — non-null ONLY when acting under impersonation. */
  realAdminLabel?: string | null;
  /** Resolved target. `href` makes it a link (e.g. a #seq deep link). */
  target?: { label: string; href?: string } | null;
  /** before/after payloads — rendered in an expandable <details> when present. */
  before?: unknown;
  after?: unknown;
};

export type AuditLogViewProps = {
  rows: AuditLogViewRow[];
  facets: { actions: string[]; tables: string[] };
  filters: { action?: string; table?: string; q?: string };
  total: number;
  page: number;
  totalPages: number;
  /** Route this view lives at — used for the filter form action + pagination links. */
  basePath: string;
  /** Optional heading copy. */
  title?: string;
  subtitle?: string;
  /** Wrapper class — e.g. brand background tokens. */
  className?: string;
};

function buildQuery(
  filters: { action?: string; table?: string; q?: string },
  page: number,
): string {
  const p = new URLSearchParams();
  if (filters.action) p.set("action", filters.action);
  if (filters.table) p.set("table", filters.table);
  if (filters.q) p.set("q", filters.q);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

function hasPayload(v: unknown): boolean {
  return !!v && typeof v === "object" && Object.keys(v as object).length > 0;
}

export function AuditLogView({
  rows,
  facets,
  filters,
  total,
  page,
  totalPages,
  basePath,
  title = "Audit log",
  subtitle,
  className,
}: AuditLogViewProps) {
  const filtered = !!(filters.action || filters.table || filters.q);

  return (
    <div className={className ?? ""}>
      <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">{title}</h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed opacity-65">
        {subtitle ??
          "Every admin action, state transition, and impersonation session — with the real admin attributed even when acting as another user."}{" "}
        {total} {total === 1 ? "entry" : "entries"}
        {filtered ? " match your filters." : " total."}
      </p>

      {/* Filters — native GET form, no client JS */}
      <form method="get" action={basePath} className="mt-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wide opacity-50">Action</span>
          <select
            name="action"
            defaultValue={filters.action ?? ""}
            className="rounded-lg border border-current/15 bg-transparent px-3 py-1.5 text-sm"
          >
            <option value="">All actions</option>
            {facets.actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wide opacity-50">Target</span>
          <select
            name="table"
            defaultValue={filters.table ?? ""}
            className="rounded-lg border border-current/15 bg-transparent px-3 py-1.5 text-sm"
          >
            <option value="">All targets</option>
            {facets.tables.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[180px] flex-1 flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wide opacity-50">Search</span>
          <input
            type="text"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="action, email, before/after…"
            className="rounded-lg border border-current/15 bg-transparent px-3 py-1.5 text-sm placeholder:opacity-40"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg border border-current/20 px-4 py-1.5 text-sm font-semibold hover:opacity-80"
        >
          Filter
        </button>
        {filtered && (
          <a href={basePath} className="text-sm font-semibold opacity-55 hover:opacity-100">
            Clear
          </a>
        )}
      </form>

      {/* Table */}
      <div className="mt-6 overflow-hidden rounded-xl border border-current/10">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-current/10">
            <tr className="font-mono text-[10px] uppercase tracking-wide opacity-50">
              <th className="px-4 py-2.5 font-medium">When</th>
              <th className="px-4 py-2.5 font-medium">Action</th>
              <th className="px-4 py-2.5 font-medium">Actor</th>
              <th className="px-4 py-2.5 font-medium">Target</th>
              <th className="px-4 py-2.5 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center opacity-45">
                  No audit entries match.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const showReal = !!r.realAdminLabel && r.realAdminLabel !== r.actorLabel;
              const detail = hasPayload(r.before) || hasPayload(r.after);
              return (
                <tr key={r.id} className="border-b border-current/5 align-top last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] opacity-55">
                    {r.at}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-block rounded-full border border-current/15 px-2 py-0.5 font-mono text-[11px]">
                      {r.action}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.actorLabel}</div>
                    {showReal && (
                      <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wide opacity-45">
                        real: {r.realAdminLabel}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[13px]">
                    {!r.target ? (
                      <span className="opacity-35">—</span>
                    ) : r.target.href ? (
                      <a href={r.target.href} className="underline-offset-2 hover:underline">
                        {r.target.label}
                      </a>
                    ) : (
                      <span className="opacity-70">{r.target.label}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {detail ? (
                      <details>
                        <summary className="cursor-pointer text-[12px] opacity-55 hover:opacity-90">
                          before / after
                        </summary>
                        <pre className="mt-2 max-w-md overflow-x-auto rounded-lg border border-current/10 p-2.5 font-mono text-[11px] leading-snug opacity-75">
                          {JSON.stringify({ before: r.before ?? null, after: r.after ?? null }, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="opacity-30">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-5 flex items-center justify-between text-sm">
          <span className="opacity-55">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`${basePath}${buildQuery(filters, page - 1)}`}
                className="rounded-lg border border-current/20 px-3 py-1.5 font-semibold hover:opacity-80"
              >
                ← Prev
              </a>
            )}
            {page < totalPages && (
              <a
                href={`${basePath}${buildQuery(filters, page + 1)}`}
                className="rounded-lg border border-current/20 px-3 py-1.5 font-semibold hover:opacity-80"
              >
                Next →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
