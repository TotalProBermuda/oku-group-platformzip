"use client";

import Link from "next/link";
import { useState } from "react";
import { ApplicationRow, STATUS_LABELS, STATUS_COLORS } from "@/lib/hiring/dashboard";

type Props = {
  rows: ApplicationRow[];
  opportunities: { id: string; title: string }[];
};

const ALL_STATUSES = [
  "SUBMITTED", "UNDER_REVIEW", "HR_SCREEN", "MANAGER_REVIEW",
  "INTERVIEW_SCHEDULED", "TRIAL_SHIFT", "OFFER_PENDING", "HIRED",
  "REJECTED", "WITHDRAWN",
];

export default function ApplicationsPipelineTable({ rows, opportunities }: Props) {
  const [updating, setUpdating] = useState<string | null>(null);

  async function moveStage(appId: string, newStatus: string) {
    setUpdating(appId);
    try {
      await fetch(`/api/hiring/applications/${appId}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      window.location.reload();
    } finally {
      setUpdating(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center", color: "#b5aca6", fontSize: 14 }}>
        No applications match your filters.
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Applicant</th>
            <th>Position</th>
            <th>Stage</th>
            <th>Exp.</th>
            <th>Languages</th>
            <th>Auth</th>
            <th>Weekend</th>
            <th>Applied</th>
            <th style={{ textAlign: "right" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const statusColor = STATUS_COLORS[row.status] ?? "#9ca3af";
            const n = row.normalized;
            const langs: string[] = Array.isArray(n.languages)
              ? n.languages
              : n.languages ? [n.languages] : [];
            const yrsExp = n.yearsExperience ?? n.yearsHospitalityExperience ?? null;
            const workAuth = n.authorizedToWork ?? n.workAuthorization;
            const weekend = n.weekendAvailability;

            return (
              <tr key={row.id}>
                <td>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#1f1a17" }}>
                    {row.applicantName}
                  </div>
                  <div style={{ fontSize: 11, color: "#b5aca6" }}>{row.applicantEmail}</div>
                </td>
                <td>
                  <Link
                    href={`/admin/hiring/opportunities/${row.opportunityId}`}
                    style={{ fontSize: 12, color: "#7d7269", textDecoration: "none", fontWeight: 500 }}
                  >
                    {row.opportunityTitle}
                  </Link>
                </td>
                <td>
                  <span style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 700,
                    background: statusColor + "22",
                    color: statusColor,
                    whiteSpace: "nowrap",
                  }}>
                    {STATUS_LABELS[row.status] ?? row.status}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: "#7d7269", textAlign: "center" }}>
                  {yrsExp != null ? `${yrsExp}y` : "—"}
                </td>
                <td style={{ fontSize: 12, color: "#7d7269" }}>
                  {langs.length > 0 ? langs.slice(0, 2).join(", ") : "—"}
                </td>
                <td style={{ textAlign: "center" }}>
                  <AuthBadge value={workAuth} />
                </td>
                <td style={{ textAlign: "center" }}>
                  <AuthBadge value={weekend} />
                </td>
                <td style={{ fontSize: 12, color: "#b5aca6", whiteSpace: "nowrap" }}>
                  {row.submittedAt
                    ? new Date(row.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                    : new Date(row.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </td>
                <td style={{ textAlign: "right" }}>
                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", alignItems: "center" }}>
                    <Link
                      href={`/admin/hiring/applications/${row.id}`}
                      style={{ fontSize: 11, color: "#7d7269", padding: "2px 7px", border: "1px solid #e8e2dd", borderRadius: 5, textDecoration: "none", whiteSpace: "nowrap" }}
                    >
                      View
                    </Link>
                    <select
                      value={row.status}
                      disabled={updating === row.id}
                      onChange={(e) => moveStage(row.id, e.target.value)}
                      style={{
                        fontSize: 11,
                        padding: "2px 4px",
                        borderRadius: 5,
                        border: "1px solid #e8e2dd",
                        color: "#7d7269",
                        background: "#fff",
                        cursor: "pointer",
                        maxWidth: 120,
                      }}
                    >
                      {ALL_STATUSES.map((s) => (
                        <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
                      ))}
                    </select>
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

function AuthBadge({ value }: { value: any }) {
  if (value === true || value === "yes" || value === "Yes") {
    return <span style={{ color: "#1f8a55", fontSize: 13, fontWeight: 700 }}>✓</span>;
  }
  if (value === false || value === "no" || value === "No") {
    return <span style={{ color: "#c41e3a", fontSize: 13 }}>✗</span>;
  }
  return <span style={{ color: "#d6cfc9", fontSize: 12 }}>—</span>;
}
