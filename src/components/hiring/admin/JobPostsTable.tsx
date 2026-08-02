"use client";

import Link from "next/link";
import { OpportunityRow } from "@/lib/hiring/dashboard";
import { useTranslation } from "@/components/i18n/LocaleProvider";

const OPP_STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  DRAFT:     { bg: "#f5f0eb", color: "#7d7269" },
  PUBLISHED: { bg: "#e6f4ed", color: "#1f8a55" },
  PAUSED:    { bg: "#fff9ef", color: "#b45309" },
  CLOSED:    { bg: "#fdf0f1", color: "#c41e3a" },
  ARCHIVED:  { bg: "#f5f5f5", color: "#9ca3af" },
};

const ET_LABELS: Record<string, string> = {
  FULL_TIME:   "Full-time",
  PART_TIME:   "Part-time",
  SEASONAL:    "Seasonal",
  CONTRACT:    "Contract",
  CONSULTANT:  "Consultant",
  FREELANCE:   "Freelance",
};

type Props = {
  rows: OpportunityRow[];
};

export default function JobPostsTable({ rows }: Props) {
  const t = useTranslation();

  if (rows.length === 0) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center", color: "#b5aca6", fontSize: 14 }}>
        No opportunities match your filters.{" "}
        <Link href="/admin/hiring/opportunities/new" style={{ color: "#c41e3a", fontWeight: 500 }}>
          Create one →
        </Link>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Position</th>
            <th>Dept / Type</th>
            <th>Status</th>
            <th style={{ textAlign: "center" }}>Open</th>
            <th style={{ textAlign: "center" }}>Total</th>
            <th style={{ textAlign: "center" }}>New</th>
            <th style={{ textAlign: "center" }}>Review</th>
            <th style={{ textAlign: "center" }}>Interview</th>
            <th style={{ textAlign: "center" }}>Offer</th>
            <th style={{ textAlign: "right" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const st = OPP_STATUS_STYLES[row.status] ?? OPP_STATUS_STYLES.DRAFT;
            return (
              <tr key={row.id} style={{ cursor: "pointer" }}>
                <td>
                  <Link
                    href={`/admin/hiring/opportunities/${row.id}`}
                    style={{
                      fontWeight: 600,
                      color: "#1f1a17",
                      textDecoration: "none",
                      display: "block",
                    }}
                    onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "#c41e3a")}
                    onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "#1f1a17")}
                  >
                    {row.title}
                  </Link>
                  {row.locationKey && (
                    <span style={{ fontSize: 11, color: "#b5aca6" }}>{row.locationKey}</span>
                  )}
                </td>
                <td>
                  <div style={{ fontSize: 13 }}>{row.department ?? "—"}</div>
                  <div style={{ fontSize: 11, color: "#b5aca6" }}>{ET_LABELS[row.engagementType] ?? row.engagementType}</div>
                </td>
                <td>
                  <span style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    background: st.bg,
                    color: st.color,
                  }}>
                    {t("admin", `status.${row.status}`) || row.status}
                  </span>
                </td>
                <td style={{ textAlign: "center", fontSize: 13, color: "#7d7269" }}>
                  {row.openingsCount ?? "—"}
                </td>
                <td style={{ textAlign: "center" }}>
                  <Link
                    href={`/admin/hiring/opportunities/${row.id}/applications`}
                    style={{
                      fontWeight: 700,
                      fontSize: 14,
                      color: row.total > 0 ? "#c41e3a" : "#b5aca6",
                      textDecoration: "none",
                    }}
                  >
                    {row.total}
                  </Link>
                </td>
                <CountCell value={row.new} color="#2563eb" />
                <CountCell value={row.review} color="#7c3aed" />
                <CountCell value={row.interview} color="#059669" />
                <CountCell value={row.offer} color="#ea580c" />
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    <ActionLink href={`/admin/hiring/opportunities/${row.id}`} label="View" />
                    <ActionLink href={`/admin/hiring/opportunities/${row.id}/applications`} label="Applicants" />
                    {row.formTemplateId && (
                      <ActionLink href={`/admin/hiring/templates/${row.formTemplateId}/edit`} label="Edit Form" accent />
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CountCell({ value, color }: { value: number; color: string }) {
  return (
    <td style={{ textAlign: "center" }}>
      {value > 0 ? (
        <span style={{ fontWeight: 700, fontSize: 13, color }}>{value}</span>
      ) : (
        <span style={{ color: "#d6cfc9", fontSize: 13 }}>—</span>
      )}
    </td>
  );
}

function ActionLink({ href, label, accent }: { href: string; label: string; accent?: boolean }) {
  return (
    <Link
      href={href}
      style={{
        fontSize: 12,
        fontWeight: 500,
        padding: "3px 8px",
        borderRadius: 6,
        border: `1px solid ${accent ? "#c41e3a" : "#e8e2dd"}`,
        color: accent ? "#c41e3a" : "#7d7269",
        background: accent ? "#fdf0f1" : "transparent",
        textDecoration: "none",
        transition: "all 0.12s",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </Link>
  );
}
