import { afterEach, describe, expect, it } from "vitest";
import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claimRefund, markRefundUnknown, reconcileRefund, reserveRefund } from "../../src/server/payments/refundCoordinator";

// Explicit opt-in for the isolated embedded PostgreSQL engine. No DATABASE_URL.
const runtime = process.env.REFUND_TEST_PGLITE_MODULE;
const suite = runtime ? describe : describe.skip;
let db: any;
afterEach(async () => { if (db) { await db.close(); db = undefined; } });
async function setup(disk = false) {
  const { PGlite } = await import(/* @vite-ignore */ runtime!);
  const path = disk ? await mkdtemp(join(tmpdir(), "oku-refund-test-")) : undefined;
  db = new PGlite(path);
  await db.exec(await readFile(new URL("../fixtures/refund-coordinator-proposal.sql", import.meta.url), "utf8"));
  await db.query('INSERT INTO "RefundSafetyAccount" VALUES ($1,$2,$3,$4)', ["capture-1",1000,"USD",true]);
  return { PGlite, path };
}
const req = (key = "one", amountCents = 600) => ({
  id: key, key, accountId: "capture-1", amountCents, currency: "USD", actorId: "test-admin", allocation: "ticket-a:600",
});
const evidence = (status: "PENDING" | "SETTLED" | "FAILED" = "SETTLED") => ({
  status, accountId: "capture-1", amountCents: 600, currency: "USD", providerRefundId: "refund-1", evidenceId: "trusted-lookup-1",
});

suite("refund persistence — isolated PostgreSQL, no gateway", () => {
  it("reserves cumulative amounts and rejects an over-refund", async () => {
    await setup(); await reserveRefund(db, req());
    await expect(reserveRefund(db, req("two",401))).rejects.toThrow("INSUFFICIENT_BALANCE");
    await expect(reserveRefund(db, req("two",400))).resolves.toMatchObject({ replay: false });
  });
  it("simultaneous callers cannot both consume the remaining balance in the embedded engine", async () => {
    await setup();
    const results = await Promise.allSettled([reserveRefund(db, req()), reserveRefund(db, req("two"))]);
    expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(x => x.status === "rejected")).toHaveLength(1);
    // PGlite serializes one connection. Multi-connection PostgreSQL testing remains required.
  });
  it("binds replay key to amount and entitlement allocation", async () => {
    await setup(); await reserveRefund(db, req());
    await expect(reserveRefund(db, req())).resolves.toMatchObject({ replay: true });
    await expect(reserveRefund(db, {...req(), allocation: "ticket-b:600"})).rejects.toThrow("KEY_CONFLICT");
    await expect(reserveRefund(db, req("one",500))).rejects.toThrow("KEY_CONFLICT");
  });
  it("claims once, persists unknown results through engine restart, and never resubmits", async () => {
    const { PGlite, path } = await setup(true);
    await reserveRefund(db, req());
    expect(await claimRefund(db,"one")).toBe(true);
    await markRefundUnknown(db,"one"); await db.close(); db = new PGlite(path);
    expect(await claimRefund(db,"one")).toBe(false);
    await expect(reserveRefund(db,req())).resolves.toMatchObject({ replay:true, operation:{state:"UNKNOWN"} });
    await expect(reserveRefund(db,req("two"))).rejects.toThrow("INSUFFICIENT_BALANCE");
  });
  it("requires verified history and matching currency", async () => {
    await setup();
    await expect(reserveRefund(db,{...req(),currency:"EUR"})).rejects.toThrow("CURRENCY_MISMATCH");
    await db.query('UPDATE "RefundSafetyAccount" SET "historyVerified"=false');
    await expect(reserveRefund(db,req())).rejects.toThrow("HISTORY_NOT_VERIFIED");
  });
  it("pending is not settled and does not free balance", async () => {
    await setup(); await reserveRefund(db,req()); await claimRefund(db,"one");
    expect((await reconcileRefund(db,"one",evidence("PENDING"))).state).toBe("SUBMITTED");
    await expect(reserveRefund(db,req("two"))).rejects.toThrow("INSUFFICIENT_BALANCE");
  });
  it("requires exact refund evidence, makes settlement replay-safe, and rejects contradictory outcomes", async () => {
    await setup(); await reserveRefund(db,req());
    await expect(reconcileRefund(db,"one",evidence())).rejects.toThrow("NOT_SUBMITTED");
    await claimRefund(db,"one"); await markRefundUnknown(db,"one");
    await expect(reconcileRefund(db,"one",{...evidence(),amountCents:500})).rejects.toThrow("EVIDENCE_MISMATCH");
    await expect(reconcileRefund(db,"one",{...evidence(),currency:"EUR"})).rejects.toThrow("EVIDENCE_MISMATCH");
    expect((await reconcileRefund(db,"one",evidence())).state).toBe("SETTLED");
    expect((await reconcileRefund(db,"one",evidence())).state).toBe("SETTLED");
    await expect(reconcileRefund(db,"one",evidence("FAILED"))).rejects.toThrow("TERMINAL_CONFLICT");
    await expect(reconcileRefund(db,"one",{...evidence(),providerRefundId:"other"})).rejects.toThrow("EVIDENCE_MISMATCH");
  });
  it("only definitive failure releases balance; the failed key still cannot resubmit", async () => {
    await setup(); await reserveRefund(db,req()); await claimRefund(db,"one");
    await reconcileRefund(db,"one",evidence("FAILED"));
    expect(await claimRefund(db,"one")).toBe(false);
    await expect(reserveRefund(db,req())).resolves.toMatchObject({replay:true,operation:{state:"FAILED"}});
    await expect(reserveRefund(db,req("two",1000))).resolves.toMatchObject({replay:false});
  });
});
