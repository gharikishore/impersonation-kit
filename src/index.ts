// Public barrel — top-level kit exports.
//
// Phase 1 progress:
// - #948 (scaffolding)              ✓
// - #949 (core lib)                 ✓ — this commit
// - #950 (route factories)          → src/routes/
// - #951 (UI components)            → src/ui/
// - #952 (migrate Specforge)        → consumes via submodule
// - #953 (docs)                     → docs/api.md + adoption.md + migration.md

// Types
export type {
  ImpersonationConfig,
  ImpersonationKit,
  ImpersonationContext,
  KitUser,
  AuditEntry,
  ImpersonationTheme,
} from "./types.js";

// Main factory (recommended for most consumers — pre-bound helpers).
export { createImpersonation, GateResponse } from "./create.js";

// Direct (config-passing) variants for consumers who want the non-throwing
// `U | NextResponse` shape from requireAdmin/requireRealAdmin, or who want
// to use auth helpers without the factory wrapper.
export {
  readSessionUser,
  readRealSessionUser,
  readImpersonationContext,
} from "./auth-resolver.js";
export { requireAdmin, requireRealAdmin } from "./admin-gate.js";
export { insertAuditEntry, getImpersonatorId } from "./audit.js";
export { readCookie, setCookie, clearCookie } from "./cookie.js";
