/**
 * Launch-readiness verdict transition alerts (Task #132).
 *
 * Runs on a BullMQ interval (15 min by default). Each run:
 *   1. Calls `getLaunchReadiness()` to compute the current verdict.
 *   2. Reads the latest `launch.readiness.alert.{sent,resolved}` audit
 *      row — that row is the single source of truth for the state machine.
 *   3. On transition (previous verdict !== current, or first-ever NO_GO),
 *      emails ACTIVE SUPERADMIN users via Resend with blocking gates +
 *      deep link to /admin/launch-readiness. State advances on the FIRST
 *      successful delivery so the recovery email always fires later, even
 *      if some recipients transiently failed on the initial send.
 *   4. When the verdict has NOT changed but the previous send had failed
 *      recipients within the retry window, retries just those addresses.
 *      No fresh transition alert, no spam to already-delivered addresses.
 *   5. Otherwise no-op.
 *
 * Safe to call inline (CLI, tests, admin "run now"). All side effects are
 * idempotent against the audit-log state machine.
 */
import { prisma } from "@/lib/prisma";
import { getLaunchReadiness } from "@/server/launchReadiness/getLaunchReadiness";
import { getResendClient } from "@/server/invitation/resend";

const ALERT_SENT = "launch.readiness.alert.sent";
const ALERT_RESOLVED = "launch.readiness.alert.resolved";
const ALERT_SKIPPED = "launch.readiness.alert.skipped";

/** Stop retrying failed recipients after this much time has passed since the
 * original transition send. Prevents indefinite re-sends to a permanently
 * bad address. */
const RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;

type Verdict = "GO" | "NO_GO";

type LastTransition = {
  verdict: Verdict;
  delivered: string[];
  failed: string[];
  createdAt: Date;
} | null;

export type AlertResult =
  | { action: "no_transition"; current: Verdict; previous: Verdict | null }
  | {
      action: "alert_sent" | "resolved_sent" | "retry_sent" | "send_failed";
      current: Verdict;
      previous: Verdict | null;
      recipients: string[];
      delivered?: string[];
      failed?: string[];
      error?: string;
    }
  | { action: "skipped_no_recipients"; current: Verdict; previous: Verdict | null };

async function getLastTransitionRow(): Promise<LastTransition> {
  const last = await prisma.auditLog
    .findFirst({
      where: { action: { in: [ALERT_SENT, ALERT_RESOLVED] } },
      orderBy: { createdAt: "desc" },
      select: { action: true, metadata: true, createdAt: true },
    })
    .catch((err) => {
      console.warn(
        "[launch-readiness-alert] failed to read latest transition row:",
        err instanceof Error ? err.message : err,
      );
      return null;
    });
  if (!last) return null;
  const md = (last.metadata ?? {}) as {
    delivered?: unknown;
    failed?: unknown;
  };
  const delivered = Array.isArray(md.delivered)
    ? md.delivered.filter((x): x is string => typeof x === "string")
    : [];
  const failed = Array.isArray(md.failed)
    ? md.failed.filter((x): x is string => typeof x === "string")
    : [];
  return {
    verdict: last.action === ALERT_SENT ? "NO_GO" : "GO",
    delivered,
    failed,
    createdAt: last.createdAt,
  };
}

async function listSuperadminRecipients(): Promise<string[]> {
  const rows = await prisma.userRole
    .findMany({
      where: { roleKey: "SUPERADMIN" },
      select: { user: { select: { email: true, status: true } } },
    })
    .catch((err) => {
      console.warn(
        "[launch-readiness-alert] failed to list SUPERADMIN recipients:",
        err instanceof Error ? err.message : err,
      );
      return [] as Array<{ user: { email: string; status: string } | null }>;
    });
  const emails: string[] = [];
  for (const row of rows) {
    const u = row.user;
    if (u && u.status === "ACTIVE" && u.email) emails.push(u.email);
  }
  return emails;
}

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    "https://oku.group"
  ).replace(/\/+$/, "");
}

