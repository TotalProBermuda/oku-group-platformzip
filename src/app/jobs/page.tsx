import Link from "next/link";

interface Job {
  id: string;
  slug: string;
  title: string;
  department: string;
  location: string | null;
  description: string;
}

async function getJobs(): Promise<Job[]> {
  const base = process.env.APP_BASE_URL || "http://localhost:5000";
  const res = await fetch(`${base}/api/v1/public/jobs`, { cache: "no-store" });
  const json = await res.json();
  return json.ok ? json.data : [];
}

const deptColors: Record<string, string> = {
  FOH: "#059669",
  BOH: "#d97706",
  BAR: "#0891b2",
  EVENTS: "#7c3aed",
  RESERVATIONS: "#c41e3a",
  HR: "#1d4ed8",
  FINANCE: "#0d6efd",
  MARKETING_PR: "#c026d3",
  MANAGEMENT: "#1a1614",
};

const deptLabels: Record<string, string> = {
  FOH: "Front of House",
  BOH: "Back of House",
  BAR: "Bar",
  EVENTS: "Events",
  RESERVATIONS: "Reservations",
  HR: "HR",
  FINANCE: "Finance",
  MARKETING_PR: "Marketing & PR",
  MANAGEMENT: "Management",
};

export default async function JobsPage() {
  const jobs = await getJobs();

  const grouped: Record<string, Job[]> = {};
  jobs.forEach((job) => {
    if (!grouped[job.department]) grouped[job.department] = [];
    grouped[job.department].push(job);
  });

  return (
    <div>
      <div style={{ background: "#f8f5f3", borderBottom: "1px solid var(--color-border)", padding: "40px 24px 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 12 }}>
            Careers at OKÜ Hospitality Group
          </div>
          <h1 style={{
            fontFamily: "var(--font-heading)",
            fontSize: "clamp(32px, 5vw, 52px)",
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "var(--color-text)",
            marginBottom: 12,
            lineHeight: 1.1,
          }}>
            Join Our Team
          </h1>
          <p style={{ fontSize: 16, color: "var(--color-text-secondary)", maxWidth: 480, lineHeight: 1.7 }}>
            Be part of a team dedicated to delivering exceptional hospitality experiences across our venues.
          </p>
          {jobs.length > 0 && (
            <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
              <span className="badge badge-success" style={{ fontSize: 12 }}>
                {jobs.length} Open Position{jobs.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="page-container">
        {jobs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">💼</div>
            <div className="empty-state-title">No open positions</div>
            <p>Check back soon — we're always growing.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
            {Object.entries(grouped).map(([dept, deptJobs]) => (
              <section key={dept}>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
                  <div style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: deptColors[dept] || "var(--color-primary)",
                    flexShrink: 0,
                  }} />
                  <h2 className="section-title" style={{ margin: 0 }}>
                    {deptLabels[dept] || dept.replace(/_/g, " ")}
                  </h2>
                  <span className="text-sm text-muted">
                    {deptJobs.length} position{deptJobs.length !== 1 ? "s" : ""}
                  </span>
                  <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {deptJobs.map((job) => (
                    <div
                      key={job.id}
                      className="card"
                      style={{ display: "flex", alignItems: "center", gap: 20, padding: "20px 24px" }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 600, marginBottom: 4 }}>
                          {job.title}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                          {job.location && (
                            <span className="text-sm text-secondary">
                              📍 {job.location}
                            </span>
                          )}
                          <span
                            className="badge"
                            style={{
                              background: `${deptColors[job.department] || "#c41e3a"}18`,
                              color: deptColors[job.department] || "var(--color-primary)",
                            }}
                          >
                            {deptLabels[job.department] || job.department}
                          </span>
                        </div>
                        <p className="text-sm text-secondary" style={{ marginTop: 8, lineHeight: 1.6 }}>
                          {job.description.length > 140 ? job.description.slice(0, 140) + "…" : job.description}
                        </p>
                      </div>
                      <Link
                        href={`/jobs/${job.slug}`}
                        className="btn btn-primary btn-sm"
                        style={{ flexShrink: 0 }}
                      >
                        Apply Now
                      </Link>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
