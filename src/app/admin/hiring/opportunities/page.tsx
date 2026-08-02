import Link from "next/link";
import { prisma } from "@/lib/prisma";

const STATUS_COLORS: Record<string, string> = {
  DRAFT:     "#6b7280",
  PUBLISHED: "#16a34a",
  PAUSED:    "#d97706",
  CLOSED:    "#dc2626",
  ARCHIVED:  "#9ca3af",
};

export default async function OpportunitiesAdminPage() {
  const rows = await prisma.opportunity.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      formTemplate: { select: { name: true } },
      _count: { select: { submissions: true } },
    },
  });

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h2 className="section-title">Opportunities</h2>
          <p style={{ fontSize: 14, color: "var(--color-text-muted)", marginTop: 4 }}>
            {rows.length} total {rows.length === 1 ? "opportunity" : "opportunities"}
          </p>
        </div>
        <Link href="/admin/hiring/opportunities/new" className="btn btn-primary">
          + New Opportunity
        </Link>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {rows.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--color-text-muted)", fontSize: 14 }}>
            No opportunities yet.{" "}
            <Link href="/admin/hiring/opportunities/new" style={{ color: "var(--color-crimson)" }}>
              Create your first one →
            </Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Department</th>
                  <th>Type</th>
                  <th>Template</th>
                  <th>Status</th>
                  <th>Applications</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{row.title}</div>
                      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{row.slug}</div>
                    </td>
                    <td style={{ fontSize: 13 }}>{row.department ?? "—"}</td>
                    <td style={{ fontSize: 13 }}>{row.engagementType.replaceAll("_", " ")}</td>
                    <td style={{ fontSize: 13 }}>{row.formTemplate.name}</td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: (STATUS_COLORS[row.status] ?? "#6b7280") + "1a",
                          color: STATUS_COLORS[row.status] ?? "#6b7280",
                          border: `1px solid ${STATUS_COLORS[row.status] ?? "#6b7280"}40`,
                        }}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className="badge badge-neutral">{row._count.submissions}</span>
                    </td>
                    <td>
                      <Link
                        href={`/careers/${row.slug}`}
                        target="_blank"
                        style={{ fontSize: 13, color: "var(--color-text-muted)" }}
                      >
                        View ↗
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