function renderAlertEmail(opts: {
  verdict: Verdict;
  blockingGates: Array<{ name: string; label: string; remediation: string }>;
  checkedAt: string;
}): { subject: string; html: string; text: string } {
  const link = `${appBaseUrl()}/admin/launch-readiness`;
  if (opts.verdict === "NO_GO") {
    const rows = opts.blockingGates
      .map(
        (g) =>
          `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;font-family:monospace;color:#7c2d12">${g.name}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;color:#1a1614">${g.label}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;color:#4b4540">${g.remediation}</td></tr>`,
      )
      .join("");
    const textLines = opts.blockingGates
      .map((g) => `  - [${g.name}] ${g.label} — ${g.remediation}`)
      .join("\n");
    return {
      subject: `[OKÜ] Launch readiness flipped to NO_GO (${opts.blockingGates.length} blocking)`,
      html: `
        <div style="font-family:sans-serif;max-width:680px;margin:0 auto">
          <div style="background:#7c2d12;padding:20px 24px;color:#fff">
            <strong style="font-size:18px">OKÜ — Launch readiness: NO_GO</strong>
            <div style="opacity:0.85;font-size:12px;margin-top:4px">checked at ${opts.checkedAt}</div>
          </div>
          <div style="padding:24px;color:#1a1614">
            <p>The launch-readiness verdict has transitioned to <strong style="color:#7c2d12">NO_GO</strong>. The following blocking gates are failing:</p>
            <table style="width:100%;border-collapse:collapse;font-size:13px;margin:16px 0">
              <thead><tr><th align="left" style="padding:8px 12px;background:#f9f7f4">Gate</th><th align="left" style="padding:8px 12px;background:#f9f7f4">Label</th><th align="left" style="padding:8px 12px;background:#f9f7f4">Remediation</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
            <p><a href="${link}" style="display:inline-block;background:#1a1614;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Open Launch Readiness</a></p>
            <p style="color:#9ca3af;font-size:12px;margin-top:24px">You are receiving this because you are a SUPERADMIN on this OKÜ deployment. Recovery to GO will trigger one follow-up email.</p>
          </div>
        </div>`,
      text:
        `OKÜ — Launch readiness flipped to NO_GO (checked at ${opts.checkedAt}).\n\n` +
        `Blocking gates:\n${textLines}\n\n` +
        `Open: ${link}\n`,
    };
  }
  return {
    subject: "[OKÜ] Launch readiness recovered — GO",
    html: `
      <div style="font-family:sans-serif;max-width:680px;margin:0 auto">
        <div style="background:#14532d;padding:20px 24px;color:#fff">
          <strong style="font-size:18px">OKÜ — Launch readiness: GO</strong>
          <div style="opacity:0.85;font-size:12px;margin-top:4px">checked at ${opts.checkedAt}</div>
        </div>
        <div style="padding:24px;color:#1a1614">
          <p>All blocking launch-readiness gates are now passing. The previous NO_GO is resolved.</p>
          <p><a href="${link}" style="display:inline-block;background:#1a1614;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Open Launch Readiness</a></p>
        </div>
      </div>`,
    text: `OKÜ — Launch readiness recovered to GO (checked at ${opts.checkedAt}).\nOpen: ${link}\n`,
  };
}

async function sendToRecipients(opts: {
  recipients: string[];
  subject: string;
  html: string;
  text: string;
}): Promise<{
  delivered: string[];
  failed: Array<{ to: string; error: string }>;
  topLevelError: string | null;
}> {
  try {
    const { client, fromEmail } = await getResendClient();
    const results = await Promise.all(
      opts.recipients.map((to) =>
        client.emails
          .send({
            from: fromEmail,
            to,
            subject: opts.subject,
            html: opts.html,
            text: opts.text,
          })
          .then(
            (r) => ({
              to,
              error:
                (r as { error?: { message?: string } | null })?.error?.message ?? null,
            }),
            (err) => ({ to, error: err instanceof Error ? err.message : String(err) }),
          ),
      ),
    );
    return {
      delivered: results.filter((r) => !r.error).map((r) => r.to),
      failed: results
        .filter((r): r is { to: string; error: string } => !!r.error)
        .map((r) => ({ to: r.to, error: r.error })),
      topLevelError: null,
    };
  } catch (err) {
    return {
      delivered: [],
      failed: opts.recipients.map((to) => ({
        to,
        error: err instanceof Error ? err.message : String(err),
      })),
      topLevelError: err instanceof Error ? err.message : String(err),
    };
  }
}

