// createImpersonation factory — the kit's main entry point.
//
// Implementation lands in #949 (scaffolding shim for #948). The real
// implementation will:
// 1. Capture the config (frozen for the lifetime of the kit instance)
// 2. Return a kit object with readSessionUser / readRealSessionUser /
//    readImpersonationContext / requireAdmin / requireRealAdmin /
//    insertAuditEntry / getImpersonatorId — all bound to the config

import type { ImpersonationConfig, ImpersonationKit, KitUser } from "./types.js";

export function createImpersonation<U extends KitUser = KitUser>(
  config: ImpersonationConfig<U>,
): ImpersonationKit<U> {
  // SCAFFOLDING SHIM — replaced by real implementation in #949.
  // Throwing here keeps consumers from accidentally building against the shim.
  const notImplemented = (name: string) => async (): Promise<never> => {
    throw new Error(
      `impersonation-kit v0.1.0 scaffolding: ${name}() not implemented yet (intake #949)`,
    );
  };

  return {
    readSessionUser: notImplemented("readSessionUser"),
    readRealSessionUser: notImplemented("readRealSessionUser"),
    readImpersonationContext: notImplemented("readImpersonationContext"),
    requireAdmin: notImplemented("requireAdmin"),
    requireRealAdmin: notImplemented("requireRealAdmin"),
    insertAuditEntry: notImplemented("insertAuditEntry"),
    getImpersonatorId: notImplemented("getImpersonatorId"),
    _config: config,
  };
}
