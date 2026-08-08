import { prisma } from "@/lib/prisma";

/**
 * Free-text → Entity backfill.
 *
 * Walks every active ReferralAssignment whose actor has a non-empty
 * organizationName but whose parentEntityId is unset. If we can find an
 * Entity whose displayName matches (after normalization), we set
 * parentEntityType="ENTITY" / parentEntityId on the assignment.
 *
 * Idempotent and reversible — the prior raw text is preserved on the actor
 * (organizationName is not cleared), and we record the resolution into
 * actor.metadataJson._resolvedOrganization for forensics.
 */
export async function resolveOrganizationNames(): Promise<{
  resolved: number;
  unresolved: number;
  total: number;
}> {
  const candidates = await prisma.referralAssignment.findMany({
    where: {
      isActive: true,
      parentEntityId: null,
      referralActor: { organizationName: { not: null } },
    },
    include: {
      referralActor: {
        select: { id: true, displayName: true, organizationName: true, metadataJson: true },
      },
    },
  });

  if (candidates.length === 0) {
    return { resolved: 0, unresolved: 0, total: 0 };
  }

  const entities = await prisma.entity.findMany({ select: { id: true, displayName: true } });
  const entityByKey = new Map<string, { id: string; displayName: string }>();
  for (const e of entities) {
    entityByKey.set(normalize(e.displayName), e);
  }

  let resolved = 0;
  let unresolved = 0;

  for (const a of candidates) {
    const raw = a.referralActor.organizationName;
    if (!raw) continue;

    // Sole-proprietor short-circuit: organization name === actor display name.
    // These are not real organizations; skip resolution and let the migration
    // backfill flag them on the actor.
    if (isSoleProprietorPair(raw, a.referralActor.displayName)) {
      continue;
    }

    const match = entityByKey.get(normalize(raw));
    if (!match) {
      unresolved += 1;
      continue;
    }

    const meta = (a.referralActor.metadataJson as Record<string, unknown> | null) ?? {};
    const audit = {
      ...meta,
      _resolvedOrganization: {
        rawText: raw,
        resolvedToEntityId: match.id,
        resolvedToDisplayName: match.displayName,
        resolvedAt: new Date().toISOString(),
        resolvedBy: "system:migration",
      },
    };

    await prisma.$transaction([
      prisma.referralAssignment.update({
        where: { id: a.id },
        data: { parentEntityType: "ENTITY", parentEntityId: match.id },
      }),
      prisma.referralActor.update({
        where: { id: a.referralActor.id },
        data: { metadataJson: audit },
      }),
    ]);

    resolved += 1;
  }

  return { resolved, unresolved, total: candidates.length };
}

/**
 * Surface every actor whose organizationName text could not be matched to an
 * Entity AND is not flagged as a sole proprietor. Admins use this list to
 * Link to existing Entity, Create new Entity, or Mark sole proprietor.
 */
export async function listUnresolvedOrganizations(): Promise<
  Array<{
    actorId: string;
    actorDisplayName: string;
    actorType: string;
    organizationName: string;
    assignmentIds: string[];
  }>
> {
  const rows = await prisma.referralAssignment.findMany({
    where: {
      isActive: true,
      parentEntityId: null,
      referralActor: { organizationName: { not: null } },
    },
    include: {
      referralActor: {
        select: {
          id: true,
          displayName: true,
          organizationName: true,
          actorType: true,
          metadataJson: true,
        },
      },
    },
  });

  const entityNames = new Set(
    (await prisma.entity.findMany({ select: { displayName: true } })).map((e) =>
      normalize(e.displayName),
    ),
  );

  const grouped = new Map<
    string,
    {
      actorId: string;
      actorDisplayName: string;
      actorType: string;
      organizationName: string;
      assignmentIds: string[];
    }
  >();
  for (const r of rows) {
    const raw = r.referralActor.organizationName;
    if (!raw) continue;

    // Already matchable to a real Entity → not "unresolved" (resolver will pick it up).
    if (entityNames.has(normalize(raw))) continue;

    // Flagged as sole proprietor → handled in the Self-managed view.
    if (isSoleProprietorActor(r.referralActor.metadataJson)) continue;

    // Live sole-proprietor pair (not yet flagged) → also exclude; backfill will catch it.
    if (isSoleProprietorPair(raw, r.referralActor.displayName)) continue;

    const key = r.referralActor.id;
    const existing = grouped.get(key);
    if (existing) {
      existing.assignmentIds.push(r.id);
    } else {
      grouped.set(key, {
        actorId: r.referralActor.id,
        actorDisplayName: r.referralActor.displayName,
        actorType: r.referralActor.actorType,
        organizationName: raw,
        assignmentIds: [r.id],
      });
    }
  }

  return Array.from(grouped.values()).sort((a, b) =>
    a.organizationName.localeCompare(b.organizationName),
  );
}

