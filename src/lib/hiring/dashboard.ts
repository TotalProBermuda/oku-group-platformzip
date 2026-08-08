import { prisma } from "@/lib/prisma";

// ── Filters ────────────────────────────────────────────────────────────────
export type OpportunityFilters = {
  status?: string;
  department?: string;
  location?: string;
  engagementType?: string;
  search?: string;
};

export type ApplicationFilters = {
  opportunityId?: string;
  stage?: string;
  workAuth?: string;
  weekend?: string;
  language?: string;
  experience?: string;
};

// ── Status grouping ────────────────────────────────────────────────────────
export const STAGE_GROUPS = {
  new:       ["SUBMITTED"],
  review:    ["UNDER_REVIEW", "HR_SCREEN", "MANAGER_REVIEW"],
  interview: ["INTERVIEW_SCHEDULED", "TRIAL_SHIFT"],
  offer:     ["OFFER_PENDING", "HIRED"],
  rejected:  ["REJECTED", "WITHDRAWN", "ARCHIVED"],
} as const;

export const STATUS_LABELS: Record<string, string> = {
  SUBMITTED:           "New",
  UNDER_REVIEW:        "Under Review",
  HR_SCREEN:           "HR Screen",
  MANAGER_REVIEW:      "Manager Review",
  INTERVIEW_SCHEDULED: "Interview",
  TRIAL_SHIFT:         "Trial Shift",
  OFFER_PENDING:       "Offer Pending",
  HIRED:               "Hired",
  REJECTED:            "Rejected",
  WITHDRAWN:           "Withdrawn",
  ARCHIVED:            "Archived",
};

export const STATUS_COLORS: Record<string, string> = {
  SUBMITTED:           "#2563eb",
  UNDER_REVIEW:        "#7c3aed",
  HR_SCREEN:           "#d97706",
  MANAGER_REVIEW:      "#0891b2",
  INTERVIEW_SCHEDULED: "#059669",
  TRIAL_SHIFT:         "#65a30d",
  OFFER_PENDING:       "#ea580c",
  HIRED:               "#16a34a",
  REJECTED:            "#dc2626",
  WITHDRAWN:           "#6b7280",
  ARCHIVED:            "#9ca3af",
};

// ── Opportunity dashboard rows ─────────────────────────────────────────────
export type OpportunityRow = {
  id: string;
  title: string;
  department: string | null;
  locationKey: string | null;
  engagementType: string;
  status: string;
  openingsCount: number | null;
  formTemplateId: string | null;
  formTemplateName: string | null;
  updatedAt: Date;
  total: number;
  new: number;
  review: number;
  interview: number;
  offer: number;
  rejected: number;
};

export async function getOpportunityDashboardRows(
  filters: OpportunityFilters = {}
): Promise<OpportunityRow[]> {
  const where: any = {};
  if (filters.status) where.status = filters.status;
  if (filters.department) where.department = { contains: filters.department, mode: "insensitive" };
  if (filters.location) where.locationKey = filters.location;
  if (filters.engagementType) where.engagementType = filters.engagementType;
  if (filters.search) {
    where.title = { contains: filters.search, mode: "insensitive" };
  }

  const opps = await prisma.opportunity.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      formTemplate: { select: { id: true, name: true } },
      _count: { select: { submissions: true } },
    },
  });

  if (opps.length === 0) return [];

  // Fetch stage counts grouped by opportunityId + status
  const oppIds = opps.map((o) => o.id);
  const stageCounts = await prisma.applicationSubmission.groupBy({
    by: ["opportunityId", "status"],
    where: { opportunityId: { in: oppIds } },
    _count: true,
  });

  // Index: oppId → status → count
  const countMap: Record<string, Record<string, number>> = {};
  for (const row of stageCounts) {
    if (!countMap[row.opportunityId]) countMap[row.opportunityId] = {};
    countMap[row.opportunityId][row.status] = row._count;
  }

  function sumStatuses(oppId: string, statuses: readonly string[]): number {
    const m = countMap[oppId] ?? {};
    return statuses.reduce((acc, s) => acc + (m[s] ?? 0), 0);
  }

  return opps.map((o) => ({
    id: o.id,
    title: o.title,
    department: o.department,
    locationKey: o.locationKey,
    engagementType: o.engagementType,
    status: o.status,
    openingsCount: o.openingsCount,
    formTemplateId: o.formTemplate?.id ?? null,
    formTemplateName: o.formTemplate?.name ?? null,
    updatedAt: o.updatedAt,
    total: o._count.submissions,
    new: sumStatuses(o.id, STAGE_GROUPS.new),
    review: sumStatuses(o.id, STAGE_GROUPS.review),
    interview: sumStatuses(o.id, STAGE_GROUPS.interview),
    offer: sumStatuses(o.id, STAGE_GROUPS.offer),
    rejected: sumStatuses(o.id, STAGE_GROUPS.rejected),
  }));
}

