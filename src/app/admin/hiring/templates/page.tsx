import Link from "next/link";
import { prisma } from "@/lib/prisma";

const STATUS_COLORS: Record<string, string> = {
  DRAFT:     "#6b7280",
  PUBLISHED: "#16a34a",
  ARCHIVED:  "#9ca3af",
};

export default async function TemplatesAdminPage() {
  const rows = await prisma.formTemplate.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { opportunities: true } } },
  });

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h2 className="section-title">Form Templates</h2>
          <p style={{ fontSize: 14, color: "var(--color-text-muted)", marginTop: 4 }}>
            Dynamic schemas used by hiring opportunities.
          </p>
        </div>
        <Link href="/admin/hiring/templates/new" className="btn btn-primary">
          + New Template
        </Link>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {rows.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--color-text-muted)", fontSize: 14 }}>
            No templates yet.{" "}
            <Link href="/admin/hiring/templates/new" style={{ color: "var(--color-crimson)" }}>
              Create your first template →
            </Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Used by</th>
                  <th>Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{row.name}</div>
                      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{row.slug}</div>
                    </td>
                    <td style={{ fontSize: 13 }}>{row.category ?? "—"}</td>
                    <td style={{ fontSize: 13 }}>v{row.version}</td>
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
                      <span className="badge badge-neutral">{row._count.opportunities} {row._count.opportunities === 1 ? "role" : "roles"}</span>
                    </td>
                    <td style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                      {new Date(row.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td>
                      <Link
                        href={`/admin/hiring/templates/${row.id}/edit`}
                        className="btn btn-ghost"
                        style={{ fontSize: 12, padding: "4px 12px" }}
                      >
                        Edit Builder →
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
