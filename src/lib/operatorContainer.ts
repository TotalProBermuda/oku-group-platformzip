import type { ReferralScopeType } from "@prisma/client";

/**
 * Container in which an operator (ReferralActor + Assignment + Link) is being
 * created. Used by the "Add operator" CTA on every surface that shows an
 * OperatorsPanel and by the corresponding write endpoint.
 *
 * The shape mirrors `OperatorRollupContainer` but adds `soloReferrer` —
 * a special mode used on the legacy-Referrer empty state to wrap the existing
 * `Referrer` row via `legacyReferrerId` rather than creating a duplicate.
 */
export type OperatorContainer =
  | { kind: "entity"; parentEntityId: string }
  | { kind: "scope"; scopeType: Exclude<ReferralScopeType, never>; scopeId?: string }
  | { kind: "soloReferrer"; legacyReferrerId: string };

export type AssignmentDefaults = {
  scopeType: ReferralScopeType;
  scopeId?: string;
  parentEntityType?: string;
  parentEntityId?: string;
};

/** Resolve a container to the assignment fields we should default into. */
export function resolveAssignmentDefaults(c: OperatorContainer): AssignmentDefaults {
  if (c.kind === "entity") {
    return {
      scopeType: "GLOBAL",
      parentEntityType: "ENTITY",
      parentEntityId: c.parentEntityId,
    };
  }
  if (c.kind === "scope") {
    return { scopeType: c.scopeType, scopeId: c.scopeId };
  }
  // soloReferrer — no parent entity, no scope narrowing.
  return { scopeType: "GLOBAL" };
}

/**
 * Short label describing the container — used in the modal header
 * and in the auto-generated confirmation text.
 */
export function describeContainer(
  c: OperatorContainer,
  ctx?: { entityName?: string | null; scopeName?: string | null; referrerName?: string | null }
): string {
  if (c.kind === "entity") {
    return ctx?.entityName ? `the “${ctx.entityName}” organization` : "this organization";
  }
  if (c.kind === "scope") {
    const scope = c.scopeType.toLowerCase();
    if (ctx?.scopeName) return `the “${ctx.scopeName}” ${scope}`;
    return c.scopeId ? `this ${scope}` : `the ${scope} scope`;
  }
  return ctx?.referrerName ? `the “${ctx.referrerName}” referrer` : "this referrer";
}

export function isValidScopeType(s: string): s is ReferralScopeType {
  return s === "GLOBAL" || s === "VENUE" || s === "SERIES" || s === "CAMPAIGN";
}
