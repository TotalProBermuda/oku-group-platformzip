import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { gcsClient, objectExists, BUCKET_NAME } from "@/lib/object-storage";
import { encryptSecret, isEncryptionAvailable } from "@/server/security/encryption";
import {
  AUDIT_LOG_COLD_STORAGE_AFTER_MS,
  BENEFICIARY_DOC_PURGE_AFTER_MS,
  JOB_APPLICATION_ANONYMISE_AFTER_MS,
  USER_ANONYMISE_AFTER_MS,
  TOMBSTONE_EMAIL_DOMAIN,
  assertTableAllowed,
  getMaxPerRun,
  isBeneficiaryDocPurgeEnabled,
  isRetentionPaused,
  isTombstonedEmail,
  tombstoneEmailForUserId,
} from "./retentionPolicies";
import { randomUUID } from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Daily privacy retention sweeper.
//
// Each step is:
//   - **Idempotent**: re-runs cannot double-delete or double-anonymise (we
//     filter by "still in scope" predicates that go false after the first
//     run — tombstoned email pattern, deletedAt set, etc.).
//   - **Rate-limited**: every step is capped at `getMaxPerRun()` rows per
//     run so a single sweep cannot stampede the DB or the GCS API.
//   - **Audited**: every step writes a `retention.sweep.<step>` AuditLog
//     row with COUNTS ONLY — never user identity, never row contents.
//   - **Allow/deny aware**: only the four tables in
//     `RETENTION_ALLOW_LIST` are touched. Financial / audit-record tables
//     in `RETENTION_DENY_LIST` (Order, Payment, PayoutBatch, …) are
//     deliberately untouched — they live under the 7-year accounting
//     window, separate from this privacy worker.
// ─────────────────────────────────────────────────────────────────────────────

export type SweepStepResult = {
  step: string;
  scanned: number;
  affected: number;
  skipped: number;
  notes?: string;
};

export type SweepRunResult = {
  startedAt: string;
  finishedAt: string;
  paused: boolean;
  steps: SweepStepResult[];
};

const SYSTEM_ACTOR_ID = "system:retention-sweep";

async function writeAuditCount(
  action: string,
  metadata: Prisma.InputJsonValue,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: SYSTEM_ACTOR_ID,
        action,
        // Counts only — caller MUST NOT include identity or row contents.
        metadata,
      },
    });
  } catch (e) {
    // Audit failure must not abort the sweep, but is loud in logs.
    console.error("[retention] failed to write audit", action, e);
  }
}

// ─── Step 1: anonymise long-closed User accounts ──────────────────────────

/**
 * Anonymise PII fields on `User` rows whose account was closed
 * (`status=ARCHIVED`) more than 24 months ago. Financial rows that reference
 * the user keep referential integrity — only the linked PII is tombstoned.
 *
 * Idempotency: rows whose email already ends in `@${TOMBSTONE_EMAIL_DOMAIN}`
 * are excluded from the candidate set.
 */
export async function sweepUserAnonymisation(now = new Date()): Promise<SweepStepResult> {
  // Runtime guard: fails closed if a future refactor ever re-points this
  // step at a deny-listed table.
  assertTableAllowed("User");
  const cutoff = new Date(now.getTime() - USER_ANONYMISE_AFTER_MS);
  const limit = getMaxPerRun();

  const candidates = await prisma.user.findMany({
    where: {
      status: "ARCHIVED",
      updatedAt: { lt: cutoff },
      NOT: { email: { endsWith: `@${TOMBSTONE_EMAIL_DOMAIN}` } },
    },
    select: { id: true, email: true },
    take: limit,
    orderBy: { updatedAt: "asc" },
  });

  let affected = 0;
  let skipped = 0;
  for (const u of candidates) {
    if (isTombstonedEmail(u.email)) {
      skipped++;
      continue;
    }
    try {
      await prisma.user.update({
        where: { id: u.id },
        data: {
          email: tombstoneEmailForUserId(u.id),
          name: null,
          phone: null,
          imageUrl: null,
          internalNotes: null,
          tags: [],
          suspensionReason: null,
          lockReason: null,
        },
      });
      affected++;
    } catch (e) {
      skipped++;
      console.error("[retention] user anonymise failed for one row", e);
    }
  }

  const result: SweepStepResult = {
    step: "user_anonymisation",
    scanned: candidates.length,
    affected,
    skipped,
  };
  await writeAuditCount("retention.sweep.user_anonymised", {
    scanned: result.scanned,
    affected: result.affected,
    skipped: result.skipped,
    cutoff: cutoff.toISOString(),
    limit,
  });
  return result;
}