/**
 * Companion list to listUnresolvedOrganizations — actors flagged as
 * self-managed / sole proprietors (organizationName === displayName).
 */
export async function listSoleProprietors(): Promise<
  Array<{
    actorId: string;
    actorDisplayName: string;
    actorType: string;
    organizationName: string;
    flaggedAt: string | null;
  }>
> {
  const actors = await prisma.referralActor.findMany({
    where: { organizationName: { not: null } },
    select: {
      id: true,
      displayName: true,
      organizationName: true,
      actorType: true,
      metadataJson: true,
    },
  });
  return actors
    .filter((a) => isSoleProprietorActor(a.metadataJson))
    .map((a) => {
      const meta = (a.metadataJson as Record<string, unknown> | null) ?? {};
      const flag = meta._isSoleProprietor as
        | { flaggedAt?: string; flaggedBy?: string }
        | true
        | undefined;
      const flaggedAt =
        flag && typeof flag === "object" && typeof flag.flaggedAt === "string"
          ? flag.flaggedAt
          : null;
      return {
        actorId: a.id,
        actorDisplayName: a.displayName,
        actorType: a.actorType,
        organizationName: a.organizationName ?? "",
        flaggedAt,
      };
    })
    .sort((a, b) => a.actorDisplayName.localeCompare(b.actorDisplayName));
}

/**
 * Idempotent backfill: every actor with organizationName === displayName
 * (after normalization) gets `_isSoleProprietor` set on metadataJson if not
 * already present. Safe to call repeatedly.
 */
export async function backfillSoleProprietorFlags(): Promise<{ flagged: number; total: number }> {
  const actors = await prisma.referralActor.findMany({
    where: { organizationName: { not: null } },
    select: { id: true, displayName: true, organizationName: true, metadataJson: true },
  });

  let flagged = 0;
  for (const a of actors) {
    if (!a.organizationName) continue;
    if (isSoleProprietorActor(a.metadataJson)) continue;
    if (!isSoleProprietorPair(a.organizationName, a.displayName)) continue;

    const meta = (a.metadataJson as Record<string, unknown> | null) ?? {};
    await prisma.referralActor.update({
      where: { id: a.id },
      data: {
        metadataJson: {
          ...meta,
          _isSoleProprietor: {
            flaggedAt: new Date().toISOString(),
            flaggedBy: "system:backfill",
            reason: "organization_name_equals_display_name",
          },
        },
      },
    });
    flagged += 1;
  }
  return { flagged, total: actors.length };
}

// ── Predicates ────────────────────────────────────────────────────────────

export function isSoleProprietorActor(metadataJson: unknown): boolean {
  if (!metadataJson || typeof metadataJson !== "object") return false;
  const v = (metadataJson as Record<string, unknown>)._isSoleProprietor;
  return v === true || (typeof v === "object" && v !== null);
}

export function isSoleProprietorPair(organizationName: string, displayName: string): boolean {
  return normalize(organizationName) === normalize(displayName);
}

// ── Normalization ────────────────────────────────────────────────────────
//
// Strategy:
//   1. Lowercase
//   2. Strip diacritics (NFD then drop combining marks)
//   3. Strip punctuation (keep letters/numbers/whitespace only)
//   4. Trim and collapse internal whitespace
//   5. Strip ONLY legal-form suffixes — and ONLY when they appear at the
//      END of the name (tail-only). Iteratively peel off any trailing
//      legal-form tokens. This guarantees we never alter mid-string content
//      and we never strip business nouns like Hotel, Cabs, Tours, Group,
//      Hospitality.

const LEGAL_SUFFIX_TOKENS = new Set([
  "sa",   // S.A.
  "srl",  // S.R.L.
  "sl",   // S.L.
  "llc",
  "inc",
  "corp",
  "co",   // & Co.
  "ltd",
  "ltda",
  "gmbh",
  "bv",
  "nv",
]);

export function normalize(input: string): string {
  let s = input.toLowerCase();
  s = s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  s = s.replace(/[^\p{L}\p{N}\s]+/gu, " ");
  s = s.replace(/\s+/g, " ").trim();

  // Tail-only legal-suffix peel. Repeats so "Foo S.A. LLC" → "foo".
  let tokens = s.split(" ");
  while (tokens.length > 1 && LEGAL_SUFFIX_TOKENS.has(tokens[tokens.length - 1]!)) {
    tokens = tokens.slice(0, -1);
  }
  return tokens.join(" ");
}
