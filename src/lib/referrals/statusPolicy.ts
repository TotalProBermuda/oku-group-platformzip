/**
 * Pure, dependency-free active/history split policy for referral surfaces
 * (Task #140). Lives OUTSIDE the server data source so BOTH the server source
 * (`src/server/referrals/myReferralsSource.ts`) and client surfaces (the
 * streetside host page) import ONE definition of "terminal" and "history".
 *
 * This module imports nothing server-only (no prisma), so it is safe to pull
 * into a client bundle. Surfaces MUST NOT redefine terminal statuses locally —
 * if a surface treats extra statuses as terminal, add a policy here and pass it
 * in. That keeps the active/history split governed and identical everywhere.
 */

export const PANAMA_TZ = "America/Panama";

/**
 * Base terminal reservation statuses — always history for EVERY surface,
 * regardless of date. A reservation in one of these is done.
 */
export const BASE_TERMINAL_RESERVATION_STATUSES: readonly string[] = [
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
];

/**
 * Surface policy — the ONLY sanctioned way a surface may treat extra statuses
 * as terminal.
 *  - DEFAULT: the canonical set (referrer / influencer / partner feeds).
 *  - STREETSIDE: the street host ALSO treats SEATED as terminal — once the
 *    guest is seated the handoff is complete and the row belongs in history.
 */
export type ReferralSurfacePolicy = "DEFAULT" | "STREETSIDE";

const EXTRA_TERMINAL_BY_POLICY: Record<ReferralSurfacePolicy, readonly string[]> = {
  DEFAULT: [],
  STREETSIDE: ["SEATED"],
};

/** Terminal reservation-status set for a given surface policy. */
export function terminalStatusesForSurface(
  policy: ReferralSurfacePolicy = "DEFAULT"
): ReadonlySet<string> {
  return new Set([
    ...BASE_TERMINAL_RESERVATION_STATUSES,
    ...EXTRA_TERMINAL_BY_POLICY[policy],
  ]);
}

/**
 * Panama-local day as a comparable integer (YYYYMMDD). Panama is UTC-5 with no
 * DST, but we go through Intl so the boundary stays correct if that ever
 * changes. Accepts a Date or an ISO string. Used only for the deterministic
 * active/history split.
 */
export function panamaDayNumber(d: Date | string): number {
  const date = typeof d === "string" ? new Date(d) : d;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PANAMA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return Number(`${y}${m}${day}`);
}

/**
 * A reservation belongs to history when it is in a terminal status for the
 * given surface policy OR its Panama-local service day is strictly before
 * today's Panama day. Everything else (tonight + any future date, non-terminal)
 * is active.
 */
export function isHistoryRow(
  reservationStatus: string,
  reservationDate: Date | string,
  now: Date | string,
  policy: ReferralSurfacePolicy = "DEFAULT"
): boolean {
  if (terminalStatusesForSurface(policy).has(reservationStatus)) return true;
  return panamaDayNumber(reservationDate) < panamaDayNumber(now);
}
