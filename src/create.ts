// createImpersonation factory — the kit's main entry point.
//
// Captures the config once + returns a kit object bound to it. All helpers
// (readSessionUser / requireAdmin / insertAuditEntry / etc.) are pre-bound
// so consumer call sites are clean: `await kit.readSessionUser()` instead
// of `await readSessionUser(config)`.

import type { AuditEntry, ImpersonationConfig, ImpersonationKit, KitUser } from "./types";
import {
  readImpersonationContext as _readImpersonationContext,
  readRealSessionUser as _readRealSessionUser,
  readSessionUser as _readSessionUser,
} from "./auth-resolver";
import { requireAdmin as _requireAdmin, requireRealAdmin as _requireRealAdmin } from "./admin-gate";
import { getImpersonatorId as _getImpersonatorId, insertAuditEntry as _insertAuditEntry } from "./audit";
import { NextResponse } from "next/server";

export function createImpersonation<U extends KitUser = KitUser>(
  config: ImpersonationConfig<U>,
): ImpersonationKit<U> {
  // requireAdmin + requireRealAdmin return U | NextResponse — but the
  // ImpersonationKit interface promises U. We narrow here by throwing
  // a guarded error response for the consumer to handle at the route
  // boundary. (Consumers who want the original return-or-response shape
  // can import requireAdmin directly from "@kit/admin-gate".)
  const requireAdmin = async (): Promise<U> => {
    const result = await _requireAdmin(config);
    if (result instanceof NextResponse) {
      throw new GateResponse(result);
    }
    return result;
  };
  const requireRealAdmin = async (): Promise<U> => {
    const result = await _requireRealAdmin(config);
    if (result instanceof NextResponse) {
      throw new GateResponse(result);
    }
    return result;
  };

  return {
    readSessionUser: () => _readSessionUser(config),
    readRealSessionUser: () => _readRealSessionUser(config),
    readImpersonationContext: () => _readImpersonationContext(config),
    requireAdmin,
    requireRealAdmin,
    insertAuditEntry: (entry: AuditEntry) => _insertAuditEntry(config, entry),
    getImpersonatorId: () => _getImpersonatorId(config),
    canCreateCandidates: typeof config.createCandidate === "function",
    _config: config,
  };
}

/**
 * Thrown by the kit's requireAdmin/requireRealAdmin when the gate fails,
 * wrapping the NextResponse that should be returned to the client. Route
 * handlers can catch this at their top level and return the response.
 *
 * The non-throwing form (`U | NextResponse`) is available via direct
 * imports from "@kit/admin-gate" if you prefer that style.
 */
export class GateResponse extends Error {
  constructor(public response: NextResponse) {
    super("Admin gate failed");
    this.name = "GateResponse";
  }
}
