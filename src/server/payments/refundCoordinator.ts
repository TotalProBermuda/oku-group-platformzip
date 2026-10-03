/** Review-gated persistence layer. No production route imports this module.
 * Transactions MUST use PostgreSQL READ COMMITTED (or retry serialization errors).
 * Gateway calls are deliberately outside this module and outside transactions.
 */
import { createHash } from "node:crypto";

export interface RefundSql {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
export interface RefundDatabase extends RefundSql {
  transaction<T>(work: (tx: RefundSql) => Promise<T>): Promise<T>;
}
type State = "RESERVED" | "SUBMITTED" | "UNKNOWN" | "SETTLED" | "FAILED";
export type StoredRefund = {
  id: string; accountId: string; requestKey: string; amountCents: number;
  currency: string; allocationHash: string; state: State; providerRefundId: string | null;
};
export type ReserveRefund = {
  id: string; accountId: string; key: string; amountCents: number;
  currency: string; actorId: string; allocation: string;
};
const positive = (n: number) => Number.isSafeInteger(n) && n > 0 && n <= 2147483647;
const text = (s: string) => typeof s === "string" && s.trim().length > 0 && s.length <= 500;

export async function reserveRefund(db: RefundDatabase, input: ReserveRefund) {
  if (![input.id, input.accountId, input.key, input.actorId, input.allocation].every(text)
    || !positive(input.amountCents) || !/^[A-Z]{3}$/.test(input.currency)) throw new Error("INVALID_INPUT");
  const hash = createHash("sha256").update(input.allocation).digest("hex");
  return db.transaction(async tx => {
    // All requests for the same original capture serialize here, across workers.
    const account = (await tx.query<{ currency: string; capturedCents: number; historyVerified: boolean }>(
      'SELECT * FROM "RefundSafetyAccount" WHERE id=$1 FOR UPDATE', [input.accountId])).rows[0];
    if (!account?.historyVerified) throw new Error("HISTORY_NOT_VERIFIED");
    if (account.currency !== input.currency) throw new Error("CURRENCY_MISMATCH");
    const previous = (await tx.query<StoredRefund>(
      'SELECT * FROM "RefundSafetyOperation" WHERE "accountId"=$1 AND "requestKey"=$2',
      [input.accountId, input.key])).rows[0];
    if (previous) {
      if (previous.amountCents !== input.amountCents || previous.allocationHash !== hash)
        throw new Error("KEY_CONFLICT");
      return { replay: true, operation: previous };
    }
    const { used } = (await tx.query<{ used: string }>(
      `SELECT COALESCE(SUM("amountCents"),0)::text AS used FROM "RefundSafetyOperation"
       WHERE "accountId"=$1 AND state <> 'FAILED'`, [input.accountId])).rows[0];
    if (Number(used) + input.amountCents > account.capturedCents) throw new Error("INSUFFICIENT_BALANCE");
    const operation = (await tx.query<StoredRefund>(
      `INSERT INTO "RefundSafetyOperation"
       (id,"accountId","requestKey","amountCents",currency,"allocationHash","actorId")
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [input.id,input.accountId,input.key,input.amountCents,input.currency,hash,input.actorId])).rows[0];
    return { replay: false, operation };
  });
}

/** Commit this claim BEFORE attempting submission. A lost response or crashed
 * worker must reconcile, never reset to RESERVED and blindly submit again. */
export async function claimRefund(db: RefundSql, id: string): Promise<boolean> {
  const result = await db.query(
    `UPDATE "RefundSafetyOperation" SET state='SUBMITTED',"updatedAt"=CURRENT_TIMESTAMP
     WHERE id=$1 AND state='RESERVED' RETURNING id`, [id]);
  return result.rows.length === 1;
}

export async function markRefundUnknown(db: RefundSql, id: string): Promise<void> {
  await db.query(`UPDATE "RefundSafetyOperation" SET state='UNKNOWN',"updatedAt"=CURRENT_TIMESTAMP
    WHERE id=$1 AND state='SUBMITTED'`, [id]);
}

/** Only a trusted provider adapter may supply this evidence, NEVER request JSON.
 * PENDING/NOT_FOUND/timeouts do not release balance. FAILED must be authoritative.
 * Provider transaction lookup, authentication and evidence retention are integration gates.
 */
export async function reconcileRefund(db: RefundDatabase, id: string, evidence: {
  accountId: string; amountCents: number; currency: string; providerRefundId: string;
  status: "PENDING" | "SETTLED" | "FAILED"; evidenceId: string;
}): Promise<StoredRefund> {
  if (!text(evidence.providerRefundId) || !text(evidence.evidenceId)
    || !positive(evidence.amountCents) || !["PENDING","SETTLED","FAILED"].includes(evidence.status))
    throw new Error("INVALID_EVIDENCE");
  return db.transaction(async tx => {
    const op = (await tx.query<StoredRefund>(
      'SELECT * FROM "RefundSafetyOperation" WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!op || op.accountId !== evidence.accountId || op.amountCents !== evidence.amountCents
      || op.currency !== evidence.currency || (op.providerRefundId && op.providerRefundId !== evidence.providerRefundId))
      throw new Error("EVIDENCE_MISMATCH");
    if (op.state === "RESERVED") throw new Error("NOT_SUBMITTED");
    if (op.state === "SETTLED" || op.state === "FAILED") {
      if (op.state !== evidence.status) throw new Error("TERMINAL_CONFLICT");
      return op;
    }
    const state = evidence.status === "PENDING" ? "SUBMITTED" : evidence.status;
    return (await tx.query<StoredRefund>(
      `UPDATE "RefundSafetyOperation" SET state=$2,"providerRefundId"=$3,"evidenceId"=$4,
       "updatedAt"=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *`,
      [id,state,evidence.providerRefundId,evidence.evidenceId])).rows[0];
  });
}
