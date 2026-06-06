// Audit-log READ layer (companion to audit.ts's write side).
//
// The kit owns the audit_log shape (the columns written by every consumer's
// auditWriter): actor_user_id, impersonated_by_user_id, action, target_table,
// target_id (all uuid), before/after/metadata (jsonb), at (timestamptz). So
// the kit can also own the standard read queries + the uuid/cuid normalization
// the writer's metadata-fallback created. Consumers supply their postgres-js
// `sql` client; user/target *label* resolution stays consumer-side (only the
// consumer knows its users table + how to deep-link targets).
//
// Works on a plain table or a partitioned parent (e.g. Specforge's monthly
// audit_log_YYYY_MM partitions) — SELECTs on the parent span all partitions.

/**
 * Structural type for a postgres-js client. It's callable two ways:
 *   - as a tagged template → runs a query, resolves to Row[]
 *   - as `sql(identifier)` → a safe dynamic-identifier fragment (table/column)
 * Both known consumers expose one (hmbr's `postgresClient`, Specforge's
 * drizzle `client`). Avoids a hard dependency on the `postgres` package.
 */
export type AuditSql = {
  <Row = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): PromiseLike<Row[]>;
  (identifier: string): unknown;
};

export type AuditQueryFilters = {
  action?: string;
  table?: string;
  /** Free text — matched against action, target_table, before/after/metadata. */
  q?: string;
  limit?: number;
  offset?: number;
};

export type AuditFacets = { actions: string[]; tables: string[] };

/** A normalized audit row: effective ids resolved from the uuid col OR metadata cuid. */
export type AuditLogRow = {
  id: string;
  at: Date;
  action: string;
  targetTable: string | null;
  actorId: string | null;
  realAdminId: string | null;
  targetId: string | null;
  before: unknown;
  after: unknown;
  metadata: Record<string, unknown> | null;
};

type RawAuditRow = {
  id: string;
  at: Date;
  action: string;
  target_table: string | null;
  actor_user_id: string | null;
  impersonated_by_user_id: string | null;
  target_id: string | null;
  before: unknown;
  after: unknown;
  metadata: Record<string, unknown> | null;
};

/** The effective id for a column: the uuid value, or the cuid stashed in metadata. */
function effId(
  uuidVal: string | null,
  metadata: Record<string, unknown> | null,
  metaKey: string,
): string | null {
  if (uuidVal) return uuidVal;
  const m = metadata?.[metaKey];
  return typeof m === "string" ? m : null;
}

/** Normalize a raw audit_log row, resolving the uuid/cuid metadata fallback. */
export function normalizeAuditRow(r: RawAuditRow): AuditLogRow {
  return {
    id: r.id,
    at: r.at,
    action: r.action,
    targetTable: r.target_table,
    actorId: effId(r.actor_user_id, r.metadata, "actorUserCuid"),
    realAdminId: effId(r.impersonated_by_user_id, r.metadata, "impersonatedByUserCuid"),
    targetId: effId(r.target_id, r.metadata, "targetIdCuid"),
    before: r.before,
    after: r.after,
    metadata: r.metadata,
  };
}

export type AuditReaderOptions = {
  /** Table (or partitioned parent) to read. Default "audit_log". */
  table?: string;
  /** Timestamp column to order by. Default "at". */
  timeColumn?: string;
  /** Max rows per page (hard cap). Default 200. */
  maxLimit?: number;
};

export type AuditReader = {
  listAuditLog(f: AuditQueryFilters): Promise<AuditLogRow[]>;
  countAuditLog(f: AuditQueryFilters): Promise<number>;
  auditFacets(): Promise<AuditFacets>;
};

/**
 * Build an audit reader bound to a consumer's postgres-js `sql` client.
 *
 * `table` / `timeColumn` come from trusted consumer config; they're embedded
 * as postgres-js identifier fragments (`sql(name)`) and regex-validated as a
 * second guard. All user-controlled filter values are bound params.
 */
export function createAuditReader(sql: AuditSql, opts: AuditReaderOptions = {}): AuditReader {
  const maxLimit = opts.maxLimit ?? 200;
  const ident = (s: string): string => {
    if (!/^[a-z_][a-z0-9_]*$/i.test(s)) throw new Error(`Unsafe audit identifier: ${s}`);
    return s;
  };
  // Dynamic-identifier fragments (table + order column).
  const T = sql(ident(opts.table ?? "audit_log"));
  const TC = sql(ident(opts.timeColumn ?? "at"));

  return {
    async listAuditLog(f) {
      const limit = Math.min(Math.max(f.limit ?? 50, 1), maxLimit);
      const offset = Math.max(f.offset ?? 0, 0);
      const action = f.action?.trim() || null;
      const tbl = f.table?.trim() || null;
      const q = f.q?.trim() ? `%${f.q.trim()}%` : null;
      const rows = (await sql`
        SELECT id::text, ${TC} AS at, action, target_table,
               actor_user_id::text, impersonated_by_user_id::text, target_id::text,
               before, after, metadata
        FROM ${T}
        WHERE (${action}::text IS NULL OR action = ${action})
          AND (${tbl}::text IS NULL OR target_table = ${tbl})
          AND (${q}::text IS NULL OR action ILIKE ${q} OR target_table ILIKE ${q}
               OR after::text ILIKE ${q} OR before::text ILIKE ${q} OR metadata::text ILIKE ${q})
        ORDER BY ${TC} DESC
        LIMIT ${limit} OFFSET ${offset}
      `) as unknown as RawAuditRow[];
      return rows.map(normalizeAuditRow);
    },

    async countAuditLog(f) {
      const action = f.action?.trim() || null;
      const tbl = f.table?.trim() || null;
      const q = f.q?.trim() ? `%${f.q.trim()}%` : null;
      const r = (await sql`
        SELECT count(*)::int AS n FROM ${T}
        WHERE (${action}::text IS NULL OR action = ${action})
          AND (${tbl}::text IS NULL OR target_table = ${tbl})
          AND (${q}::text IS NULL OR action ILIKE ${q} OR target_table ILIKE ${q}
               OR after::text ILIKE ${q} OR before::text ILIKE ${q} OR metadata::text ILIKE ${q})
      `) as unknown as Array<{ n: number }>;
      return r[0]?.n ?? 0;
    },

    async auditFacets() {
      const actions = (await sql`SELECT DISTINCT action FROM ${T} ORDER BY action`) as unknown as Array<{ action: string }>;
      const tables = (await sql`SELECT DISTINCT target_table FROM ${T} WHERE target_table IS NOT NULL ORDER BY target_table`) as unknown as Array<{ target_table: string }>;
      return { actions: actions.map((a) => a.action), tables: tables.map((t) => t.target_table) };
    },
  };
}
