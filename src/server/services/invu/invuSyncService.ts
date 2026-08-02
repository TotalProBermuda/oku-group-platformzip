import { prisma } from "@/lib/prisma";
import { reauthenticateInvu } from "./invuAuthService";
import { decrypt } from "./invuEncryptionService";
import * as invuClient from "@/lib/invu/client";
import { storeRawAndNormalize } from "./invuNormalizationService";
import { aggregateToTableSession } from "./invuAggregationService";
import { processCreditNote } from "@/lib/invu/creditNotes";
import { Prisma, InvuPayloadType, SyncRunStatus } from "@prisma/client";

// Master fan-out pattern — one job iterates all enabled branch mappings.

export async function runInvuSyncForAllEnabledVenues(): Promise<void> {
  // Per-venue scheduling (Task #44):
  // The master tick runs every 15 minutes. Each branch mapping carries its
  // own `syncIntervalMinutes` (default 15). A mapping is "due" when:
  //   - it has never synced successfully (lastSuccessfulSyncAt IS NULL), OR
  //   - now() >= lastSuccessfulSyncAt + syncIntervalMinutes
  //
  // This lets venues opt into longer cadences (e.g. 60 min for low-volume
  // outlets, 1440 min for development) without slowing the master tick or
  // requiring multiple BullMQ schedules.
  //
  // We add a 30-second slack to the comparison so a mapping configured at
  // exactly 15 minutes won't be skipped on a tick that arrives a few hundred
  // milliseconds early. Without the slack a 15/15 mapping fires once every
  // 30 minutes (every other tick) instead of every tick.
  const SLACK_MS = 30 * 1000;
  const now = new Date();
  const enabled = await prisma.integrationBranchMapping.findMany({
    where: { isSyncEnabled: true },
    select: {
      id: true,
      venueId: true,
      syncIntervalMinutes: true,
      lastSuccessfulSyncAt: true,
    },
  });

  if (enabled.length === 0) {
    console.log("[invuSync] No enabled branch mappings found.");
    return;
  }

  const due: { id: string; venueId: string; lastAt: Date | null; intervalMin: number }[] = [];
  const skipped: { id: string; nextAt: Date }[] = [];
  for (const m of enabled) {
    const interval = Math.max(1, m.syncIntervalMinutes ?? 15);
    if (!m.lastSuccessfulSyncAt) {
      due.push({ id: m.id, venueId: m.venueId, lastAt: null, intervalMin: interval });
      continue;
    }
    const nextAt = new Date(m.lastSuccessfulSyncAt.getTime() + interval * 60 * 1000);
    if (nextAt.getTime() - SLACK_MS <= now.getTime()) {
      due.push({ id: m.id, venueId: m.venueId, lastAt: m.lastSuccessfulSyncAt, intervalMin: interval });
    } else {
      skipped.push({ id: m.id, nextAt });
    }
  }

  console.log(
    `[invuSync] Fan-out tick: ${enabled.length} enabled, ${due.length} due, ${skipped.length} not yet due`
  );

  for (const m of due) {
    try {
      await runInvuSyncForVenue(m.venueId, m.id);
    } catch (err) {
      console.error(`[invuSync] Fatal error for mapping ${m.id}:`, err);
    }
  }

  console.log("[invuSync] Fan-out sync complete.");
}