// ── Applications pipeline ──────────────────────────────────────────────────
export type ApplicationRow = {
  id: string;
  status: string;
  source: string | null;
  submittedAt: Date | null;
  createdAt: Date;
  opportunityId: string;
  opportunityTitle: string;
  applicantName: string;
  applicantEmail: string;
  normalized: Record<string, any>;
};

export async function getApplicationsPipeline(
  filters: ApplicationFilters = {},
  limit = 50
): Promise<ApplicationRow[]> {
  const where: any = {};
  if (filters.opportunityId) where.opportunityId = filters.opportunityId;
  if (filters.stage) where.status = filters.stage;

  const rows = await prisma.applicationSubmission.findMany({
    where,
    take: limit,
    orderBy: { createdAt: "desc" },
    include: {
      applicantProfile: { select: { fullName: true, email: true } },
      opportunity: { select: { title: true } },
    },
  });

  let filtered = rows.map((r) => ({
    id: r.id,
    status: r.status,
    source: r.source,
    submittedAt: r.submittedAt,
    createdAt: r.createdAt,
    opportunityId: r.opportunityId,
    opportunityTitle: r.opportunity.title,
    applicantName: r.applicantProfile.fullName,
    applicantEmail: r.applicantProfile.email,
    normalized: (r.normalizedSnapshotJson as Record<string, any>) ?? {},
  }));

  // Client-side filter on normalized JSON fields
  if (filters.workAuth === "yes") {
    filtered = filtered.filter((r) => r.normalized.authorizedToWork === true || r.normalized.workAuthorization === "yes");
  }
  if (filters.weekend === "yes") {
    filtered = filtered.filter((r) => r.normalized.weekendAvailability === true || r.normalized.weekendAvailability === "yes");
  }
  if (filters.language) {
    filtered = filtered.filter((r) => {
      const langs: string[] = Array.isArray(r.normalized.languages) ? r.normalized.languages : [];
      return langs.some((l) => l.toLowerCase().includes(filters.language!.toLowerCase()));
    });
  }
  if (filters.experience) {
    const min = parseInt(filters.experience);
    if (!isNaN(min)) {
      filtered = filtered.filter((r) => {
        const yrs = parseInt(r.normalized.yearsExperience ?? r.normalized.yearsHospitalityExperience ?? "0");
        return yrs >= min;
      });
    }
  }

  return filtered;
}

// ── Dashboard summary stats ────────────────────────────────────────────────
export async function getHiringStats() {
  const [totalOpps, activeOpps, totalApps, newApps, interviewApps, offerApps] = await Promise.all([
    prisma.opportunity.count(),
    prisma.opportunity.count({ where: { status: "PUBLISHED" } }),
    prisma.applicationSubmission.count(),
    prisma.applicationSubmission.count({ where: { status: "SUBMITTED" } }),
    prisma.applicationSubmission.count({ where: { status: { in: ["INTERVIEW_SCHEDULED", "TRIAL_SHIFT"] } } }),
    prisma.applicationSubmission.count({ where: { status: { in: ["OFFER_PENDING", "HIRED"] } } }),
  ]);
  return { totalOpps, activeOpps, totalApps, newApps, interviewApps, offerApps };
}
