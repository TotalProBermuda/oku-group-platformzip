import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getApplicationsPipeline, STATUS_LABELS, STATUS_COLORS } from "@/lib/hiring/dashboard";
import ApplicationsPipelineTable from "@/components/hiring/admin/ApplicationsPipelineTable";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
};

const filterSelectStyle: React.CSSProperties = {
  padding: "5px 8px", fontSize: 12, border: "1px solid #e8e2dd",
  borderRadius: 8, background: "#faf8f6", color: "#1f1a17", cursor: "pointer",
};
const filterBtnStyle: React.CSSProperties = {
  padding: "5px 12px", fontSize: 12, fontWeight: 600,
  background: "#1f1a17", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer",
};

export default async function OpportunityApplicationsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;

  const opp = await prisma.opportunity.findUnique({
    where: { id },
    select: { id: true, title: true, department: true, status: true, _count: { select: { submissions: true } } },
  });
  if (!opp) notFound();

  // Stage breakdown for filter pills
  const stageCounts = await prisma.applicationSubmission.groupBy({
    by: ["status"],
    where: { opportunityId: id },
    _count: true,
  });
  const countByStatus: Record<string, number> = {};
  for (const row of stageCounts) countByStatus[row.status] = row._count;

  const rows = await getApplicationsPipeline({
    opportunityId: id,
    stage:    sp.stage,
    workAuth: sp.workAuth,
    weekend:  sp.weekend,
    language: sp.lang,
    experience: sp.exp,
  }, 200);

  const hasFilters = [sp.stage, sp.workAuth, sp.weekend, sp.lang, sp.exp].some(Boolean);
  const baseHref = `/admin/hiring/opportunities/${id}/applications`;

  return (
    <>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, fontSize: 13, color: "#b5aca6" }}>
        <Link href="/admin/hiring" style={{ color: "#b5aca6", textDecoration: "none" }}>Hiring</Link>
        <span>/</span>
        <Link href={`/admin/hiring/opportunities/${id}`} style={{ color: "#b5aca6", textDecoration: "none" }}>{opp.title}</Link>
        <span>/</span>
        <span style={{ color: "#1f1a17" }}>Applicants</span>
      </div>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 className="section-title" style={{ marginBottom: 4 }}>Applicants — {opp.title}</h2>
          <p style={{ fontSize: 13, color: "#7d7269", margin: 0 }}>
            {opp._count.submissions} total · {rows.length} showing
            {opp.department && <span> · {opp.department}</span>}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href={`/admin/hiring/opportunities/${id}`} className="btn btn-ghost" style={{ fontSize: 13 }}>
            ← Back to Opportunity
          </Link>
        </div>
      </div>

      {/* Stage pills */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <Link
          href={baseHref}
          style={{
            fontSize: 12, fontWeight: sp.stage ? 400 : 700, padding: "4px 12px", borderRadius: 20,
            border: "1px solid #e8e2dd", textDecoration: "none",
            background: sp.stage ? "transparent" : "#1f1a17", color: sp.stage ? "#7d7269" : "#fff",
          }}
        >
          All ({opp._count.submissions})
        </Link>
        {Object.entries(countByStatus).map(([status, count]) => {
          const isActive = sp.stage === status;
          const sc = STATUS_COLORS[status] ?? "#9ca3af";
          return (
            <Link
              key={status}
              href={`${baseHref}?stage=${status}`}
              style={{
                fontSize: 12, fontWeight: isActive ? 700 : 400, padding: "4px 12px", borderRadius: 20,
                border: `1px solid ${isActive ? sc : "#e8e2dd"}`, textDecoration: "none",
                background: isActive ? sc + "22" : "transparent", color: isActive ? sc : "#7d7269",
              }}
            >
              {STATUS_LABELS[status] ?? status} ({count})
            </Link>
          );
        })}
      </div>

      {/* Filter bar */}
      <div className="card" style={{ padding: "12px 16px", marginBottom: 20 }}>
        <form method="get" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {sp.stage && <input type="hidden" name="stage" value={sp.stage} />}
          <select name="workAuth" defaultValue={sp.workAuth ?? ""} style={filterSelectStyle}>
            <option value="">Work auth</option>
            <option value="yes">Authorized ✓</option>
          </select>
          <select name="weekend" defaultValue={sp.weekend ?? ""} style={filterSelectStyle}>
            <option value="">Weekend</option>
            <option value="yes">Available ✓</option>
          </select>
          <select name="exp" defaultValue={sp.exp ?? ""} style={filterSelectStyle}>
            <option value="">Min experience</option>
            <option value="1">1+ years</option>
            <option value="2">2+ years</option>
            <option value="5">5+ years</option>
          </select>
          <select name="lang" defaultValue={sp.lang ?? ""} style={filterSelectStyle}>
            <option value="">Language</option>
            <option value="English">English</option>
            <option value="Spanish">Spanish</option>
            <option value="French">French</option>
            <option value="Arabic">Arabic</option>
            <option value="Portuguese">Portuguese</option>
          </select>
          <button type="submit" style={filterBtnStyle}>Apply</button>
          {hasFilters && (
            <Link href={sp.stage ? `${baseHref}?stage=${sp.stage}` : baseHref} style={{ fontSize: 12, color: "#c41e3a", textDecoration: "none", fontWeight: 500 }}>
              × Clear filters
            </Link>
          )}
        </form>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        <ApplicationsPipelineTable rows={rows} opportunities={[{ id: opp.id, title: opp.title }]} />
      </div>
    </>
  );
}
