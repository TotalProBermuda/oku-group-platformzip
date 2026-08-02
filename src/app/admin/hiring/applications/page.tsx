import Link from "next/link";
import { prisma } from "@/lib/prisma";

const STATUS_COLORS: Record<string, string> = {
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

export default async function ApplicationsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; opportunityId?: string }>;
}) {
  const { status, opportunityId } = await searchParams;

  const rows = await prisma.applicationSubmission.findMany({
    where: {
      ...(status ? { status: status as never } : {}),
      ...(opportunityId ? { opportunityId } : {}),
    },
    orderBy: { submittedAt: "desc" },
    include: {
      applicantProfile: { select: { fullName: true, email: true } },
      opportunity: { select: { title: true, slug: true } },
    },
  });

  const opportunities = await prisma.opportunity.findMany({
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h2 className="section-title">Applications</h2>
          <p style={{ fontSize: 14, color: "var(--color-text-muted)", marginTop: 4 }}>
            {rows.length} application{rows.length !== 1 ? "s" : ""}
            {status ? ` · ${status.replaceAll("_", " ")}` : ""}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <Link
          href="/admin/hiring/applications"
          className={`btn ${!status ? "btn-primary" : "btn-ghost"}`}
          style={{ fontSize: 13 }}
        >
          All
        </Link>
        {["SUBMITTED", "UNDER_REVIEW", "HR_SCREEN", "INTERVIEW_SCHEDULED", "OFFER_PENDING", "HIRED", "REJECTED"].map((s) => (
          <Link
            key={s}
            href={`/admin/hiring/applications?status=${s}`}
            className={`btn ${status === s ? "btn-primary" : "btn-ghost"}`}
            style={{ fontSize: 13 }}
          >
            {s.replaceAll("_", " ")}
          </Link>
        ))}
      </div>

      <div className="card" style={{ padding: 0 }}>
        {rows.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--color-text-muted)", fontSize: 14 }}>
            No applications found{status ? ` with status "${status.replaceAll("_", " ")}"` : ""}.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Opportunity</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{row.applicantProfile.fullName}</div>
                      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{row.applicantProfile.email}</div>
                    </td>
                    <td style={{ fontSize: 13 }}>{row.opportunity.title}</td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: (STATUS_COLORS[row.status] ?? "#6b7280") + "1a",
                          color: STATUS_COLORS[row.status] ?? "#6b7280",
                          border: `1px solid ${STATUS_COLORS[row.status] ?? "#6b7280"}40`,
                        }}
                      >
                        {row.status.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                      {row.submittedAt
                        ? new Date(row.submittedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                    <td>
                      <Link
                        href={`/admin/hiring/applications/${row.id}`}
                        style={{ fontSize: 13, color: "var(--color-crimson)" }}
                      >
                        Review →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