// ─── Step 2: purge BeneficiaryDocument files post-BANK_READY ──────────────

/**
 * Purge file bytes (and soft-delete the row) for `BeneficiaryDocument`
 * rows whose parent profile reached `BANK_READY` more than 90 days ago.
 *
 * Gated behind `RETENTION_DOC_PURGE_ENABLED` until Banesco confirms the
 * 90-day window in writing (verbatim caveat in `data-classification.md`).
 *
 * Idempotency: rows are filtered by `deletedAt: null` — once soft-deleted,
 * the next run cannot pick them up again.
 */
export async function sweepBeneficiaryDocumentPurge(
  now = new Date(),
): Promise<SweepStepResult> {
  assertTableAllowed("BeneficiaryDocument");
  if (!isBeneficiaryDocPurgeEnabled()) {
    const result: SweepStepResult = {
      step: "beneficiary_document_purge",
      scanned: 0,
      affected: 0,
      skipped: 0,
      notes: "feature_flag_off:RETENTION_DOC_PURGE_ENABLED",
    };
    await writeAuditCount("retention.sweep.beneficiary_doc_skipped", {
      reason: "feature_flag_off",
    });
    return result;
  }

  const cutoff = new Date(now.getTime() - BENEFICIARY_DOC_PURGE_AFTER_MS);
  const limit = getMaxPerRun();

  const candidates = await prisma.beneficiaryDocument.findMany({
    where: {
      deletedAt: null,
      profile: {
        bankReadinessStatus: "BANK_READY",
        bankReadyAt: { lt: cutoff },
      },
    },
    select: { id: true, objectPath: true },
    take: limit,
    orderBy: { uploadedAt: "asc" },
  });

  let affected = 0;
  let skipped = 0;
  for (const d of candidates) {
    // VERIFIED delete: we deliberately do NOT use the shared
    // `deleteObject()` helper because it swallows all errors. PII
    // bytes must actually leave object storage before we mark the row
    // purged, otherwise a transient GCS failure would leave file
    // bytes alive while `deletedAt` hides them from any retry path.
    try {
      const p = d.objectPath.startsWith("/") ? d.objectPath.slice(1) : d.objectPath;
      const idx = p.indexOf("/");
      if (idx === -1) {
        skipped++;
        console.error("[retention] beneficiary doc purge: malformed objectPath", d.id);
        continue;
      }
      const bucket = p.slice(0, idx);
      const object = p.slice(idx + 1);
      const file = gcsClient.bucket(bucket).file(object);

      // Delete; tolerate 404 (already gone) but propagate any other error.
      try {
        await file.delete();
      } catch (err: unknown) {
        const code = (err as { code?: number } | null)?.code;
        if (code !== 404) throw err;
      }

      // Verify the bytes are actually gone before marking the row purged.
      // If GCS reports the object still exists, leave the row untouched
      // so the next sweep retries it.
      const stillThere = await objectExists(d.objectPath);
      if (stillThere) {
        skipped++;
        console.error(
          "[retention] beneficiary doc purge: object still present after delete",
          d.id,
        );
        continue;
      }

      await prisma.beneficiaryDocument.update({
        where: { id: d.id },
        data: { deletedAt: now, scanMessage: "retention:purged" },
      });
      affected++;
    } catch (e) {
      skipped++;
      console.error("[retention] beneficiary doc purge failed for one row", e);
    }
  }

  const result: SweepStepResult = {
    step: "beneficiary_document_purge",
    scanned: candidates.length,
    affected,
    skipped,
  };
  await writeAuditCount("retention.sweep.beneficiary_doc_purged", {
    scanned: result.scanned,
    affected: result.affected,
    skipped: result.skipped,
    cutoff: cutoff.toISOString(),
    limit,
  });
  return result;
}

// ─── Step 3: anonymise JobApplication rows post-decision ───────────────────

/**
 * Anonymise PII fields on `JobApplication` rows whose stage reached a
 * terminal decision (HIRED / REJECTED) more than 12 months ago. We use
 * `updatedAt` as the proxy for "stage last changed" — sufficient given
 * stage transitions touch updatedAt.
 *
 * Idempotency: same tombstone-email predicate as User anonymisation.
 */
