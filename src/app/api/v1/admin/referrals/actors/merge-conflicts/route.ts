import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";

/**
 * GET /api/v1/admin/referrals/actors/merge-conflicts
 *
 * SUPERADMIN only.
 *
 * Returns unresolved ReferralActor merge conflicts **grouped by candidateActorId**
 * so each actor appears once in the list regardless of how many incoming-user
 * conflicts it accumulated.
 *
 * Algorithm (append-only AuditLog pattern):
 *   1. Fetch all `referral.actor.merge_required` entries from AuditLog.
 *   2. Fetch all `referral.actor.merge_resolved` entries; collect the set of
 *      `originalConflictAuditId` values from their metadata.
 *   3. A conflict is "unresolved" when its AuditLog row id is NOT in step-2 set.
 *   4. Group surviving entries by candidateActorId.
 *
 * Each group contains:
 *   - candidateActorId, candidateActor display info, candidateUser info
 *   - conflicts[]: per-conflict { conflictAuditId, incomingUserId, incomingUser,
 *       matchField, provisioningPath, createdAt }
 *   - unresolvedCount
 */
export async function GET() {
  try {
    const { roles } = await requireSession();
    if (!roles.includes("SUPERADMIN")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const [requireds, resolveds] = await Promise.all([
      prisma.auditLog.findMany({
        where: { action: "referral.actor.merge_required" },
        orderBy: { createdAt: "desc" },
      }),
      prisma.auditLog.findMany({
        where: { action: "referral.actor.merge_resolved" },
        select: { metadata: true },
      }),
    ]);

    const resolvedConflictIds = new Set<string>(
      resolveds
        .map((r) => {
          const meta = r.metadata as Record<string, unknown> | null;
          return meta?.originalConflictAuditId as string | undefined;
        })
        .filter(Boolean) as string[],
    );

    const unresolved = requireds.filter((r) => !resolvedConflictIds.has(r.id));

    if (unresolved.length === 0) {
      return NextResponse.json({ ok: true, groups: [] });
    }

    const allCandidateActorIds = [
      ...new Set(
        unresolved.map((e) => {
          const meta = e.metadata as Record<string, unknown> | null;
          return (meta?.candidateActorId ?? e.actorId) as string;
        }),
      ),
    ];

    // Fetch actors first so we can include their actual userId in the user
    // lookup — metadata.candidateActorUserId may be absent on older entries.
    const actors = await prisma.referralActor.findMany({
      where: { id: { in: allCandidateActorIds } },
      select: { id: true, displayName: true, email: true, actorType: true, userId: true },
    });

    const actorMap = new Map(actors.map((a) => [a.id, a]));

    // Build the user id set from (a) metadata incomingUserId,
    // (b) metadata candidateActorUserId, AND (c) the live actor.userId value.
    const allUserIds = [
      ...new Set(
        unresolved.flatMap((e) => {
          const meta = e.metadata as Record<string, unknown> | null;
          const candidateActorId = (meta?.candidateActorId ?? e.actorId) as string;
          const liveActorUserId = actorMap.get(candidateActorId)?.userId ?? null;
          return [
            meta?.incomingUserId as string | null,
            meta?.candidateActorUserId as string | null,
            liveActorUserId,
          ].filter(Boolean) as string[];
        }),
      ),
    ];

    const users = allUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: allUserIds } },
          select: { id: true, name: true, email: true },
        })
      : [];

    const userMap = new Map(users.map((u) => [u.id, u]));

    // Group by candidateActorId
    const groupMap = new Map<
      string,
      {
        candidateActorId: string;
        candidateActor: { id: string; displayName: string; email: string | null; actorType: string } | null;
        candidateUser: { id: string; name: string | null; email: string | null } | null;
        conflicts: Array<{
          conflictAuditId: string;
          incomingUserId: string | null;
          incomingUser: { id: string; name: string | null; email: string | null } | null;
          matchField: string | null;
          provisioningPath: string;
          createdAt: string;
        }>;
      }
    >();

    for (const entry of unresolved) {
      const meta = (entry.metadata as Record<string, unknown> | null) ?? {};
      const candidateActorId = (meta.candidateActorId ?? entry.actorId) as string;
      const candidateActorUserId = (meta.candidateActorUserId as string | null) ?? null;
      const incomingUserId = (meta.incomingUserId as string | null) ?? null;
      const matchField = (meta.matchField as string | null) ?? null;
      const provisioningPath = (meta.provisioningPath as string) ?? "";

      if (!groupMap.has(candidateActorId)) {
        const candidateActor = actorMap.get(candidateActorId) ?? null;
        const ownerUserId = candidateActorUserId ?? candidateActor?.userId ?? null;
        const candidateUser = ownerUserId ? (userMap.get(ownerUserId) ?? null) : null;

        groupMap.set(candidateActorId, {
          candidateActorId,
          candidateActor: candidateActor
            ? {
                id: candidateActor.id,
                displayName: candidateActor.displayName,
                email: candidateActor.email,
                actorType: candidateActor.actorType,
              }
            : null,
          candidateUser: candidateUser
            ? { id: candidateUser.id, name: candidateUser.name, email: candidateUser.email }
            : null,
          conflicts: [],
        });
      }

      const incomingUser = incomingUserId ? (userMap.get(incomingUserId) ?? null) : null;
      groupMap.get(candidateActorId)!.conflicts.push({
        conflictAuditId: entry.id,
        incomingUserId,
        incomingUser: incomingUser
          ? { id: incomingUser.id, name: incomingUser.name, email: incomingUser.email }
          : null,
        matchField,
        provisioningPath,
        createdAt: entry.createdAt.toISOString(),
      });
    }

    const groups = [...groupMap.values()].map((g) => ({
      ...g,
      unresolvedCount: g.conflicts.length,
    }));

    return NextResponse.json({ ok: true, groups });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown error" },
      { status: e?.status ?? 500 },
    );
  }
}