async function writeSkippedAudit(metadata: Record<string, unknown>): Promise<void> {
  await prisma.auditLog
    .create({
      data: {
        actorId: "system",
        action: ALERT_SKIPPED,
        metadata: metadata as unknown as object,
      },
    })
    .catch((err) => {
      console.warn(
        "[launch-readiness-alert] failed to write skipped audit row:",
        err instanceof Error ? err.message : err,
      );
    });
}

async function writeTransitionAudit(
  verdict: Verdict,
  metadata: Record<string, unknown>,
): Promise<void> {
  await prisma.auditLog
    .create({
      data: {
        actorId: "system",
        action: verdict === "NO_GO" ? ALERT_SENT : ALERT_RESOLVED,
        metadata: metadata as unknown as object,
      },
    })
    .catch((err) => {
      // The email was sent successfully; failing to persist the transition
      // means the next interval will re-derive an outdated previousVerdict.
      // Surface so operators can investigate.
      console.warn(
        "[launch-readiness-alert] sent email but failed to write transition audit row:",
        err instanceof Error ? err.message : err,
      );
    });
}

export type TestAlertResult =
  | {
      action: "test_sent" | "test_send_failed";
      current: Verdict;
      to: string;
      delivered: string[];
      failed: string[];
      error?: string;
    };

/**
 * Dry-run variant of {@link runLaunchReadinessAlertScan}. Emails the current
 * verdict snapshot to a single requesting recipient only — never the full
 * SUPERADMIN list — so operators can verify Resend credentials, from-address,
 * and template rendering without waiting for a real GO↔NO_GO transition.
 *
 * Does NOT read or write the `launch.readiness.alert.{sent,resolved}` state
 * machine. Caller is responsible for writing the `launch.readiness.alert.test_sent`
 * audit row with userId context.
 */
export async function runLaunchReadinessAlertTestSend(opts: {
  to: string;
}): Promise<TestAlertResult> {
  const snapshot = await getLaunchReadiness();
  const current: Verdict = snapshot.overall;
  const blockingGates = snapshot.gates
    .filter((g) => g.severity === "blocking" && g.status === "fail")
    .map((g) => ({ name: g.name, label: g.label, remediation: g.remediation }));
  const rendered = renderAlertEmail({
    verdict: current,
    blockingGates,
    checkedAt: snapshot.checkedAt,
  });
  // Tag subject so test sends are visibly distinct from real alerts in
  // recipient inboxes.
  const subject = `[TEST] ${rendered.subject}`;
  const send = await sendToRecipients({
    recipients: [opts.to],
    subject,
    html: rendered.html,
    text: `[TEST SEND — not a real launch-readiness alert]\n\n${rendered.text}`,
  });
  if (send.delivered.length === 0) {
    return {
      action: "test_send_failed",
      current,
      to: opts.to,
      delivered: [],
      failed: send.failed.map((f) => f.to),
      error: send.topLevelError ?? send.failed[0]?.error ?? "send failed",
    };
  }
  return {
    action: "test_sent",
    current,
    to: opts.to,
    delivered: send.delivered,
    failed: send.failed.map((f) => f.to),
  };
}

/**
 * Main entry point — invoke from the BullMQ worker, tests, or an admin
 * "run now" button. Returns a structured result describing what happened.
 */