export async function sweepJobApplicationAnonymisation(
  now = new Date(),
): Promise<SweepStepResult> {
  assertTableAllowed("JobApplication");
  const cutoff = new Date(now.getTime() - JOB_APPLICATION_ANONYMISE_AFTER_MS);
  const limit = getMaxPerRun();

  const candidates = await prisma.jobApplication.findMany({
    where: {
      stage: { in: ["HIRED", "REJECTED"] },
      updatedAt: { lt: cutoff },
      NOT: { email: { endsWith: `@${TOMBSTONE_EMAIL_DOMAIN}` } },
    },
    select: { id: true },
    take: limit,
    orderBy: { updatedAt: "asc" },
  });

  let affected = 0;
  let skipped = 0;
  for (const a of candidates) {
    try {
      await prisma.jobApplication.update({
        where: { id: a.id },
        data: {
          name: "(anonymised)",
          email: `${a.id}@${TOMBSTONE_EMAIL_DOMAIN}`,
          phone: null,
          resumeUrl: null,
          notes: null,
        },
      });
      affected++;
    } catch (e) {
      skipped++;
      console.error("[retention] job application anonymise failed for one row", e);
    }
  }

  const result: SweepStepResult = {
    step: "job_application_anonymisation",
    scanned: candidates.length,
    affected,
    skipped,
  };
  await writeAuditCount("retention.sweep.job_application_anonymised", {
    scanned: result.scanned,
    affected: result.affected,
    skipped: result.skipped,
    cutoff: cutoff.toISOString(),
    limit,
  });
  return result;
}

// ─── Step 4: AuditLog cold-storage move (NEVER outright delete inside 7y) ─

/**
 * Move `AuditLog` rows older than 24 months to encrypted cold storage in
 * the private bucket. The rows are serialised to JSON, encrypted with
 * `APP_ENCRYPTION_KEY` (AES-256-GCM via `encryptSecret`), uploaded to
 * `private/audit-cold/<yyyy-mm>/<batchId>.json.enc`, and only then
 * deleted from the hot table. A sibling `.manifest.json` file (plaintext —
 * counts + id range only, no row contents) records what the batch holds
 * so the 7-year window can be retrieved later.
 *
 * Cold storage is required by the financial / audit-record exemption in
 * task-100: AuditLog rows MUST remain retrievable for 7 years; this step
 * never permanently deletes inside that window.
 */
