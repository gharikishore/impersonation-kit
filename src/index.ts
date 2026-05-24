// Public barrel — top-level kit exports.
//
// Phase 1 (#948 — scaffolding intake): exports are placeholder shims.
// Phase 1 follow-ons fill in real implementations:
// - #949 implements createImpersonation + auth-resolver + admin-gate + audit
// - #950 implements route factories (./routes)
// - #951 implements UI components (./ui)

export type { ImpersonationConfig, ImpersonationKit, ImpersonationContext } from "./types.js";
export { createImpersonation } from "./create.js";
