"use client";

/**
 * Admin Payment Ledger Page (Payments P215)
 *
 * Lists reservation deposit PaymentIntents with their status, reservation
 * info, Cybersource transaction ID, and latest attempt result.
 * No raw card data is displayed — never stored.
 */
import { useState, useEffect, useCallback } from "react";

type PaymentIntentRow = {
  id: string;
  reservationId: string | null;
  orderType: string;
  amountCents: number;
  currency: string;
  status: string;
  provider: string;
  cybersourceTransactionId: string | null;
  lastFailureCode: string | null;
  lastFailureMessage: string | null;
  createdAt: string;
  updatedAt: string;
  reservation: {
    id: string;
    confirmationCode: string;
    contactName: string;
    contactEmail: string;
    partySize: number;
    reservationDate: string;
    status: string;
  } | null;
  latestAttempt: {
    id: string;
    status: string;
    amountCents: number;
    cybersourceTransactionId: string | null;
    failureCode: string | null;
    failureMessage: string | null;
    createdAt: string;
  } | null;
};

const STATUS_BADGE: Record<string, string> = {
  CREATED: "bg-gray-100 text-gray-700",
  AUTHORIZED: "bg-blue-100 text-blue-700",
  CAPTURED: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
  CANCELLED: "bg-orange-100 text-orange-700",
  REFUNDED: "bg-purple-100 text-purple-700",
};

function centsToDisplay(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PaymentLedgerPage() {
  const [rows, setRows] = useState<PaymentIntentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25" });
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/v1/admin/payments/ledger?${params}`);
      const json = await res.json();
      if (json.ok) {
        setRows(json.data);
        setTotal(json.meta.total);
        setPages(json.meta.pages);
      }
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Payment Ledger</h1>
        <p className="text-sm text-gray-500 mt-1">
          Reservation deposit PaymentIntents — no card data stored.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          className="border rounded px-3 py-2 text-sm w-64"
          placeholder="Search by code, email, or transaction ID…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <select
          className="border rounded px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="">All statuses</option>
          <option value="CREATED">Created</option>
          <option value="AUTHORIZED">Authorized</option>
          <option value="CAPTURED">Captured</option>
          <option value="FAILED">Failed</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="REFUNDED">Refunded</option>
        </select>
        <button
          onClick={load}
          className="border rounded px-3 py-2 text-sm bg-white hover:bg-gray-50"
        >
          Refresh
        </button>
        <span className="text-sm text-gray-500 self-center">{total} total</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Date", "Reservation", "Guest", "Amount", "Status", "CS Transaction ID", "Last Error"].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">No payment intents found.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {formatDate(row.createdAt)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {row.reservation ? (
                      <span className="font-semibold">{row.reservation.confirmationCode}</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.reservation ? (
                      <div>
                        <div className="font-medium">{row.reservation.contactName}</div>
                        <div className="text-gray-400 text-xs">{row.reservation.contactEmail}</div>
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium whitespace-nowrap">
                    {centsToDisplay(row.amountCents, row.currency)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[row.status] ?? "bg-gray-100 text-gray-600"}`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {row.cybersourceTransactionId ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-red-600 max-w-xs truncate">
                    {row.lastFailureMessage ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex gap-2 items-center">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="border rounded px-3 py-1.5 text-sm disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-sm text-gray-500">Page {page} of {pages}</span>
          <button
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
            className="border rounded px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