export async function sweepAuditLogColdStorage(
  now = new Date(),
): Promise<SweepStepResult> {
  assertTableAllowed("AuditLog");
  const cutoff = new Date(now.getTime() - AUDIT_LOG_COLD_STORAGE_AFTER_MS);
  const limit = getMaxPerRun();

  // We never run this step without the encryption key — cold-storage
  // bytes must be encrypted at rest above the GCS layer.
  if (!isEncryptionAvailable()) {
    const result: SweepStepResult = {
      step: "audit_log_cold_storage",
      scanned: 0,
      affected: 0,
      skipped: 0,
      notes: "skipped:APP_ENCRYPTION_KEY_unset",
    };
    await writeAuditCount("retention.sweep.audit_log_skipped", {
      reason: "encryption_unavailable",
    });
    return result;
  }

  // Centralised bucket source — `BUCKET_NAME` is the single resolved
  // bucket exported by `@/lib/object-storage`, so a future config change
  // (env var rename, multi-bucket support, etc.) only has to be made in
  // one place.
  const bucketName = BUCKET_NAME;
  if (!bucketName) {
    const result: SweepStepResult = {
      step: "audit_log_cold_storage",
      scanned: 0,
      affected: 0,
      skipped: 0,
      notes: "skipped:bucket_unconfigured",
    };
    await writeAuditCount("retention.sweep.audit_log_skipped", {
      reason: "bucket_unconfigured",
    });
    return result;
  }

  const rows = await prisma.auditLog.findMany({
    where: {
      createdAt: { lt: cutoff },
      // No actor-based exclusions: every >24mo AuditLog row — including
      // our own past `retention.sweep.*` rows — must be moved to cold
      // storage so the 7-year retrievability window is honoured for the
      // full audit trail. There is no infinite loop because archived
      // rows are deleted from the hot table after upload, so subsequent
      // runs cannot re-pick them up.
    },
    take: limit,
    orderBy: { createdAt: "asc" },
  });

  if (rows.length === 0) {
    const result: SweepStepResult = {
      step: "audit_log_cold_storage",
      scanned: 0,
      affected: 0,
      skipped: 0,
    };
    await writeAuditCount("retention.sweep.audit_log_archived", {
      scanned: 0,
      affected: 0,
      skipped: 0,
      cutoff: cutoff.toISOString(),
      limit,
    });
    return result;
  }

  const batchId = randomUUID();
  const yyyymm = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const baseObject = `private/audit-cold/${yyyymm}/${batchId}`;
  const dataObject = `${baseObject}.json.enc`;
  const manifestObject = `${baseObject}.manifest.json`;

  // Serialise + encrypt the batch payload. Manifest is plaintext but
  // contains only counts + id range + cutoff — no row contents.
  const payloadJson = JSON.stringify({
    schema: "oku.audit-cold.v1",
    encryptedAt: now.toISOString(),
    rows,
  });

  let encrypted: string;
  try {
    encrypted = encryptSecret(payloadJson);
  } catch (e) {
    const result: SweepStepResult = {
      step: "audit_log_cold_storage",
      scanned: rows.length,
      affected: 0,
      skipped: rows.length,
      notes: "encrypt_failed",
    };
    await writeAuditCount("retention.sweep.audit_log_skipped", {
      reason: "encrypt_failed",
      scanned: rows.length,
    });
    console.error("[retention] failed to encrypt audit batch", e);
    return result;
  }

  const idsToDelete = rows.map((r) => r.id);
  const manifest = {
    schema: "oku.audit-cold.manifest.v1",
    batchId,
    yyyymm,
    rowCount: rows.length,
    firstId: idsToDelete[0],
    lastId: idsToDelete[idsToDelete.length - 1],
    firstCreatedAt: rows[0].createdAt.toISOString(),
    lastCreatedAt: rows[rows.length - 1].createdAt.toISOString(),
    cutoff: cutoff.toISOString(),
    dataObject: `/${bucketName}/${dataObject}`,
  };

  try {
    const file = gcsClient.bucket(bucketName).file(dataObject);
    await file.save(encrypted, { contentType: "application/octet-stream" });
    const mFile = gcsClient.bucket(bucketName).file(manifestObject);
    await mFile.save(JSON.stringify(manifest, null, 2), {
      contentType: "application/json",
    });
  } catch (e) {
    console.error("[retention] cold storage upload failed; not deleting hot rows", e);
    await writeAuditCount("retention.sweep.audit_log_skipped", {
      reason: "upload_failed",
      scanned: rows.length,
    });
    return {
      step: "audit_log_cold_storage",
      scanned: rows.length,
      affected: 0,
      skipped: rows.length,
      notes: "upload_failed",
    };
  }

  // Only after both uploads succeed do we remove from hot storage.
  const del = await prisma.auditLog.deleteMany({
    where: { id: { in: idsToDelete } },
  });

  const result: SweepStepResult = {
    step: "audit_log_cold_storage",
    scanned: rows.length,
    affected: del.count,
    skipped: rows.length - del.count,
  };
  await writeAuditCount("retention.sweep.audit_log_archived", {
    scanned: result.scanned,
    affected: result.affected,
    skipped: result.skipped,
    batchId,
    coldObject: `/${bucketName}/${dataObject}`,
    manifestObject: `/${bucketName}/${manifestObject}`,
    cutoff: cutoff.toISOString(),
    limit,
  });
  return result;
}

// ─── Orchestrator ──────────────────────────────────────────────────────────

export async function runRetentionSweep(now = new Date()): Promise<SweepRunResult> {
  const startedAt = now.toISOString();

  if (isRetentionPaused()) {
    await writeAuditCount("retention.sweep.skipped", { reason: "paused_by_env" });
    return {
      startedAt,
      finishedAt: new Date().toISOString(),
      paused: true,
      steps: [],
    };
  }

  await writeAuditCount("retention.sweep.started", { startedAt });

  const steps: SweepStepResult[] = [];
  // Each step is wrapped so a failure in one does not block the others.
  for (const step of [
    sweepUserAnonymisation,
    sweepBeneficiaryDocumentPurge,
    sweepJobApplicationAnonymisation,
    sweepAuditLogColdStorage,
  ]) {
    try {
      steps.push(await step(now));
    } catch (e) {
      console.error("[retention] step crashed:", step.name, e);
      steps.push({
        step: step.name,
        scanned: 0,
        affected: 0,
        skipped: 0,
        notes: "crashed",
      });
      await writeAuditCount("retention.sweep.step_crashed", { step: step.name });
    }
  }

  const finishedAt = new Date().toISOString();
  await writeAuditCount("retention.sweep.finished", {
    startedAt,
    finishedAt,
    steps: steps.map((s) => ({
      step: s.step,
      scanned: s.scanned,
      affected: s.affected,
      skipped: s.skipped,
    })),
  });
  return { startedAt, finishedAt, paused: false, steps };
}

// Cold-storage object naming convention — exported so an admin "list cold
// batches" view (future) can mirror it without re-deriving the path.
export const COLD_STORAGE_PREFIX = "private/audit-cold";
