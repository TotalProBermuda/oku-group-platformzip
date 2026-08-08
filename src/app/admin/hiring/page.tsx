import Link from "next/link";
import { getOpportunityDashboardRows, getApplicationsPipeline, getHiringStats } from "@/lib/hiring/dashboard";
import JobPostsTable from "@/components/hiring/admin/JobPostsTable";
import ApplicationsPipelineTable from "@/components/hiring/admin/ApplicationsPipelineTable";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string>> };

const filterInputStyle: React.CSSProperties = {
  padding: "5px 10px", fontSize: 12, border: "1px solid #e8e2dd",
  borderRadius: 8, background: "#faf8f6", color: "#1f1a17", outline: "none", width: 140,
};
const filterSelectStyle: React.CSSProperties = {
  padding: "5px 8px", fontSize: 12, border: "1px solid #e8e2dd",
  borderRadius: 8, background: "#faf8f6", color: "#1f1a17", cursor: "pointer",
};
const filterBtnStyle: React.CSSProperties = {
  padding: "5px 12px", fontSize: 12, fontWeight: 600,
  background: "#1f1a17", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer",
};

export default async function HiringDashboardPage({ searchParams }: Props) {
  const sp = await searchParams;
  const [stats, oppRows, appRows, allOpps] = await Promise.all([
    getHiringStats(),
    getOpportunityDashboardRows({ status: sp.jobStatus, department: sp.dept, location: sp.location, engagementType: sp.engType, search: sp.q }),
    getApplicationsPipeline({ opportunityId: sp.oppId, stage: sp.stage, workAuth: sp.workAuth, weekend: sp.weekend, language: sp.lang, experience: sp.exp }),
    prisma.opportunity.findMany({ select: { id: true, title: true }, orderBy: { title: "asc" } }),
  ]);
  const jobFilters = [sp.jobStatus, sp.dept, sp.location, sp.engType, sp.q].filter(Boolean);
  const appFilters = [sp.oppId, sp.stage, sp.workAuth, sp.weekend, sp.lang, sp.exp].filter(Boolean);
  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h2 className="section-title">Hiring Dashboard</h2>
          <p style={{ fontSize: 14, color: "var(--color-text-muted)", marginTop: 4 }}>Manage job opportunities, applicants, and form templates.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/admin/hiring/templates" className="btn btn-ghost" style={{ fontSize: 13 }}>Form Templates</Link>
          <Link href="/admin/hiring/opportunities/new" className="btn btn-primary" style={{ fontSize: 13 }}>+ New Opportunity</Link>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 28 }}>
        <StatCard value={stats.totalOpps} label="Opportunities" />
        <StatCard value={stats.activeOpps} label="Active" color="#1f8a55" />
        <StatCard value={stats.totalApps} label="Total Applications" />
        <StatCard value={stats.newApps} label="Awaiting Review" color="#2563eb" />
        <StatCard value={stats.interviewApps} label="In Interview" color="#059669" />
        <StatCard value={stats.offerApps} label="Offers / Hired" color="#ea580c" />
      </div>
      {/* Job Posts */}
      <div className="card" style={{ padding: 0, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--color-border)", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 500, margin: 0 }}>Job Posts</h3>
            <span style={{ fontSize: 12, color: "#b5aca6" }}>{oppRows.length} showing</span>
            {jobFilters.length > 0 && <Link href="/admin/hiring" style={{ fontSize: 11, color: "#c41e3a", textDecoration: "none", fontWeight: 500 }}>× Clear</Link>}
          </div>
          <form method="get" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["oppId","stage","workAuth","weekend","lang","exp"].map((k) => sp[k] ? <input key={k} type="hidden" name={k} value={sp[k]} /> : null)}
            <input name="q" defaultValue={sp.q} placeholder="Search roles…" style={filterInputStyle} />
            <select name="jobStatus" defaultValue={sp.jobStatus ?? ""} style={filterSelectStyle}>
              <option value="">All statuses</option>
              <option value="PUBLISHED">Published</option>
              <option value="DRAFT">Draft</option>
              <option value="PAUSED">Paused</option>
              <option value="CLOSED">Closed</option>
            </select>
            <select name="dept" defaultValue={sp.dept ?? ""} style={filterSelectStyle}>
              <option value="">All depts</option>
              {["F&B","FOH","BOH","Marketing","Events","Creative","Management"].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select name="engType" defaultValue={sp.engType ?? ""} style={filterSelectStyle}>
              <option value="">All types</option>
              <option value="FULL_TIME">Full-time</option>
              <option value="PART_TIME">Part-time</option>
              <option value="SEASONAL">Seasonal</option>
              <option value="FREELANCE">Freelance</option>
              <option value="CONTRACT">Contract</option>
            </select>
            <button type="submit" style={filterBtnStyle}>Filter</button>
          </form>
        </div>
        <JobPostsTable rows={oppRows} />
      </div>
      {/* Application Pipeline */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--color-border)", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 500, margin: 0 }}>Application Pipeline</h3>
            <span style={{ fontSize: 12, color: "#b5aca6" }}>{appRows.length} showing</span>
            {appFilters.length > 0 && <Link href="/admin/hiring" style={{ fontSize: 11, color: "#c41e3a", textDecoration: "none", fontWeight: 500 }}>× Clear</Link>}
          </div>
          <form method="get" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["q","jobStatus","dept","location","engType"].map((k) => sp[k] ? <input key={k} type="hidden" name={k} value={sp[k]} /> : null)}
            <select name="oppId" defaultValue={sp.oppId ?? ""} style={filterSelectStyle}>
              <option value="">All roles</option>
              {allOpps.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
            </select>
            <select name="stage" defaultValue={sp.stage ?? ""} style={filterSelectStyle}>
              <option value="">All stages</option>
              <option value="SUBMITTED">New</option>
              <option value="UNDER_REVIEW">Under Review</option>
              <option value="HR_SCREEN">HR Screen</option>
              <option value="INTERVIEW_SCHEDULED">Interview</option>
              <option value="TRIAL_SHIFT">Trial Shift</option>
              <option value="OFFER_PENDING">Offer Pending</option>
              <option value="HIRED">Hired</option>
              <option value="REJECTED">Rejected</option>
            </select>
            <select name="workAuth" defaultValue={sp.workAuth ?? ""} style={filterSelectStyle}>
              <option value="">Work auth</option>
              <option value="yes">Authorized ✓</option>
            </select>
            <select name="weekend" defaultValue={sp.weekend ?? ""} style={filterSelectStyle}>
              <option value="">Weekend</option>
              <option value="yes">Available ✓</option>
            </select>
            <select name="exp" defaultValue={sp.exp ?? ""} style={filterSelectStyle}>
              <option value="">Min exp.</option>
              <option value="1">1+ yrs</option>
              <option value="2">2+ yrs</option>
              <option value="5">5+ yrs</option>
            </select>
            <select name="lang" defaultValue={sp.lang ?? ""} style={filterSelectStyle}>
              <option value="">Language</option>
              <option value="English">English</option>
              <option value="Spanish">Spanish</option>
              <option value="French">French</option>
              <option value="Arabic">Arabic</option>
            </select>
            <button type="submit" style={filterBtnStyle}>Filter</button>
          </form>
        </div>
        <ApplicationsPipelineTable rows={appRows} opportunities={allOpps} />
      </div>
    </>
  );
}

function StatCard({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-value" style={color ? { color } : {}}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
