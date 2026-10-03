/** Pure rules for a future durable refund coordinator; NOT a concurrency lock.
 * Call inside a serialized database transaction over the complete payment history.
 * Do not wire to a gateway until operation persistence and reconciliation exist.
 */
export type RefundState = "RESERVED" | "SUBMITTED" | "UNKNOWN" | "SETTLED" | "FAILED";
export type RefundRequest = { key: string; amountCents: number; currency: string; fingerprint: string };
export type RefundOperation = RefundRequest & { state: RefundState };
export type RefundAdmission =
  | { kind: "NEW"; remainingCents: number }
  | { kind: "REPLAY"; operation: RefundOperation }
  | { kind: "REJECT"; reason: "INVALID_INPUT" | "INVALID_HISTORY" | "KEY_CONFLICT" | "INSUFFICIENT_BALANCE" };

const cents = (value: number) => Number.isSafeInteger(value) && value > 0;
const valid = (r: RefundRequest) => cents(r.amountCents) && r.key.trim().length > 0
  && r.fingerprint.trim().length > 0 && /^[A-Z]{3}$/.test(r.currency);
const states = new Set<RefundState>(["RESERVED", "SUBMITTED", "UNKNOWN", "SETTLED", "FAILED"]);

export function admitRefund(capturedCents: number, currency: string,
  history: readonly RefundOperation[], request: RefundRequest): RefundAdmission {
  if (!cents(capturedCents) || !valid(request) || request.currency !== currency) {
    return { kind: "REJECT", reason: "INVALID_INPUT" };
  }
  const keys = new Set<string>();
  let committed = 0;
  for (const op of history) {
    if (!valid(op) || op.currency !== currency || !states.has(op.state) || keys.has(op.key)) {
      return { kind: "REJECT", reason: "INVALID_HISTORY" };
    }
    keys.add(op.key);
    // Unknown, pending and settled amounts all consume available balance.
    // FAILED means authoritatively failed, never simply a timeout.
    if (op.state !== "FAILED") committed += op.amountCents;
    if (!Number.isSafeInteger(committed) || committed > capturedCents) {
      return { kind: "REJECT", reason: "INVALID_HISTORY" };
    }
  }
  const previous = history.find(op => op.key === request.key);
  if (previous) {
    if (previous.amountCents !== request.amountCents || previous.currency !== request.currency
      || previous.fingerprint !== request.fingerprint) return { kind: "REJECT", reason: "KEY_CONFLICT" };
    // Even failed replays are returned, not resubmitted. A new approved operation
    // requires a new key; unknown operations must be reconciled first.
    return { kind: "REPLAY", operation: previous };
  }
  const remainingCents = capturedCents - committed - request.amountCents;
  return remainingCents < 0 ? { kind: "REJECT", reason: "INSUFFICIENT_BALANCE" }
    : { kind: "NEW", remainingCents };
}
