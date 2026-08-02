import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { STATUS_LABELS, STATUS_COLORS, STAGE_GROUPS } from "@/lib/hiring/dashboard";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

const ET_LABELS: Record<string, string> = {
  FULL_TIME: "Full-time", PART_TIME: "Part-time", SEASONAL: "Seasonal",
  CONTRACT: "Contract", CONSULTANT: "Consultant", FREELANCE: "Freelance",
};

export default async function OpportunityDetailPage({ params }: Props) {
  const { id } = await params;

  const opp = await prisma.opportunity.findUnique({
    where: { id },
    include: {
      formTemplate: { select: { id: true, name: true } },
      _count: { select: { submissions: true } },
    },
  });

  if (!opp) notFound();

  // Stage counts
  const stageCounts = await prisma.applicationSubmission.groupBy({
    by: ["status"],
    where: { opportunityId: id },
    _count: true,
  });
  const countByStatus: Record<string, number> = {};
  for (const row of stageCounts) countByStatus[row.status] = row._count;

  function sumGroup(statuses: readonly string[]) {
    return statuses.reduce((acc, s) => acc + (countByStatus[s] ?? 0), 0);
  }

  const newCount      = sumGroup(STAGE_GROUPS.new);
  const reviewCount   = sumGroup(STAGE_GROUPS.review);
  const interviewCount = sumGroup(STAGE_GROUPS.interview);
  const offerCount    = sumGroup(STAGE_GROUPS.offer);
  const rejectedCount = sumGroup(STAGE_GROUPS.rejected);
  const totalCount    = opp._count.submissions;

  // Recent applicants
  const recent = await prisma.applicationSubmission.findMany({
    where: { opportunityId: id },
    take: 15,
    orderBy: { createdAt: "desc" },
    include: { applicantProfile: { select: { fullName: true, email: true } } },
  });

  const OPP_STATUS_STYLES: Record<string, { bg: string; color: string }> = {
    DRAFT:     { bg: "#f5f0eb", color: "#7d7269" },
    PUBLISHED: { bg: "#e6f4ed", color: "#1f8a55" },
    PAUSED:    { bg: "#fff9ef", color: "#b45309" },
    CLOSED:    { bg: "#fdf0f1", color: "#c41e3a" },
    ARCHIVED:  { bg: "#f5f5f5", color: "#9ca3af" },
  };
  const oppSt = OPP_STATUS_STYLES[opp.status] ?? OPP_STATUS_STYLES.DRAFT;

  return (
    <>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, fontSize: 13, color: "#b5aca6" }}>
        <Link href="/admin/hiring" style={{ color: "#b5aca6", textDecoration: "none" }}>Hiring</Link>
        <span>/</span>
        <span style={{ color: "#1f1a17" }}>{opp.title}</span>
      </div>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <h2 className="section-title" style={{ margin: 0 }}>{opp.title}</h2>
            <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", background: oppSt.bg, color: oppSt.color }}>
              {opp.status}
            </span>
          </div>
          <p style={{ fontSize: 13, color: "#7d7269", margin: 0 }}>
            {opp.department && <span>{opp.department} · </span>}
            {ET_LABELS[opp.engagementType] ?? opp.engagementType}
            {opp.locationKey && <span> · {opp.locationKey}</span>}
            {opp.openingsCount && <span> · {opp.openingsCount} opening{opp.openingsCount !== 1 ? "s" : ""}</span>}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href={`/admin/hiring/opportunities/${id}/applications`} className="btn btn-primary" style={{ fontSize: 13 }}>
            View Applicants ({totalCount})
          </Link>
          <Link href={`/admin/hiring/opportunities/${id}/edit`} className="btn btn-ghost" style={{ fontSize: 13 }}>
            Edit Opportunity
          </Link>
          {opp.formTemplate && (
            <Link href={`/admin/hiring/templates/${opp.formTemplate.id}/edit`} className="btn btn-ghost" style={{ fontSize: 13 }}>
              Edit Form
            </Link>
          )}
        </div>
      </div>

      {/* Stage stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 28 }}>
        <StageCard value={totalCount} label="Total" color="#1f1a17" />
        <StageCard value={newCount} label="New" color="#2563eb" />
        <StageCard value={reviewCount} label="In Review" color="#7c3aed" />
        <StageCard value={interviewCount} label="Interview" color="#059669" />
        <StageCard value={offerCount} label="Offer / Hired" color="#ea580c" />
        <StageCard value={rejectedCount} label="Rejected" color="#dc2626" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }}>
        {/* Recent applicants */}
        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--color-border)" }}>
            <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 15, fontWeight: 500, margin: 0 }}>Recent Applicants</h3>
            <Link href={`/admin/hiring/opportunities/${id}/applications`} style={{ fontSize: 12, color: "#c41e3a", textDecoration: "none", fontWeight: 500 }}>
              View all →
            </Link>
          </div>
          {recent.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "#b5aca6", fontSize: 14 }}>No applicants yet.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Applicant</th>
                    <th>Stage</th>
                    <th>Date</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((row) => {
                    const sc = STATUS_COLORS[row.status] ?? "#9ca3af";
                    return (
                      <tr key={row.id}>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{row.applicantProfile.fullName}</div>
                          <div style={{ fontSize: 11, color: "#b5aca6" }}>{row.applicantProfile.email}</div>
                        </td>
                        <td>
                          <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: sc + "22", color: sc }}>
                            {STATUS_LABELS[row.status] ?? row.status}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: "#b5aca6" }}>
                          {new Date(row.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </td>
                        <td>
                          <Link href={`/admin/hiring/applications/${row.id}`} style={{ fontSize: 11, color: "#c41e3a", textDecoration: "none" }}>
                            Review →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Info panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <h4 style={{ fontFamily: "var(--font-heading)", fontSize: 14, fontWeight: 600, marginBottom: 12, marginTop: 0 }}>Opportunity Details</h4>
            <InfoRow label="Status" value={opp.status} />
            <InfoRow label="Department" value={opp.department ?? "—"} />
            <InfoRow label="Type" value={ET_LABELS[opp.engagementType] ?? opp.engagementType} />
            <InfoRow label="Location" value={opp.locationKey ?? "—"} />
            <InfoRow label="Openings" value={opp.openingsCount?.toString() ?? "—"} />
            {opp.compensationMin && (
              <InfoRow
                label="Compensation"
                value={`$${opp.compensationMin.toLocaleString()}${opp.compensationMax ? ` – $${opp.compensationMax.toLocaleString()}` : "+"}`}
              />
            )}
            {opp.formTemplate && (
              <InfoRow label="Form" value={opp.formTemplate.name} />
            )}
          </div>

          <div className="card">
            <h4 style={{ fontFamily: "var(--font-heading)", fontSize: 14, fontWeight: 600, marginBottom: 12, marginTop: 0 }}>Pipeline Breakdown</h4>
            {Object.entries(countByStatus).map(([status, count]) => {
              const sc = STATUS_COLORS[status] ?? "#9ca3af";
              return (
                <div key={status} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: "#7d7269" }}>{STATUS_LABELS[status] ?? status}</span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: sc }}>{count}</span>
                </div>
              );
            })}
            {Object.keys(countByStatus).length === 0 && (
              <p style={{ fontSize: 13, color: "#b5aca6", margin: 0 }}>No applications yet.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function StageCard({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-value" style={color ? { color } : {}}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
      <span style={{ fontSize: 12, color: "#b5aca6", fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 13, color: "#1f1a17", textAlign: "right", maxWidth: "55%" }}>{value}</span>
    </div>
  );
}