export async function runLaunchReadinessAlertScan(): Promise<AlertResult> {
  const snapshot = await getLaunchReadiness();
  const current: Verdict = snapshot.overall;
  const last = await getLastTransitionRow();
  const previous: Verdict | null = last?.verdict ?? null;

  // ─── Path 1: same verdict, retry pending failed recipients ──────────────
  if (previous === current && last) {
    const withinRetryWindow =
      Date.now() - last.createdAt.getTime() < RETRY_WINDOW_MS;
    if (!withinRetryWindow || last.failed.length === 0) {
      return { action: "no_transition", current, previous };
    }
    // Re-check active SUPERADMINs so we don't retry to demoted/suspended users.
    const activeNow = new Set(await listSuperadminRecipients());
    const retryRecipients = last.failed.filter((e) => activeNow.has(e));
    if (retryRecipients.length === 0) {
      return { action: "no_transition", current, previous };
    }
    const blockingGates = snapshot.gates
      .filter((g) => g.severity === "blocking" && g.status === "fail")
      .map((g) => ({ name: g.name, label: g.label, remediation: g.remediation }));
    const email = renderAlertEmail({
      verdict: current,
      blockingGates,
      checkedAt: snapshot.checkedAt,
    });
    const send = await sendToRecipients({
      recipients: retryRecipients,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    if (send.delivered.length === 0) {
      await writeSkippedAudit({
        reason: "retry_send_failed",
        verdict: current,
        previousVerdict: previous,
        recipients: retryRecipients,
        delivered: [],
        failed: send.failed,
        error: send.topLevelError,
        checkedAt: snapshot.checkedAt,
      });
      return {
        action: "send_failed",
        current,
        previous,
        recipients: retryRecipients,
        delivered: [],
        failed: send.failed.map((f) => f.to),
        error: send.topLevelError ?? `${send.failed.length} retries failed`,
      };
    }
    // Write a new transition row to record the retry outcome. Delivered
    // merges with the prior row's delivered (so future runs see the full
    // picture); failed is the still-unreached subset.
    const mergedDelivered = Array.from(
      new Set<string>([...last.delivered, ...send.delivered]),
    );
    const stillFailed = send.failed.map((f) => f.to);
    await writeTransitionAudit(current, {
      verdict: current,
      previousVerdict: previous,
      isRetry: true,
      checkedAt: snapshot.checkedAt,
      retriedRecipients: retryRecipients,
      delivered: mergedDelivered,
      failed: stillFailed,
      blockingGates: blockingGates.map((g) => g.name),
    });
    return {
      action: "retry_sent",
      current,
      previous,
      recipients: retryRecipients,
      delivered: send.delivered,
      failed: stillFailed,
    };
  }

  // ─── Path 2: no transition (verdicts match) and no prior row ────────────
  if (previous === current) {
    return { action: "no_transition", current, previous };
  }

  // ─── Path 3: first observation of GO with no prior state — no-op ────────
  if (previous === null && current === "GO") {
    return { action: "no_transition", current, previous };
  }

  // ─── Path 4: real transition (or first-ever NO_GO) ──────────────────────
  const allRecipients = await listSuperadminRecipients();
  if (allRecipients.length === 0) {
    await writeSkippedAudit({
      reason: "no_active_superadmin_recipients",
      verdict: current,
      previousVerdict: previous,
      checkedAt: snapshot.checkedAt,
    });
    return { action: "skipped_no_recipients", current, previous };
  }

  const blockingGates = snapshot.gates
    .filter((g) => g.severity === "blocking" && g.status === "fail")
    .map((g) => ({ name: g.name, label: g.label, remediation: g.remediation }));

  const email = renderAlertEmail({
    verdict: current,
    blockingGates,
    checkedAt: snapshot.checkedAt,
  });

  const send = await sendToRecipients({
    recipients: allRecipients,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  // Total failure: 0 recipients reached. Do NOT advance state — next interval
  // will retry the full transition (this is the only way recovery can still
  // be detected after a failed initial NO_GO).
  if (send.delivered.length === 0) {
    await writeSkippedAudit({
      reason: "resend_send_failed",
      verdict: current,
      previousVerdict: previous,
      recipients: allRecipients,
      delivered: [],
      failed: send.failed,
      error: send.topLevelError,
      checkedAt: snapshot.checkedAt,
    });
    return {
      action: "send_failed",
      current,
      previous,
      recipients: allRecipients,
      delivered: [],
      failed: send.failed.map((f) => f.to),
      error: send.topLevelError ?? "all sends failed",
    };
  }

  // At least one recipient reached → ADVANCE STATE. The recovery email is
  // now guaranteed to fire on NO_GO→GO even if some recipients here failed
  // (those go onto the retry list in the same metadata row).
  await writeTransitionAudit(current, {
    verdict: current,
    previousVerdict: previous,
    isRetry: false,
    checkedAt: snapshot.checkedAt,
    recipients: allRecipients,
    delivered: send.delivered,
    failed: send.failed.map((f) => f.to),
    failureDetail: send.failed,
    blockingGates: blockingGates.map((g) => g.name),
  });

  return {
    action: current === "NO_GO" ? "alert_sent" : "resolved_sent",
    current,
    previous,
    recipients: allRecipients,
    delivered: send.delivered,
    failed: send.failed.map((f) => f.to),
  };
}