export async function runInvuSyncForVenue(
  venueId: string,
  branchMappingId: string,
  existingSyncRunId?: string,
  /**
   * Optional override that forces the pull window to the last N minutes,
   * ignoring the saved checkpoint. Used by the admin "Pull last hour"
   * test button so live testing pulls a tiny window instead of paging
   * through the full 7-day default. The checkpoint is still advanced on
   * success, so subsequent automatic syncs continue from `now`.
   */
  windowMinutesOverride?: number
): Promise<void> {
  const mapping = await prisma.integrationBranchMapping.findUnique({
    where: { id: branchMappingId },
    include: { credential: true },
  });

  if (!mapping) throw new Error(`BranchMapping ${branchMappingId} not found`);
  if (mapping.venueId !== venueId) {
    throw new Error(`Venue mismatch: mapping ${branchMappingId} belongs to venue ${mapping.venueId}, not ${venueId}`);
  }

  const credential = mapping.credential;

  // Resolve checkpoint — fromDate = checkpointEnd of last successful run, or 7 days ago.
  // If `windowMinutesOverride` is supplied, that wins (used by manual test pulls).
  const lastRun = await prisma.integrationSyncRun.findFirst({
    where: {
      branchMappingId,
      status: { in: ["SUCCESS", "PARTIAL_FAILURE"] },
    },
    orderBy: { startedAt: "desc" },
    select: { checkpointEnd: true },
  });

  const toDate = new Date();
  const fromDate =
    windowMinutesOverride && windowMinutesOverride > 0
      ? new Date(toDate.getTime() - windowMinutesOverride * 60 * 1000)
      : lastRun?.checkpointEnd ?? new Date(toDate.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Reuse an existing STARTED run (created by manual trigger) or create a new one.
  // This prevents orphan STARTED rows when the manual trigger pre-creates the run record.
  let syncRunId: string;
  if (existingSyncRunId) {
    await prisma.integrationSyncRun.update({
      where: { id: existingSyncRunId },
      data: {
        checkpointStart: fromDate,
        checkpointEnd: toDate,
      },
    });
    syncRunId = existingSyncRunId;
  } else {
    const syncRun = await prisma.integrationSyncRun.create({
      data: {
        credentialId: credential.id,
        venueId,
        branchMappingId,
        scopeType: "ALL",
        status: "STARTED",
        checkpointStart: fromDate,
        checkpointEnd: toDate,
      },
    });
    syncRunId = syncRun.id;
  }

  let token: string;
  try {
    token = decrypt(
      credential.accessTokenEncrypted ?? credential.apiPasswordEncrypted
    );
  } catch (err) {
    await failRun(syncRunId, branchMappingId, `Failed to decrypt credentials: ${String(err)}`);
    return;
  }

  const scope = parseScope(mapping.syncScopeJson);
  let rawPulled = 0;
  let normalizedCount = 0;
  let ordersPulled = 0;
  let matchedCount = 0;
  let unmatchedCount = 0;
  let creditNotesProcessed = 0;
  let errorCount = 0;
  let terminalAuthFailure = false;

  async function processRecords(
    records: Record<string, unknown>[],
    payloadType: InvuPayloadType
  ): Promise<void> {
    for (const record of records) {
      try {
        rawPulled++;

        const { rawId, normalizedId, skipped } = await storeRawAndNormalize({
          syncRunId,
          venueId,
          branchMappingId,
          payloadType,
          payload: record,
        });

        if (skipped) continue;
        normalizedCount++;

        const normalized = await prisma.invuOrderNormalized.findUnique({
          where: { id: normalizedId },
        });

        if (!normalized) continue;

        // Credit notes: update existing sessions + create REVERSED allocations
        if (payloadType === InvuPayloadType.CREDIT_NOTE) {
          if (normalized.invuOrderId && normalized.refundCents > 0) {
            const { updated } = await processCreditNote({
              invuOrderId: normalized.invuOrderId,
              venueId,
              creditAmountCents: normalized.refundCents,
              syncRunId,
            });
            if (updated) {
              creditNotesProcessed++;
            } else {
              // No existing session — fall through to normal aggregation so it gets created
              await aggregateAndCount(normalized, venueId, syncRunId);
            }
          } else {
            await aggregateAndCount(normalized, venueId, syncRunId);
          }
          ordersPulled++;
          continue;
        }

        await aggregateAndCount(normalized, venueId, syncRunId);
        ordersPulled++;
      } catch (err) {
        errorCount++;
        await prisma.integrationSyncError.create({
          data: {
            syncRunId,
            errorCode: "RECORD_PROCESSING_ERROR",
            errorMessage: String(err),
            errorContextJson: { record: JSON.stringify(record).slice(0, 500) },
          },
        });
      }
    }
  }

  async function aggregateAndCount(
    normalized: Awaited<ReturnType<typeof prisma.invuOrderNormalized.findUniqueOrThrow>>,
    venueId: string,
    syncRunId: string
  ): Promise<void> {
    const { tableSessionId } = await aggregateToTableSession({
      normalized,
      venueId,
      syncRunId,
    });

    const session = await prisma.tableSession.findUnique({
      where: { id: tableSessionId },
      select: { matchMethod: true },
    });

    if (session?.matchMethod === "UNMATCHED") {
      unmatchedCount++;
    } else {
      matchedCount++;
    }
  }

  // Execute enabled scope methods with 401-retry logic
  const execute = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err: unknown) {
      const e = err as { message?: string; status?: number };
      if (e?.message?.includes("401") || e?.status === 401) {
        try {
          await reauthenticateInvu(credential.id);
          const refreshed = await prisma.invuIntegrationCredential.findUnique({
            where: { id: credential.id },
            select: { accessTokenEncrypted: true, apiPasswordEncrypted: true },
          });
          if (refreshed) {
            token = decrypt(refreshed.accessTokenEncrypted ?? refreshed.apiPasswordEncrypted);
          }
          return await fn();
        } catch (reauthErr) {
          await prisma.invuIntegrationCredential.update({
            where: { id: credential.id },
            data: { status: "NEEDS_REAUTH" },
          });
          terminalAuthFailure = true;
          throw new Error(`Re-auth failed: ${reauthErr}`);
        }
      }
      throw err;
    }
  };

  // Execute each scope in its own try/catch so a failure in one endpoint does not
  // prevent remaining enabled scopes from running.
  const runScope = async (
    scopeName: string,
    fn: () => Promise<Record<string, unknown>[]>,
    payloadType: InvuPayloadType
  ) => {
    try {
      const records = await execute(fn);
      await processRecords(records, payloadType);
    } catch (err) {
      // On terminal reauth failure, stop processing remaining scopes immediately.
      if (terminalAuthFailure) throw err;
      errorCount++;
      await prisma.integrationSyncError.create({
        data: {
          syncRunId,
          errorCode: "SCOPE_ENDPOINT_ERROR",
          errorMessage: String(err),
          errorContextJson: { reason: "scope_endpoint_failure", scope: scopeName } as Prisma.InputJsonValue,
        },
      }).catch(() => {});
      console.error(`[invuSync] Scope endpoint error (${scopeName}) for run ${syncRunId}:`, err);
    }
  };

  try {
    if (scope.closedOrders) {
      await runScope("closedOrders", () =>
        invuClient.getClosedOrders(token, mapping.invuBranchId, fromDate, toDate), InvuPayloadType.CLOSED_ORDER);
    }
    if (scope.invoiceTotals) {
      await runScope("invoiceTotals", () =>
        invuClient.getInvoiceTotals(token, mapping.invuBranchId, fromDate, toDate), InvuPayloadType.INVOICE_TOTAL);
    }
    if (scope.payments) {
      await runScope("payments", () =>
        invuClient.getPayments(token, mapping.invuBranchId, fromDate, toDate), InvuPayloadType.PAYMENT_SUMMARY);
    }
    if (scope.creditNotes) {
      await runScope("creditNotes", () =>
        invuClient.getCreditNotes(token, mapping.invuBranchId, fromDate, toDate), InvuPayloadType.CREDIT_NOTE);
    }
    if (scope.orderTotals) {
      await runScope("orderTotals", () =>
        invuClient.getOrderTotals(token, mapping.invuBranchId, fromDate, toDate), InvuPayloadType.ORDER_TOTAL);
    }
  } catch (err) {
    // Only reached on terminal re-auth failure — halt all scopes and force FAILED.
    console.error(`[invuSync] Terminal auth failure for run ${syncRunId}:`, err);
  }

  // terminalAuthFailure always forces FAILED regardless of records processed (per spec).
  const finalStatus: SyncRunStatus = terminalAuthFailure
    ? "FAILED"
    : errorCount > 0
      ? (ordersPulled > 0 ? "PARTIAL_FAILURE" : "FAILED")
      : "SUCCESS";

  await prisma.integrationSyncRun.update({
    where: { id: syncRunId },
    data: {
      status: finalStatus,
      ordersPulledCount: ordersPulled,
      matchedCount,
      unmatchedCount,
      errorCount,
      finishedAt: new Date(),
      syncedAt: new Date(),
      summaryJson: {
        rawPulled,
        normalizedCount,
        ordersPulled,
        matchedCount,
        unmatchedCount,
        creditNotesProcessed,
        errorCount,
      },
    },
  });

  if (finalStatus !== "FAILED") {
    await prisma.integrationBranchMapping.update({
      where: { id: branchMappingId },
      data: { lastSuccessfulSyncAt: new Date() },
    });
  } else {
    await prisma.integrationBranchMapping.update({
      where: { id: branchMappingId },
      data: { lastFailedSyncAt: new Date() },
    });
  }

  console.log(
    `[invuSync] Run ${syncRunId} complete: status=${finalStatus} raw=${rawPulled} normalized=${normalizedCount} pulled=${ordersPulled} matched=${matchedCount} unmatched=${unmatchedCount} creditNotes=${creditNotesProcessed} errors=${errorCount}`
  );
}

async function failRun(syncRunId: string, branchMappingId: string, reason: string): Promise<void> {
  await prisma.integrationSyncRun.update({
    where: { id: syncRunId },
    data: { status: "FAILED", finishedAt: new Date() },
  });
  await prisma.integrationBranchMapping.update({
    where: { id: branchMappingId },
    data: { lastFailedSyncAt: new Date() },
  }).catch(() => {});
  console.error(`[invuSync] Run ${syncRunId} failed: ${reason}`);
}

function parseScope(scopeJson: unknown): Record<string, boolean> {
  if (typeof scopeJson === "string") {
    try {
      return JSON.parse(scopeJson);
    } catch {
      return {};
    }
  }
  if (typeof scopeJson === "object" && scopeJson !== null) {
    return scopeJson as Record<string, boolean>;
  }
  return {};
}
