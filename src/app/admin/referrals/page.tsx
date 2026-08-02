import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { authOptions } from "@/lib/auth";
import { getTranslations } from "@/i18n/getTranslations";
import AdminPageShell from "@/components/admin/AdminPageShell";
import MergeConflictsPanel from "@/components/admin/referrals/MergeConflictsPanel";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Lightweight server-side loader — fetches only per-actor unresolved counts
 * and basic display info. Full conflict details (incomingUser, matchField,
 * provisioningPath, etc.) are fetched lazily by the panel when a drawer opens.
 */
async function loadActorSummaries(): Promise<
  { candidateActorId: string; displayName: string | null; email: string | null; actorType: string | null; unresolvedCount: number }[]
> {
  const [requireds, resolveds] = await Promise.all([
    prisma.auditLog.findMany({
      where: { action: "referral.actor.merge_required" },
      select: { id: true, actorId: true, metadata: true },
    }),
    prisma.auditLog.findMany({
      where: { action: "referral.actor.merge_resolved" },
      select: { metadata: true },
    }),
  ]);

  const resolvedConflictIds = new Set<string>(
    resolveds
      .map((r) => (r.metadata as Record<string, unknown> | null)?.originalConflictAuditId as string | undefined)
      .filter(Boolean) as string[],
  );

  const unresolved = requireds.filter((r) => !resolvedConflictIds.has(r.id));
  if (unresolved.length === 0) return [];

  // Count per candidateActorId
  const countMap = new Map<string, number>();
  for (const entry of unresolved) {
    const meta = (entry.metadata as Record<string, unknown> | null) ?? {};
    const id = (meta.candidateActorId ?? entry.actorId) as string;
    countMap.set(id, (countMap.get(id) ?? 0) + 1);
  }

  const actorIds = [...countMap.keys()];
  const actors = await prisma.referralActor.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, displayName: true, email: true, actorType: true },
  });

  const actorMap = new Map(actors.map((a) => [a.id, a]));

  return actorIds.map((id) => {
    const actor = actorMap.get(id);
    return {
      candidateActorId: id,
      displayName: actor?.displayName ?? null,
      email: actor?.email ?? null,
      actorType: actor?.actorType ?? null,
      unresolvedCount: countMap.get(id) ?? 0,
    };
  });
}

export default async function AdminReferralsMergeConflictsPage() {
  const [session, cookieStore] = await Promise.all([
    getServerSession(authOptions),
    cookies(),
  ]);
  const roles: string[] = (session?.user as any)?.roles ?? [];
  if (!roles.includes("SUPERADMIN")) {
    redirect("/admin");
  }

  const locale = (cookieStore.get("NEXT_LOCALE")?.value ?? "en") as "en" | "es" | "pt";
  const translations = await getTranslations(locale, ["referrals"]);
  const ref = translations.referrals as Record<string, string | Record<string, string>>;
  const mc = (ref.mergeConflicts ?? {}) as Record<string, string>;

  const summaries = await loadActorSummaries();
  const totalActors = summaries.length;
  const totalConflicts = summaries.reduce((s, g) => s + g.unresolvedCount, 0);

  const eyebrow = mc.eyebrow ?? "Admin · Referrals";
  const pageTitle = mc.pageTitle ?? "Referral Actor Merge Conflicts";
  const subtitle = mc.pageSubtitle ?? "When two provisioning paths detect the same person under different user accounts, a merge conflict is raised. Each actor row below has a badge showing how many pending conflicts exist. Click the badge to open the resolution drawer — full conflict details are loaded on demand. All decisions are audited; original conflict records are never modified.";

  return (
    <AdminPageShell
      eyebrow={eyebrow}
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {pageTitle}
          {totalActors > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 22,
                height: 22,
                padding: "0 6px",
                borderRadius: 11,
                background: "var(--color-warning, #b45309)",
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {totalConflicts}
            </span>
          )}
        </span>
      }
      subtitle={subtitle}
    >
      <MergeConflictsPanel initial={summaries} />
    </AdminPageShell>
  );
}
