"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface Venue {
  id: string;
  name: string;
  slug: string;
}

type MatchMethod = "AUTO" | "MANUAL" | "UNMATCHED";
type TableSessionStatus = "MATCHED" | "PENDING_REVIEW" | "REJECTED";

interface ClosedOrderRow {
  tableSessionId: string;
  invuOrderId: string | null;
  publicOrderNumber: string | null;
  tableLabel: string | null;
  closedAt: string | null;
  openedAt: string | null;
  partySize: number | null;
  customerName: string | null;
  grossCents: number;
  taxCents: number;
  tipCents: number;
  discountCents: number;
  refundCents: number;
  subtotalCents: number;
  commissionableCents: number;
  matchMethod: MatchMethod;
  status: TableSessionStatus;
  trustScore: number | null;
  reservation: {
    id: string;
    contactName: string;
    partySize: number;
    reservationDate: string;
    confirmationCode: string;
    assignedTableLabel: string | null;
    sourceLabel: string;
  } | null;
  attribution: {
    sourceType: string;
    sourceLabel: string | null;
    earnerName: string;
    earnerType: "REFERRER" | "RESTAURANT_HOST";
    earnerSubtype: string | null;
  } | null;
}

interface Overview {
  venueId: string;
  windowStart: string;
  windowEnd: string;
  totals: {
    total: number;
    matchedAuto: number;
    matchedManual: number;
    unmatched: number;
    grossCents: number;
    netSubtotalCents: number;
    taxCents: number;
    tipCents: number;
    discountCents: number;
    refundCents: number;
    commissionableCents: number;
  };
  rows: ClosedOrderRow[];
  lastSyncRun: {
    id: string;
    status: string;
    finishedAt: string | null;
    ordersPulledCount: number;
    matchedCount: number;
    unmatchedCount: number;
  } | null;
}

interface Candidate {
  id: string;
  contactName: string;
  partySize: number;
  reservationDate: string;
  confirmationCode: string;
  assignedTableLabel: string | null;
  alreadyLinkedToOtherSession: boolean;
}

function fmtMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function InvuClosedOrdersPanel({ venues }: { venues: Venue[] }) {
  const [selectedVenueId, setSelectedVenueId] = useState<string>(venues[0]?.id ?? "");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"matched" | "unmatched">("matched");
  const [matchingSessionId, setMatchingSessionId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateLoading, setCandidateLoading] = useState(false);

  const loadOverview = useCallback(async () => {
    if (!selectedVenueId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/admin/integrations/invu/closed-orders?venueId=${encodeURIComponent(selectedVenueId)}&days=7`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load");
      setOverview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [selectedVenueId]);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  // Auto-trigger a fresh pull whenever the displayed last-sync is stale
  // (>30 min old or missing). This guarantees the totals on screen always
  // reflect a recent INVU pull, eliminating "stale data" mismatches with the
  // INVU dashboard.
  useEffect(() => {
    if (!overview || pulling) return;
    const last = overview.lastSyncRun?.finishedAt
      ? new Date(overview.lastSyncRun.finishedAt).getTime()
      : 0;
    const ageMin = (Date.now() - last) / 60000;
    if (ageMin > 30) {
      runPull(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview?.venueId]);

  const runPull = useCallback(
    async (windowMinutes?: number) => {
      if (!selectedVenueId) return;
      setPulling(true);
      setError(null);
      try {
        const res = await fetch("/api/v1/admin/integrations/invu/closed-orders/pull", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            venueId: selectedVenueId,
            ...(windowMinutes ? { windowMinutes } : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Pull failed");
        await loadOverview();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Pull failed");
      } finally {
        setPulling(false);
      }
    },
    [selectedVenueId, loadOverview]
  );

  const openMatchPicker = useCallback(async (sessionId: string) => {
    setMatchingSessionId(sessionId);
    setCandidateLoading(true);
    setCandidates([]);
    try {
      const res = await fetch(
        `/api/v1/admin/integrations/invu/closed-orders/candidates?tableSessionId=${encodeURIComponent(sessionId)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed");
      setCandidates(data.candidates ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load candidates");
    } finally {
      setCandidateLoading(false);
    }
  }, []);

  const confirmMatch = useCallback(async (reservationId: string) => {
    if (!matchingSessionId) return;
    try {
      const res = await fetch("/api/v1/admin/integrations/invu/closed-orders/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableSessionId: matchingSessionId, reservationId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Match failed");
      setMatchingSessionId(null);
      setCandidates([]);
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Match failed");
    }
  }, [matchingSessionId, loadOverview]);

  const matchedRows = useMemo(
    () => overview?.rows.filter((r) => r.matchMethod !== "UNMATCHED") ?? [],
    [overview]
  );
  const unmatchedRows = useMemo(
    () => overview?.rows.filter((r) => r.matchMethod === "UNMATCHED") ?? [],
    [overview]
  );

  if (venues.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#0f1015] to-[#0a0a0f] p-8 text-white">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-3xl font-light tracking-tight">INVU · Closed Orders</h1>
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur">
            <p className="text-white/60">
              No venues with a connected INVU integration.{" "}
              <a href="/admin/integrations/invu" className="text-amber-300 hover:underline">
                Connect INVU
              </a>{" "}
              first.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#0f1015] to-[#0a0a0f] p-8 text-white">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-amber-300/70">
              INVU · Revenue trust layer
            </div>
            <h1 className="mt-2 text-3xl font-light tracking-tight">Closed Orders</h1>
            <p className="mt-1 text-sm text-white/50">
              Last 7 days of closed checks, matched to reservations and attribution.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedVenueId}
              onChange={(e) => setSelectedVenueId(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm backdrop-blur focus:border-amber-300/40 focus:outline-none"
            >
              {venues.map((v) => (
                <option key={v.id} value={v.id} className="bg-[#0f1015]">
                  {v.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => runPull(60)}
              disabled={pulling}
              title="Test mode — only asks INVU for orders closed in the last 60 minutes. Cheap to repeat during live testing."
              className="rounded-lg border border-emerald-300/30 bg-emerald-300/10 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:border-emerald-300/50 hover:bg-emerald-300/20 disabled:opacity-50"
            >
              {pulling ? "Pulling…" : "Pull last hour"}
            </button>
            <button
              onClick={() => runPull(undefined)}
              disabled={pulling}
              title="Full pull — uses the saved checkpoint, falls back to 7 days. Use when reconciling, not for testing."
              className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-medium text-amber-200 transition hover:border-amber-300/50 hover:bg-amber-300/20 disabled:opacity-50"
            >
              {pulling ? "Pulling…" : "Pull last 7 days"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Match counts */}
        {overview && (
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Closed checks" value={String(overview.totals.total)} />
            <StatCard label="Auto-matched" value={String(overview.totals.matchedAuto)} tint="emerald" />
            <StatCard label="Manual-matched" value={String(overview.totals.matchedManual)} tint="sky" />
            <StatCard label="Unmatched" value={String(overview.totals.unmatched)} tint="amber" />
          </div>
        )}

        {/* Revenue reconciliation — every line maps 1:1 to an INVU dashboard line */}
        {overview && (
          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 backdrop-blur">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.2em] text-amber-300/70">
                Revenue reconciliation · matches INVU dashboard
              </div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                Window: {fmtDateTime(overview.windowStart)} → {fmtDateTime(overview.windowEnd)}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
              <ReconCard label="Total invoiced" hint="INVU: TOTAL INVOICED" value={fmtMoney(overview.totals.grossCents)} />
              <ReconCard label="Tax" hint="INVU: TAXES (excluded)" value={fmtMoney(overview.totals.taxCents)} />
              <ReconCard label="Tips" hint="INVU: TIPS (excluded)" value={fmtMoney(overview.totals.tipCents)} />
              <ReconCard label="Discounts" hint="INVU: DISCOUNT AMOUNT (already in gross)" value={fmtMoney(overview.totals.discountCents)} />
              <ReconCard
                label="Net · compensation base"
                hint="gross − tax · pre-tax, pre-tips"
                value={fmtMoney(overview.totals.netSubtotalCents)}
                tint="emerald"
                emphasis
              />
            </div>
            <div className="mt-3 text-[11px] text-white/50">
              Compensation rule: all operator payouts are computed against
              <span className="text-emerald-300"> Net subtotal (gross − tax)</span> — pre-tax,
              pre-tips. Discounts are already netted in INVU&apos;s gross; refunds are handled
              as payout clawbacks downstream.
              {overview.totals.refundCents > 0 && (
                <> Refunds in window: <span className="text-rose-300/80">{fmtMoney(overview.totals.refundCents)}</span>.</>
              )}
            </div>
          </div>
        )}

        {overview?.lastSyncRun && (
          <div className="mt-3 flex items-center gap-2 text-xs text-white/40">
            <span>
              Last sync · {overview.lastSyncRun.status} · {fmtDateTime(overview.lastSyncRun.finishedAt)} ·{" "}
              pulled {overview.lastSyncRun.ordersPulledCount}, matched {overview.lastSyncRun.matchedCount},
              unmatched {overview.lastSyncRun.unmatchedCount}
            </span>
            {(() => {
              const last = overview.lastSyncRun.finishedAt
                ? new Date(overview.lastSyncRun.finishedAt).getTime()
                : 0;
              const ageMin = Math.round((Date.now() - last) / 60000);
              if (ageMin > 30) {
                return (
                  <span className="rounded-md border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] text-amber-300">
                    Stale · {ageMin} min — auto-refreshing
                  </span>
                );
              }
              return (
                <span className="rounded-md border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] text-emerald-300">
                  Fresh · {ageMin} min ago
                </span>
              );
            })()}
          </div>
        )}

        {/* Tabs */}
        <div className="mt-6 flex gap-1 border-b border-white/10">
          <TabButton active={tab === "matched"} onClick={() => setTab("matched")}>
            Matched · {matchedRows.length}
          </TabButton>
          <TabButton active={tab === "unmatched"} onClick={() => setTab("unmatched")}>
            Unmatched · {unmatchedRows.length}
          </TabButton>
        </div>

        {/* Content */}
        <div className="mt-4">
          {loading ? (
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-12 text-center text-white/40">
              Loading…
            </div>
          ) : tab === "matched" ? (
            <MatchedTable rows={matchedRows} />
          ) : (
            <UnmatchedTable rows={unmatchedRows} onMatchClick={openMatchPicker} />
          )}
        </div>
      </div>

      {/* Manual match modal */}
      {matchingSessionId && (
        <MatchPickerModal
          candidates={candidates}
          loading={candidateLoading}
          onConfirm={confirmMatch}
          onClose={() => { setMatchingSessionId(null); setCandidates([]); }}
        />
      )}
    </div>
  );
}

function ReconCard({
  label, hint, value, tint, emphasis,
}: { label: string; hint: string; value: string; tint?: "emerald"; emphasis?: boolean }) {
  const tints = {
    emerald: "border-emerald-400/30 bg-emerald-400/[0.07]",
  } as const;
  const cls = tint ? tints[tint] : emphasis ? "border-amber-300/30 bg-amber-300/[0.06]" : "border-white/10 bg-white/[0.03]";
  return (
    <div className={`rounded-lg border ${cls} p-3`} title={hint}>
      <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">{label}</div>
      <div className={`mt-1 ${emphasis ? "text-xl" : "text-base"} font-light`}>{value}</div>
      <div className="mt-0.5 text-[9px] uppercase tracking-[0.15em] text-white/30">{hint}</div>
    </div>
  );
}

function StatCard({
  label, value, tint,
}: { label: string; value: string; tint?: "emerald" | "sky" | "amber" }) {
  const tints = {
    emerald: "border-emerald-400/20 bg-emerald-400/[0.06]",
    sky: "border-sky-400/20 bg-sky-400/[0.06]",
    amber: "border-amber-400/20 bg-amber-400/[0.06]",
  } as const;
  const cls = tint ? tints[tint] : "border-white/10 bg-white/[0.03]";
  return (
    <div className={`rounded-xl border ${cls} p-4 backdrop-blur`}>
      <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">{label}</div>
      <div className="mt-1 text-2xl font-light">{value}</div>
    </div>
  );
}

function TabButton({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`relative px-4 py-3 text-sm transition ${
        active ? "text-white" : "text-white/40 hover:text-white/70"
      }`}
    >
      {children}
      {active && (
        <span className="absolute inset-x-3 -bottom-px h-px bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" />
      )}
    </button>
  );
}

function MatchedTable({ rows }: { rows: ClosedOrderRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-12 text-center text-white/40">
        No matched closed orders in the last 7 days.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur">
      <div className="grid grid-cols-12 gap-2 border-b border-white/10 bg-white/[0.03] px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-white/40">
        <div className="col-span-4">Closed check (INVU)</div>
        <div className="col-span-4">Reservation</div>
        <div className="col-span-4">Host / Referrer</div>
      </div>
      <div className="divide-y divide-white/5">
        {rows.map((row) => (
          <div key={row.tableSessionId} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm">
            {/* Closed check column */}
            <div className="col-span-4">
              <div className="font-mono text-xs text-white/40">
                #{row.publicOrderNumber ?? row.invuOrderId ?? "—"}
                {row.tableLabel && <span className="ml-2">· T{row.tableLabel}</span>}
              </div>
              <div className="mt-1 text-white/90">{fmtDateTime(row.closedAt)}</div>
              <div className="mt-0.5 text-xs text-white/50">
                {row.customerName ?? "Walk-in"} · party {row.partySize ?? "?"}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                <span className="text-white/80" title="Subtotal (net F&B revenue)">
                  {fmtMoney(row.subtotalCents)}
                </span>
                {row.taxCents > 0 && (
                  <span className="text-white/40" title="Tax (excluded from commission)">
                    +tax {fmtMoney(row.taxCents)}
                  </span>
                )}
                {row.tipCents > 0 && (
                  <span className="text-white/40" title="Tip — paid to staff, not in commission base">
                    +tip {fmtMoney(row.tipCents)}
                  </span>
                )}
                {row.discountCents > 0 && (
                  <span className="text-rose-300/60" title="Discount applied">
                    −disc {fmtMoney(row.discountCents)}
                  </span>
                )}
              </div>
            </div>

            {/* Reservation column */}
            <div className="col-span-4">
              {row.reservation ? (
                <>
                  <div className="font-mono text-xs text-white/40">
                    {row.reservation.confirmationCode}
                    {row.reservation.assignedTableLabel && (
                      <span className="ml-2">· T{row.reservation.assignedTableLabel}</span>
                    )}
                  </div>
                  <div className="mt-1 text-white/90">{row.reservation.contactName}</div>
                  <div className="mt-0.5 text-xs text-white/50">
                    {fmtDateTime(row.reservation.reservationDate)} · party {row.reservation.partySize}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <MatchBadge method={row.matchMethod} trust={row.trustScore} />
                  </div>
                </>
              ) : (
                <span className="text-white/30">—</span>
              )}
            </div>

            {/* Attribution column */}
            <div className="col-span-4">
              {row.attribution ? (
                <>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                    {row.attribution.earnerType === "RESTAURANT_HOST" ? "Restaurant host" : row.attribution.earnerSubtype ?? "Referrer"}
                  </div>
                  <div className="mt-0.5 text-white/90">{row.attribution.earnerName}</div>
                  <div className="mt-1 text-xs text-emerald-300/80">
                    Commissionable {fmtMoney(row.commissionableCents)}
                  </div>
                </>
              ) : (
                <div className="text-xs text-white/30">
                  No attribution on file — reservation came in direct.
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UnmatchedTable({
  rows, onMatchClick,
}: { rows: ClosedOrderRow[]; onMatchClick: (id: string) => void }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-12 text-center text-white/40">
        No unmatched closed orders. Every check in the window is linked to a reservation.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur">
      <div className="grid grid-cols-12 gap-2 border-b border-white/10 bg-white/[0.03] px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-white/40">
        <div className="col-span-3">Closed check</div>
        <div className="col-span-2">Table · party</div>
        <div className="col-span-2">Customer (INVU)</div>
        <div className="col-span-2">Subtotal · tax · tip</div>
        <div className="col-span-3 text-right">Action</div>
      </div>
      <div className="divide-y divide-white/5">
        {rows.map((row) => (
          <div key={row.tableSessionId} className="grid grid-cols-12 items-center gap-2 px-4 py-3 text-sm">
            <div className="col-span-3">
              <div className="font-mono text-xs text-white/40">
                #{row.publicOrderNumber ?? row.invuOrderId ?? "—"}
              </div>
              <div className="mt-1 text-white/90">{fmtDateTime(row.closedAt)}</div>
            </div>
            <div className="col-span-2 text-xs text-white/60">
              {row.tableLabel ? `T${row.tableLabel}` : "no table"} · {row.partySize ?? "?"}
            </div>
            <div className="col-span-2 text-sm text-white/80">
              {row.customerName ?? <span className="text-white/30">walk-in</span>}
            </div>
            <div className="col-span-2 text-xs">
              <div className="text-white/80" title="Commission base (net F&B)">
                {fmtMoney(row.subtotalCents)}
              </div>
              <div className="mt-0.5 text-[10px] text-white/40">
                {row.taxCents > 0 && <>tax {fmtMoney(row.taxCents)}</>}
                {row.taxCents > 0 && row.tipCents > 0 && " · "}
                {row.tipCents > 0 && <>tip {fmtMoney(row.tipCents)}</>}
              </div>
            </div>
            <div className="col-span-3 text-right">
              <button
                onClick={() => onMatchClick(row.tableSessionId)}
                className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-xs text-amber-200 transition hover:border-amber-300/50 hover:bg-amber-300/20"
              >
                Match to reservation…
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchBadge({ method, trust }: { method: MatchMethod; trust: number | null }) {
  if (method === "AUTO") {
    const score = trust ?? 0;
    return (
      <span className="rounded-md border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] text-emerald-300">
        Auto · {Math.round(score * 100)}%
      </span>
    );
  }
  if (method === "MANUAL") {
    return (
      <span className="rounded-md border border-sky-400/20 bg-sky-400/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] text-sky-300">
        Manual
      </span>
    );
  }
  return (
    <span className="rounded-md border border-amber-400/20 bg-amber-400/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] text-amber-300">
      Unmatched
    </span>
  );
}

function MatchPickerModal({
  candidates, loading, onConfirm, onClose,
}: {
  candidates: Candidate[];
  loading: boolean;
  onConfirm: (reservationId: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#12131a] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-light">Match to reservation</h2>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/80"
          >
            ✕
          </button>
        </div>
        <p className="mt-1 text-xs text-white/40">
          Showing reservations within ±4h of the closed check, ordered by proximity.
        </p>

        <div className="mt-4 max-h-[60vh] overflow-y-auto rounded-lg border border-white/5">
          {loading ? (
            <div className="p-6 text-center text-sm text-white/40">Loading…</div>
          ) : candidates.length === 0 ? (
            <div className="p-6 text-center text-sm text-white/40">
              No nearby reservations. Create one first or leave as unmatched.
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {candidates.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onConfirm(c.id)}
                  disabled={c.alreadyLinkedToOtherSession}
                  className="grid w-full grid-cols-12 items-center gap-2 px-4 py-3 text-left text-sm transition hover:bg-white/[0.03] disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <div className="col-span-4">
                    <div className="font-mono text-xs text-white/40">{c.confirmationCode}</div>
                    <div className="mt-0.5 text-white/90">{c.contactName}</div>
                  </div>
                  <div className="col-span-3 text-xs text-white/60">
                    {fmtDateTime(c.reservationDate)}
                  </div>
                  <div className="col-span-2 text-xs text-white/60">
                    {c.assignedTableLabel ? `T${c.assignedTableLabel}` : "—"} · {c.partySize}p
                  </div>
                  <div className="col-span-3 text-right text-[10px] uppercase tracking-[0.15em]">
                    {c.alreadyLinkedToOtherSession ? (
                      <span className="text-amber-300">already linked</span>
                    ) : (
                      <span className="text-emerald-300">Link →</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
