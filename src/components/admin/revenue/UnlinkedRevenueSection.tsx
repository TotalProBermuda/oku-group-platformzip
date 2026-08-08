"use client";
import { useEffect, useState } from "react";

interface Row {
  id: string;
  venue?: { name: string } | null;
  tableLabel: string | null;
  closedAt: string | null;
  grossCents: number;
  commissionableCents: number;
  trustScore?: number;
  matchMethod?: string;
  reservation?: { confirmationCode: string; contactName: string } | null;
}

interface Bucket {
  count: number;
  grossCents: number;
  commissionableCents: number;
  rows: Row[];
}

interface Data {
  unmatched: Bucket;
  unlinked: Bucket;
}

function cents(n: number): string {
  return `$${(n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function UnlinkedRevenueSection() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/admin/revenue/unlinked")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setData(j.data);
        else setError(j.error ?? "Error");
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 16, color: "#64748b", fontSize: 13 }}>Loading unlinked revenue…</div>;
  if (error) return <div style={{ padding: 16, color: "#ef4444", fontSize: 13 }}>Error: {error}</div>;
  if (!data) return null;

  const totalCount = data.unmatched.count + data.unlinked.count;
  if (totalCount === 0) {
    return (
      <div style={{ background: "#fff", borderRadius: 16, padding: "16px 20px", border: "1px solid #e2e8f0", color: "#64748b", fontSize: 13 }}>
        No unlinked or unmatched revenue — every closed table session is linked to a reservation and an attribution chain.
      </div>
    );
  }

  return (
    <div style={{ background: "#fff", borderRadius: 16, padding: "20px 24px", border: "1px solid #e2e8f0" }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>Unlinked Revenue Audit</div>
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 16 }}>
        Closed table sessions that aren't tied to a reservation (Unmatched) or aren't tied to an attribution chain (Unlinked) — surfaced so revenue isn't silently dropped.
      </div>

      <Bucket title="Unmatched Sessions" subtitle="No reservation linked — likely walk-in or orphan POS close" bucket={data.unmatched} />
      <div style={{ height: 16 }} />
      <Bucket title="Unlinked Revenue" subtitle="Reservation exists but no attribution session — sourced revenue with broken trust chain" bucket={data.unlinked} />
    </div>
  );
}

function Bucket({ title, subtitle, bucket }: { title: string; subtitle: string; bucket: Bucket }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>{title}</div>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>{subtitle}</div>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <Tile label="Sessions" value={String(bucket.count)} />
          <Tile label="Gross" value={cents(bucket.grossCents)} />
          <Tile label="Commissionable" value={cents(bucket.commissionableCents)} />
        </div>
      </div>
      {bucket.rows.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                {["Venue", "Table", "Reservation", "Closed", "Gross", "Commissionable"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bucket.rows.slice(0, 20).map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                  <td style={{ padding: "6px 10px" }}>{r.venue?.name ?? "—"}</td>
                  <td style={{ padding: "6px 10px" }}>{r.tableLabel ?? "—"}</td>
                  <td style={{ padding: "6px 10px", fontFamily: "monospace", fontSize: 11 }}>{r.reservation?.confirmationCode ?? "—"}</td>
                  <td style={{ padding: "6px 10px" }}>{fmtDate(r.closedAt)}</td>
                  <td style={{ padding: "6px 10px" }}>{cents(r.grossCents)}</td>
                  <td style={{ padding: "6px 10px" }}>{cents(r.commissionableCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {bucket.rows.length > 20 && (
            <div style={{ padding: "8px 10px", fontSize: 11, color: "#64748b" }}>
              + {bucket.rows.length - 20} more (showing top 20)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 100 }}>
      <div style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>{value}</div>
    </div>
  );
}
