// Public types. Implementations land in #949.

/**
 * Minimal shape a consumer's user object must satisfy. Real consumer types
 * extend this freely; the kit only needs id + email + handle + display name +
 * the consumer's notion of "admin".
 */
export interface KitUser {
  id: string;
  email: string;
  publicHandle?: string | null;
  displayName?: string | null;
}

/**
 * Configuration passed to createImpersonation(). Every field is consumer-
 * specific; the kit owns no defaults that touch schema or auth providers.
 */
export interface ImpersonationConfig<U extends KitUser = KitUser> {
  /** Cookie name. Use a project prefix (e.g. "myapp_impersonate"). */
  cookieName: string;
  /** Cookie TTL in seconds. Typical default: 8 hours. */
  cookieTtlSeconds: number;

  /** How your app gets the real (cookie-bound) logged-in user. */
  sessionResolver: () => Promise<U | null>;

  /** Your admin check. Specforge's is `u.systemRole === "admin"`. */
  isAdmin: (user: U) => boolean;

  /** Fetch a user by id (used to resolve the impersonation cookie). */
  userById: (id: string) => Promise<U | null>;

  /** Returns the list of users the admin is allowed to impersonate. */
  candidateFilter: (realAdmin: U) => Promise<U[]>;

  /** Where the persona should land on impersonation start. */
  defaultLandingFor: (impersonatedUser: U) => string;

  /** Writes an audit-log entry. Receives the auto-stamped impersonator id. */
  auditWriter: (entry: AuditEntry) => Promise<void>;

  /** Optional theme tokens for the built-in banner + switcher UI. */
  theme?: ImpersonationTheme;

  /**
   * Optional. When supplied, enables:
   *   - the "Add new impersonable user" form in the default ImpersonatePage
   *     (gated by the showAddCandidate prop)
   *   - the POST handler from createCandidatesRoute()
   *
   * The kit doesn't know your schema — this is where YOU insert the new
   * user into your users table + any seed-tracking table + handle
   * password/auth provider setup. Return the new user matching KitUser.
   *
   * Intake #978 (META #947).
   */
  createCandidate?: (input: CreateCandidateInput) => Promise<U>;
}

export interface CreateCandidateInput {
  email: string;
  publicHandle?: string;
  displayName?: string;
  /** Free-form role marker — your project decides where this maps in schema (domainRole / role / category, etc.). */
  roleLabel?: string;
  /** Group label for the kit's groupBy UI (Architects / Players / Customers / ...). */
  roleGroup?: string;
}

export interface AuditEntry {
  actorUserId: string;
  impersonatedByUserId: string | null;
  action: string;
  targetTable: string;
  targetId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface ImpersonationTheme {
  bannerBg?: string;
  bannerFg?: string;
  bannerBorderColor?: string;
  exitButtonStyle?: Record<string, string>;
}

/**
 * Returned by createImpersonation(). The full toolkit a consumer wires into
 * their routes, components, and audit calls.
 */
export interface ImpersonationKit<U extends KitUser = KitUser> {
  readSessionUser: () => Promise<U | null>;
  readRealSessionUser: () => Promise<U | null>;
  readImpersonationContext: () => Promise<ImpersonationContext<U> | null>;
  requireAdmin: () => Promise<U>;
  requireRealAdmin: () => Promise<U>;
  insertAuditEntry: (entry: AuditEntry) => Promise<void>;
  getImpersonatorId: () => Promise<string | null>;
  /** #978 — Whether config.createCandidate was supplied (consumers gate UI on this). */
  canCreateCandidates: boolean;
  /** Internal — the config (used by route factories + UI). */
  _config: ImpersonationConfig<U>;
}

export interface ImpersonationContext<U extends KitUser = KitUser> {
  realAdmin: Pick<U, "id" | "email">;
  actingAs: Pick<U, "id" | "email" | "publicHandle" | "displayName">;
}
