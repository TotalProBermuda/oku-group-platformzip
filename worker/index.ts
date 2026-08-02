import { Worker } from "bullmq";
import { prisma } from "../src/lib/prisma";
import { redisConnection, invuSyncQueue, invuTokenRotationQueue, retentionSweepQueue, auditAnomalyScanQueue, launchReadinessAlertQueue, attributionAnchorQueue, capacityExpirySweepQueue } from "../src/server/queue/queue";
import { handleInvuSyncJob } from "./jobs/invu-sync";
import { handleInvuTokenRotationJob } from "./jobs/invu-token-rotation";
import { handleRetentionSweepJob } from "./jobs/retention-sweep";
import { handleAuditAnomalyScanJob } from "./jobs/audit-anomaly-scan";
import { handleLaunchReadinessAlertJob } from "./jobs/launch-readiness-alert";
import { handleAttributionAnchorRetryJob } from "./jobs/attribution-anchor-retry";
import { handleCapacityExpirySweepJob } from "./jobs/capacity-expiry-sweep";

if (!process.env.REDIS_URL) {
  console.warn("REDIS_URL not set. Worker is idle (jobs run inline via safeEnqueue fallback).");
  setInterval(() => {}, 60_000);
} else {
  startWorkers();
}

function startWorkers() {
  // Type-narrow the queue references for the rest of this function. We are
  // already inside `if (process.env.REDIS_URL)` above, so these are non-null
  // here, but TypeScript doesn't track env-based narrowing across imports.
  if (!invuSyncQueue || !invuTokenRotationQueue || !retentionSweepQueue || !auditAnomalyScanQueue || !launchReadinessAlertQueue || !attributionAnchorQueue || !capacityExpirySweepQueue) {
    throw new Error("Queue references missing despite REDIS_URL being set");
  }

async function getResendClient() {
  const { Resend } = await import("resend");
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (hostname && xReplitToken) {
    try {
      const data = await fetch(
        `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=resend`,
        { headers: { Accept: "application/json", "X-Replit-Token": xReplitToken } }
      ).then((r) => r.json());
      const settings = data.items?.[0]?.settings;
      if (settings?.api_key) {
        return { client: new Resend(settings.api_key), fromEmail: settings.from_email ?? "events@oku.group" };
      }
    } catch {}
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return { client: new Resend(apiKey), fromEmail: process.env.RESEND_FROM_EMAIL ?? "events@oku.group" };
}

const worker = new Worker(
  "commerce",
  async (job) => {
    switch (job.name) {
      case "send_order_email": {
        const { orderId } = job.data as any;
        console.log("Sending order confirmation email for order", orderId);

        const order = await prisma.order.findUnique({
          where: { id: orderId },
          include: {
            user: { select: { name: true, email: true } },
            series: { select: { title: true, startsAt: true } },
            tickets: { select: { code: true } },
          },
        });

        if (!order || !order.user?.email) {
          console.log("Order or user email not found, skipping email.");
          return true;
        }

        const resend = await getResendClient();
        if (!resend) {
          console.log("Resend not configured, logging only.");
          await prisma.eventLog.create({ data: { type: "PAYMENT_SUCCEEDED", entityId: orderId } as any });
          return true;
        }

        const ticketCodes = order.tickets.map((t) => t.code).join(", ");
        const html = `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
            <div style="background:#1a1614;padding:24px;text-align:center">
              <span style="color:#c41e3a;font-size:24px;font-weight:700;font-family:Georgia,serif">OKÜ</span>
              <span style="color:#9ca3af;font-size:11px;letter-spacing:0.15em;margin-left:8px">HOSPITALITY GROUP</span>
            </div>
            <div style="padding:36px">
              <h2 style="color:#1a1614;font-family:Georgia,serif">Your booking is confirmed</h2>
              <p style="color:#4b4540">Hi ${order.user.name ?? "Guest"},</p>
              <p style="color:#4b4540">Thank you for your purchase. Your tickets for <strong>${order.series?.title ?? "the event"}</strong> are ready.</p>
              <div style="background:#f9f7f4;border-radius:8px;padding:20px;margin:24px 0">
                <p style="margin:0 0 8px;color:#7c7168;font-size:12px;text-transform:uppercase;letter-spacing:0.1em">Order Reference</p>
                <p style="margin:0;color:#1a1614;font-weight:600;font-family:monospace">${order.id.slice(-8).toUpperCase()}</p>
                ${ticketCodes ? `
                <p style="margin:16px 0 8px;color:#7c7168;font-size:12px;text-transform:uppercase;letter-spacing:0.1em">Ticket Code(s)</p>
                <p style="margin:0;color:#1a1614;font-weight:600;font-family:monospace">${ticketCodes}</p>` : ""}
                <p style="margin:16px 0 8px;color:#7c7168;font-size:12px;text-transform:uppercase;letter-spacing:0.1em">Total Paid</p>
                <p style="margin:0;color:#1a1614;font-weight:600">$${(order.totalCents / 100).toFixed(2)}</p>
              </div>
              <p style="color:#9ca3af;font-size:12px">Present your ticket code at the door. See you soon.</p>
            </div>
          </div>`;

        await resend.client.emails.send({
          from: resend.fromEmail,
          to: order.user.email,
          subject: `Booking confirmed — ${order.series?.title ?? "OKÜ Event"}`,
          html,
        });

        await prisma.eventLog.create({ data: { type: "PAYMENT_SUCCEEDED", entityId: orderId } as any });
        console.log("Order confirmation email sent to", order.user.email);
        return true;
      }

      case "sync_monday_lead": {
        console.log("Sync to Monday (stub)", job.data);
        return true;
      }

      case "post_payment_event": {
        console.log("Post analytics event (stub)", job.data);
        return true;
      }

      default:
        console.log("Unknown job", job.name);
        return false;
    }
  },
  redisConnection
);

worker.on("completed", (job) => console.log("Job completed", job.id, job.name));
worker.on("failed", (job, err) => console.error("Job failed", job?.id, job?.name, err));

const translationWorker = new Worker(
  "translation",
  async (job) => {
    switch (job.name) {
      case "translate_field": {
        const { entityType, entityId, fieldName, sourceLocale, sourceText, targetLocale } = job.data as {
          entityType: string;
          entityId: string;
          fieldName: string;
          sourceLocale: string;
          sourceText: string;
          targetLocale: string;
        };

        console.log(`Translating ${entityType}#${entityId}.${fieldName} → ${targetLocale}`);

        await prisma.contentTranslation.upsert({
          where: {
            entityType_entityId_fieldName_targetLocale: {
              entityType, entityId, fieldName, targetLocale,
            },
          },
          create: {
            entityType, entityId, fieldName,
            sourceLocale, targetLocale, sourceText,
            sourceTextHash: sourceText.slice(0, 16),
            translatedText: "",
            status: "PENDING",
            provider: "pending",
          },
          update: { status: "PENDING" },
        });

        console.log(`Translation job queued for ${entityType}.${fieldName} → ${targetLocale}. Connect a translation provider to process.`);
        return true;
      }

      case "translate_entity": {
        const { entityType, entityId, fields, sourceLocale } = job.data as {
          entityType: string;
          entityId: string;
          fields: Record<string, string>;
          sourceLocale: string;
        };
        const targetLocales = ["es", "pt"].filter((l) => l !== sourceLocale);
        for (const [fieldName, sourceText] of Object.entries(fields)) {
          for (const targetLocale of targetLocales) {
            await prisma.contentTranslation.upsert({
              where: {
                entityType_entityId_fieldName_targetLocale: {
                  entityType, entityId, fieldName, targetLocale,
                },
              },
              create: {
                entityType, entityId, fieldName,
                sourceLocale, targetLocale, sourceText,
                sourceTextHash: sourceText.slice(0, 16),
                translatedText: "",
                status: "PENDING",
                provider: "pending",
              },
              update: { status: "PENDING" },
            });
          }
        }
        console.log(`Entity translation jobs created for ${entityType}#${entityId}`);
        return true;
      }

      default:
        console.log("Unknown translation job", job.name);
        return false;
    }
  },
  redisConnection
);

translationWorker.on("completed", (job) => console.log("Translation job completed", job.id, job.name));
translationWorker.on("failed", (job, err) => console.error("Translation job failed", job?.id, err.message));

const invuWorker = new Worker("invu-sync", handleInvuSyncJob, redisConnection);
invuWorker.on("completed", (job) => console.log("INVU sync job completed", job.id, job.name));
invuWorker.on("failed", (job, err) => console.error("INVU sync job failed", job?.id, err.message));

// Register repeatable master sync job when Redis is available
invuSyncQueue.add(
  "invu-sync-master",
  {},
  {
    repeat: { every: 15 * 60 * 1000 },
    jobId: "invu-sync-master-repeatable",
  }
).catch((err) => console.warn("[invu-sync] Failed to register repeatable job:", err));

// INVU access-token rotation worker (Bucket A1). Daily cadence is enough —
// tokens are valid for >14 days and the job is idempotent at the
// per-credential level (it skips anything still inside the rotation window).
const invuTokenRotationWorker = new Worker(
  "invu-token-rotation",
  handleInvuTokenRotationJob,
  redisConnection
);
invuTokenRotationWorker.on("completed", (job, result) =>
  console.log("INVU token rotation completed", job.id, job.name, result)
);
invuTokenRotationWorker.on("failed", (job, err) =>
  console.error("INVU token rotation failed", job?.id, err.message)
);

invuTokenRotationQueue.add(
  "invu-token-rotation-daily",
  {},
  {
    repeat: { every: 24 * 60 * 60 * 1000 },
    jobId: "invu-token-rotation-daily-repeatable",
  }
).catch((err) => console.warn("[invu-token-rotation] Failed to register repeatable job:", err));

// Daily privacy retention sweep — anonymises long-closed users, purges
// post-BANK_READY beneficiary documents (gated by RETENTION_DOC_PURGE_ENABLED),
// anonymises post-decision job applications, and moves >24mo audit rows to
// encrypted cold storage. Operationally pause via RETENTION_SWEEP_PAUSED=true.
const retentionWorker = new Worker(
  "retention-sweep",
  handleRetentionSweepJob,
  redisConnection,
);
retentionWorker.on("completed", (job, result) =>
  console.log("Retention sweep completed", job.id, job.name, result),
);
retentionWorker.on("failed", (job, err) =>
  console.error("Retention sweep failed", job?.id, err.message),
);

retentionSweepQueue.add(
  "retention-sweep-daily",
  {},
  {
    repeat: { every: 24 * 60 * 60 * 1000 },
    jobId: "retention-sweep-daily-repeatable",
  },
).catch((err) => console.warn("[retention-sweep] Failed to register repeatable job:", err));

// Audit-log anomaly scan — every 15 minutes. Detects the patterns
// documented in docs/privacy/incident-response/RUNBOOK.md §1.2 (gateway
// test-failure clusters, active-gateway escalation, bulk beneficiary
// REJECTED/ON_HOLD, large ticket exports, bank-field search leaks,
// admin-access denial clusters) and pages via captureMessage.
const auditAnomalyWorker = new Worker(
  "audit-anomaly-scan",
  handleAuditAnomalyScanJob,
  redisConnection,
);
auditAnomalyWorker.on("completed", (job, result) =>
  console.log("Audit anomaly scan completed", job.id, job.name, result),
);
auditAnomalyWorker.on("failed", (job, err) =>
  console.error("Audit anomaly scan failed", job?.id, err.message),
);

auditAnomalyScanQueue.add(
  "audit-anomaly-scan-15m",
  {},
  {
    repeat: { every: 15 * 60 * 1000 },
    jobId: "audit-anomaly-scan-15m-repeatable",
  },
).catch((err) => console.warn("[audit-anomaly] Failed to register repeatable job:", err));

// Launch-readiness verdict-transition alerts — every 15 minutes. Emails
// SUPERADMIN users via Resend on GO → NO_GO and a single recovery email
// on NO_GO → GO. State is tracked via `launch.readiness.alert.{sent,resolved}`
// audit rows so the alert does not spam on every interval.
const launchReadinessAlertWorker = new Worker(
  "launch-readiness-alert",
  handleLaunchReadinessAlertJob,
  redisConnection,
);
launchReadinessAlertWorker.on("completed", (job, result) =>
  console.log("Launch-readiness alert completed", job.id, job.name, result),
);
launchReadinessAlertWorker.on("failed", (job, err) =>
  console.error("Launch-readiness alert failed", job?.id, err.message),
);

launchReadinessAlertQueue.add(
  "launch-readiness-alert-15m",
  {},
  {
    repeat: { every: 15 * 60 * 1000 },
    jobId: "launch-readiness-alert-15m-repeatable",
  },
).catch((err) => console.warn("[launch-readiness-alert] Failed to register repeatable job:", err));

// Attribution anchor retry worker — processes PENDING_ATTRIBUTION sessions
// enqueued by the reservations API when the attribution write fails after a
// referrer context was resolved. Escalates to FAILED_REVIEW after MAX_RETRIES.
const attributionAnchorWorker = new Worker(
  "attribution-anchor",
  handleAttributionAnchorRetryJob,
  redisConnection,
);
attributionAnchorWorker.on("completed", (job, result) =>
  console.log("Attribution anchor retry completed", job.id, job.name, result),
);
attributionAnchorWorker.on("failed", (job, err) =>
  console.error("Attribution anchor retry failed", job?.id, err.message),
);

// Periodic sweep: pick up any PENDING_ATTRIBUTION sessions that were missed
// by the at-booking enqueue (e.g. Redis was unavailable). Runs every 10 min.
attributionAnchorQueue.add(
  "attribution-anchor-sweep",
  {},
  {
    repeat: { every: 10 * 60 * 1000 },
    jobId: "attribution-anchor-sweep-repeatable",
  },
).catch((err) => console.warn("[attribution-anchor] Failed to register sweep job:", err));

// Capacity hold expiry sweep — every 30 minutes. Transitions ACTIVE holds
// to EXPIRED when the service window has passed with no terminal status.
const capacityExpirySweepWorker = new Worker(
  "capacity-expiry-sweep",
  handleCapacityExpirySweepJob,
  redisConnection,
);
capacityExpirySweepWorker.on("completed", (job, result) =>
  console.log("Capacity expiry sweep completed", job.id, job.name, result),
);
capacityExpirySweepWorker.on("failed", (job, err) =>
  console.error("Capacity expiry sweep failed", job?.id, err.message),
);

capacityExpirySweepQueue.add(
  "capacity-expiry-sweep-30m",
  {},
  {
    repeat: { every: 30 * 60 * 1000 },
    jobId: "capacity-expiry-sweep-30m-repeatable",
  },
).catch((err) => console.warn("[capacity-expiry-sweep] Failed to register repeatable job:", err));

console.log("Worker started...");
} // end startWorkers
