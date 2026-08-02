import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isValidLocale } from "@/i18n/config";
import { getTranslations } from "@/i18n/getTranslations";
import {
  getLaunchReadiness,
  getRecentLaunchReadinessSnapshots,
  type ReadinessGate,
  type ReadinessHistoryEntry,
} from "@/server/launchReadiness/getLaunchReadiness";
import {
  getRecentLaunchReadinessAlerts,
  type RecentLaunchReadinessAlert,
} from "@/server/launchReadiness/getRecentLaunchReadinessAlerts";
import {
  getRecentLaunchReadinessTestAlerts,
  type RecentLaunchReadinessTestAlert,
} from "@/server/launchReadiness/getRecentLaunchReadinessTestAlerts";
import type { AdminTranslations, AdminLaunchReadinessTranslations } from "@/i18n/translationsData";
import type { Locale } from "@/types/i18n";
import RefreshButton from "./RefreshButton";
import SendTestAlertButton from "./SendTestAlertButton";

export const dynamic = "force-dynamic";

function tr(
  adm: AdminTranslations,
  key: keyof AdminLaunchReadinessTranslations,
  fallback: string,
): string {
  const lr = adm.launchReadiness;
  const value = lr ? lr[key] : undefined;
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

const STATUS_COLORS: Record<ReadinessGate["status"], { bg: string; fg: string; border: string }> = {
  pass: { bg: "#dcfce7", fg: "#166534", border: "#86efac" },
  warn: { bg: "#fef3c7", fg: "#92400e", border: "#fcd34d" },
  fail: { bg: "#fee2e2", fg: "#991b1b", border: "#fca5a5" },
};

export default async function LaunchReadinessPage() {
  const session = await getServerSession(authOptions);
  const roles: string[] = (session?.user as { roles?: string[] } | undefined)?.roles ?? [];
  if (!roles.includes("SUPERADMIN")) {
    redirect("/admin");
  }

  const jar = await cookies();
  const cookieLocale = jar.get("oku_locale")?.value;
  const locale: Locale = isValidLocale(cookieLocale ?? "") ? (cookieLocale as Locale) : "en";
  const t = await getTranslations(locale, ["admin"]);
  const adm = t.admin as AdminTranslations;

  const labels = {
    title: tr(adm, "title", "Launch Readiness"),
    subtitle: tr(adm, "subtitle", "Day-to-day go / no-go gates for this deploy."),
    overall: tr(adm, "overallVerdict", "Overall verdict"),
    go: tr(adm, "verdictGo", "GO"),
    noGo: tr(adm, "verdictNoGo", "NO_GO"),
    blockingFailures: tr(adm, "blockingFailures", "blocking failure(s)"),
    readyToLaunch: tr(adm, "readyToLaunch", "All blocking gates pass. Cleared for launch."),
    refresh: tr(adm, "refresh", "Refresh"),
    refreshing: tr(adm, "refreshing", "Refreshing…"),
    sendTestAlert: tr(adm, "sendTestAlert", "Send test alert"),
    sendingTestAlert: tr(adm, "sendingTestAlert", "Sending…"),
    sendTestAlertOk: tr(adm, "sendTestAlertOk", "Test alert sent"),
    sendTestAlertError: tr(adm, "sendTestAlertError", "Send failed"),
    lastChecked: tr(adm, "lastChecked", "Last checked at"),
    statusPass: tr(adm, "statusPass", "pass"),
    statusWarn: tr(adm, "statusWarn", "warn"),
    statusFail: tr(adm, "statusFail", "fail"),
    fix: tr(adm, "fix", "Fix"),
    informational: tr(adm, "informational", "Informational"),
    blocking: tr(adm, "blocking", "Blocking"),
    errorTitle: tr(adm, "errorTitle", "Could not load launch readiness"),
    errorBody: tr(adm, "errorBody", "The readiness service threw an error. Use Refresh to retry."),
    historyTitle: tr(adm, "historyTitle", "Recent history"),
    historySubtitle: tr(
      adm,
      "historySubtitle",
      "Last 20 snapshots. Each row shows the overall verdict and per-gate status over time (newest on the right).",
    ),
    historyEmpty: tr(
      adm,
      "historyEmpty",
      "No history yet. Snapshots are recorded each time this page is refreshed.",
    ),
    historyGate: tr(adm, "historyGate", "Gate"),
    historyOverall: tr(adm, "historyOverall", "Overall"),
    alertsTitle: tr(adm, "alertsTitle", "Recent alerts"),
    alertsSubtitle: tr(
      adm,
      "alertsSubtitle",
      "Last 5 launch-readiness alert emails. Recipient addresses are not shown.",
    ),
    alertsEmpty: tr(adm, "alertsEmpty", "No alert emails have been sent yet."),
    alertsColTime: tr(adm, "alertsColTime", "Time"),
    alertsColEvent: tr(adm, "alertsColEvent", "Event"),
    alertsColRecipients: tr(adm, "alertsColRecipients", "Recipients"),
    alertsColStatus: tr(adm, "alertsColStatus", "Status"),
    alertsEventNoGo: tr(adm, "alertsEventNoGo", "Flipped to NO_GO"),
    alertsEventResolved: tr(adm, "alertsEventResolved", "Recovered to GO"),
    alertsEventRetry: tr(adm, "alertsEventRetry", "Retried failed recipients"),
    alertsEventSkipped: tr(adm, "alertsEventSkipped", "Skipped (no send)"),
    alertsRecipientsCount: tr(adm, "alertsRecipientsCount", "{count} targeted"),
    alertsDeliveredOf: tr(adm, "alertsDeliveredOf", "{delivered} of {count} delivered"),
    alertsStatusDelivered: tr(adm, "alertsStatusDelivered", "Delivered"),
    alertsStatusPartial: tr(adm, "alertsStatusPartial", "Partial delivery"),
    alertsStatusFailed: tr(adm, "alertsStatusFailed", "All sends failed"),
    alertsStatusSkipped: tr(adm, "alertsStatusSkipped", "Skipped"),
    alertsReasonNoRecipients: tr(
      adm,
      "alertsReasonNoRecipients",
      "No active SUPERADMIN recipients configured",
    ),
    alertsReasonAllFailed: tr(
      adm,
      "alertsReasonAllFailed",
      "Email transport failed for every recipient",
    ),
    alertsReasonRetryFailed: tr(
      adm,
      "alertsReasonRetryFailed",
      "Retry attempt failed for every recipient",
    ),
    alertsReasonPartial: tr(
      adm,
      "alertsReasonPartial",
      "Some recipients failed; will retry within the retry window",
    ),
    alertsReasonGeneric: tr(adm, "alertsReasonGeneric", "See audit log for details"),
    testAlertsTitle: tr(adm, "testAlertsTitle", "Recent test alerts"),
    testAlertsSubtitle: tr(
      adm,
      "testAlertsSubtitle",
      "Last 5 dry-run sends triggered by the Send test alert button.",
    ),
    testAlertsEmpty: tr(adm, "testAlertsEmpty", "No test alerts have been sent yet."),
    testAlertsColTime: tr(adm, "testAlertsColTime", "Time"),
    testAlertsColActor: tr(adm, "testAlertsColActor", "Sent by"),
    testAlertsColRecipient: tr(adm, "testAlertsColRecipient", "Recipient"),
    testAlertsColStatus: tr(adm, "testAlertsColStatus", "Status"),
    testAlertsStatusOk: tr(adm, "testAlertsStatusOk", "Delivered"),
    testAlertsStatusFailed: tr(adm, "testAlertsStatusFailed", "Failed"),
    testAlertsUnknownActor: tr(adm, "testAlertsUnknownActor", "Unknown"),
  };

  let snapshot: Awaited<ReturnType<typeof getLaunchReadiness>> | null = null;
  let errorMessage: string | null = null;
  try {
    snapshot = await getLaunchReadiness();
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e);
  }

  // History + recent alerts are best-effort and independent of the current
  // snapshot — if either read fails, we still render the rest of the page.
  const [history, alerts, testAlerts] = await Promise.all([
    getRecentLaunchReadinessSnapshots(20).catch(
      () => [] as ReadinessHistoryEntry[],
    ),
    getRecentLaunchReadinessAlerts(5).catch(
      () => [] as RecentLaunchReadinessAlert[],
    ),
    getRecentLaunchReadinessTestAlerts(5).catch(
      () => [] as RecentLaunchReadinessTestAlert[],
    ),
  ]);

  if (!snapshot) {
    return (
      <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", margin: 0 }}>{labels.title}</h1>
            <p style={{ color: "#64748b", margin: "4px 0 0" }}>{labels.subtitle}</p>
          </div>
          <RefreshButton label={labels.refresh} refreshingLabel={labels.refreshing} />
        </header>
        <section
          data-testid="launch-readiness-error"
          style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", padding: 16, borderRadius: 8 }}
        >
          <strong>{labels.errorTitle}</strong>
          <p style={{ margin: "6px 0 0" }}>{labels.errorBody}</p>
          {errorMessage && (
            <pre style={{ marginTop: 8, fontSize: 12, whiteSpace: "pre-wrap", overflow: "auto" }}>{errorMessage}</pre>
          )}
        </section>
      </main>
    );
  }

  const blockingFails = snapshot.gates.filter((g) => g.severity === "blocking" && g.status === "fail");
  const isGo = snapshot.overall === "GO";

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", margin: 0 }}>{labels.title}</h1>
          <p style={{ color: "#64748b", margin: "4px 0 0" }}>{labels.subtitle}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>
            {labels.lastChecked}: {new Date(snapshot.checkedAt).toLocaleString(locale)}
          </span>
          <SendTestAlertButton
            label={labels.sendTestAlert}
            sendingLabel={labels.sendingTestAlert}
            successLabel={labels.sendTestAlertOk}
            errorLabel={labels.sendTestAlertError}
          />
          <RefreshButton label={labels.refresh} refreshingLabel={labels.refreshing} />
        </div>
      </header>

      <section
        data-testid="launch-readiness-verdict"
        data-verdict={snapshot.overall}
        style={{
          background: isGo ? "#dcfce7" : "#fee2e2",
          border: `2px solid ${isGo ? "#16a34a" : "#dc2626"}`,
          color: isGo ? "#166534" : "#991b1b",
          padding: 16,
          borderRadius: 8,
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {labels.overall}
          </span>
          <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: "0.04em" }}>
            {isGo ? labels.go : labels.noGo}
          </span>
          <span style={{ fontSize: 14 }}>
            {isGo
              ? labels.readyToLaunch
              : `${blockingFails.length} ${labels.blockingFailures}`}
          </span>
        </div>
      </section>

      <section
        style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}
        data-testid="launch-readiness-gates"
      >
        {snapshot.gates.map((g) => {
          const c = STATUS_COLORS[g.status];
          const statusLabel = g.status === "pass" ? labels.statusPass : g.status === "warn" ? labels.statusWarn : labels.statusFail;
          return (
            <div
              key={g.name}
              data-testid="launch-readiness-gate"
              data-gate-name={g.name}
              data-gate-status={g.status}
              style={{
                display: "grid",
                gridTemplateColumns: "90px 1fr auto",
                gap: 12,
                padding: "12px 16px",
                borderBottom: "1px solid #f1f5f9",
                alignItems: "start",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  background: c.bg,
                  color: c.fg,
                  border: `1px solid ${c.border}`,
                  textAlign: "center",
                  width: "fit-content",
                }}
              >
                {statusLabel}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <strong style={{ color: "#0f172a", fontSize: 14 }}>{g.label}</strong>
                  <span
                    style={{
                      fontSize: 10,
                      padding: "1px 6px",
                      borderRadius: 4,
                      background: g.severity === "blocking" ? "#fef2f2" : "#f1f5f9",
                      color: g.severity === "blocking" ? "#991b1b" : "#475569",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {g.severity === "blocking" ? labels.blocking : labels.informational}
                  </span>
                </div>
                <p style={{ margin: "4px 0 0", color: "#475569", fontSize: 13 }}>{g.remediation}</p>
                {g.details && (
                  <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12, fontFamily: "ui-monospace, monospace" }}>
                    {g.details}
                  </p>
                )}
              </div>
              <div>
                {g.fixPath && (
                  <Link
                    href={g.fixPath}
                    style={{
                      display: "inline-block",
                      padding: "4px 10px",
                      borderRadius: 6,
                      border: "1px solid #cbd5e1",
                      background: "#fff",
                      color: "#0f172a",
                      fontSize: 12,
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    {labels.fix} →
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <HistorySection
        history={history}
        gates={snapshot.gates}
        locale={locale}
        labels={{
          title: labels.historyTitle,
          subtitle: labels.historySubtitle,
          empty: labels.historyEmpty,
          gate: labels.historyGate,
          overall: labels.historyOverall,
          go: labels.go,
          noGo: labels.noGo,
        }}
      />

      <RecentAlertsSection alerts={alerts} locale={locale} labels={labels} />

      <RecentTestAlertsSection
        testAlerts={testAlerts}
        locale={locale}
        labels={{
          title: labels.testAlertsTitle,
          subtitle: labels.testAlertsSubtitle,
          empty: labels.testAlertsEmpty,
          colTime: labels.testAlertsColTime,
          colActor: labels.testAlertsColActor,
          colRecipient: labels.testAlertsColRecipient,
          colStatus: labels.testAlertsColStatus,
          statusOk: labels.testAlertsStatusOk,
          statusFailed: labels.testAlertsStatusFailed,
          unknownActor: labels.testAlertsUnknownActor,
        }}
      />
    </main>
  );
}

type RecentAlertsLabels = {
  alertsTitle: string;
  alertsSubtitle: string;
  alertsEmpty: string;
  alertsColTime: string;
  alertsColEvent: string;
  alertsColRecipients: string;
  alertsColStatus: string;
  alertsEventNoGo: string;
  alertsEventResolved: string;
  alertsEventRetry: string;
  alertsEventSkipped: string;
  alertsRecipientsCount: string;
  alertsDeliveredOf: string;
  alertsStatusDelivered: string;
  alertsStatusPartial: string;
  alertsStatusFailed: string;
  alertsStatusSkipped: string;
  alertsReasonNoRecipients: string;
  alertsReasonAllFailed: string;
  alertsReasonRetryFailed: string;
  alertsReasonPartial: string;
  alertsReasonGeneric: string;
};

function describeAlertEvent(
  a: RecentLaunchReadinessAlert,
  labels: RecentAlertsLabels,
): string {
  if (a.action === "launch.readiness.alert.skipped") return labels.alertsEventSkipped;
  if (a.isRetry) return labels.alertsEventRetry;
  if (a.action === "launch.readiness.alert.sent") return labels.alertsEventNoGo;
  return labels.alertsEventResolved;
}

function alertStatusInfo(
  a: RecentLaunchReadinessAlert,
  labels: RecentAlertsLabels,
): { label: string; reason: string | null; color: { bg: string; fg: string; border: string } } {
  // Skipped rows: no email was sent at all.
  if (a.action === "launch.readiness.alert.skipped") {
    let reason: string;
    switch (a.skippedReason) {
      case "no_active_superadmin_recipients":
        reason = labels.alertsReasonNoRecipients;
        break;
      case "resend_send_failed":
        reason = labels.alertsReasonAllFailed;
        break;
      case "retry_send_failed":
        reason = labels.alertsReasonRetryFailed;
        break;
      case "resend_send_partial":
        reason = labels.alertsReasonPartial;
        break;
      default:
        reason = a.skippedReason ?? labels.alertsReasonGeneric;
    }
    return {
      label: labels.alertsStatusSkipped,
      reason,
      color: { bg: "#f1f5f9", fg: "#475569", border: "#cbd5e1" },
    };
  }
  // Sent/resolved with failures recorded → partial delivery.
  if (a.failedCount > 0 && a.deliveredCount > 0) {
    return {
      label: labels.alertsStatusPartial,
      reason: labels.alertsReasonPartial,
      color: { bg: "#fef3c7", fg: "#92400e", border: "#fcd34d" },
    };
  }
  if (a.failedCount > 0 && a.deliveredCount === 0) {
    return {
      label: labels.alertsStatusFailed,
      reason: labels.alertsReasonAllFailed,
      color: { bg: "#fee2e2", fg: "#991b1b", border: "#fca5a5" },
    };
  }
  return {
    label: labels.alertsStatusDelivered,
    reason: null,
    color: { bg: "#dcfce7", fg: "#166534", border: "#86efac" },
  };
}

function fillTemplate(t: string, vars: Record<string, string | number>): string {
  return t.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

function RecentAlertsSection({
  alerts,
  locale,
  labels,
}: {
  alerts: RecentLaunchReadinessAlert[];
  locale: Locale;
  labels: RecentAlertsLabels;
}) {
  return (
    <section
      data-testid="launch-readiness-alerts"
      style={{
        marginTop: 24,
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <header style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9" }}>
        <strong style={{ color: "#0f172a", fontSize: 14 }}>{labels.alertsTitle}</strong>
        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>
          {labels.alertsSubtitle}
        </p>
      </header>
      {alerts.length === 0 ? (
        <p
          data-testid="launch-readiness-alerts-empty"
          style={{ margin: 0, padding: 16, color: "#64748b", fontSize: 13 }}
        >
          {labels.alertsEmpty}
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={alertThStyle}>{labels.alertsColTime}</th>
                <th style={alertThStyle}>{labels.alertsColEvent}</th>
                <th style={alertThStyle}>{labels.alertsColRecipients}</th>
                <th style={alertThStyle}>{labels.alertsColStatus}</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => {
                const event = describeAlertEvent(a, labels);
                const status = alertStatusInfo(a, labels);
                const recipientsLine =
                  a.action === "launch.readiness.alert.skipped" &&
                  a.recipientCount === 0
                    ? "—"
                    : a.deliveredCount > 0 || a.failedCount > 0
                      ? fillTemplate(labels.alertsDeliveredOf, {
                          delivered: a.deliveredCount,
                          count: a.recipientCount,
                        })
                      : fillTemplate(labels.alertsRecipientsCount, {
                          count: a.recipientCount,
                        });
                return (
                  <tr
                    key={a.id}
                    data-testid="launch-readiness-alert-row"
                    data-action={a.action}
                  >
                    <td style={alertTdStyle}>
                      <span title={new Date(a.createdAt).toLocaleString(locale)}>
                        {new Date(a.createdAt).toLocaleString(locale, {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </td>
                    <td style={alertTdStyle}>
                      <div style={{ color: "#0f172a", fontWeight: 600 }}>{event}</div>
                      {a.verdict && a.previousVerdict && (
                        <div style={{ color: "#94a3b8", fontSize: 11 }}>
                          {a.previousVerdict} → {a.verdict}
                        </div>
                      )}
                    </td>
                    <td style={{ ...alertTdStyle, color: "#475569" }}>{recipientsLine}</td>
                    <td style={alertTdStyle}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          background: status.color.bg,
                          color: status.color.fg,
                          border: `1px solid ${status.color.border}`,
                        }}
                      >
                        {status.label}
                      </span>
                      {status.reason && (
                        <div style={{ marginTop: 4, color: "#64748b", fontSize: 11 }}>
                          {status.reason}
                        </div>
                      )}
                      {a.errorMessage && (
                        <div
                          style={{
                            marginTop: 4,
                            color: "#94a3b8",
                            fontSize: 11,
                            fontFamily: "ui-monospace, monospace",
                          }}
                        >
                          {a.errorMessage}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

type RecentTestAlertsLabels = {
  title: string;
  subtitle: string;
  empty: string;
  colTime: string;
  colActor: string;
  colRecipient: string;
  colStatus: string;
  statusOk: string;
  statusFailed: string;
  unknownActor: string;
};

function RecentTestAlertsSection({
  testAlerts,
  locale,
  labels,
}: {
  testAlerts: RecentLaunchReadinessTestAlert[];
  locale: Locale;
  labels: RecentTestAlertsLabels;
}) {
  return (
    <section
      data-testid="launch-readiness-test-alerts"
      style={{
        marginTop: 24,
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <header style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9" }}>
        <strong style={{ color: "#0f172a", fontSize: 14 }}>{labels.title}</strong>
        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>
          {labels.subtitle}
        </p>
      </header>
      {testAlerts.length === 0 ? (
        <p
          data-testid="launch-readiness-test-alerts-empty"
          style={{ margin: 0, padding: 16, color: "#64748b", fontSize: 13 }}
        >
          {labels.empty}
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={alertThStyle}>{labels.colTime}</th>
                <th style={alertThStyle}>{labels.colActor}</th>
                <th style={alertThStyle}>{labels.colRecipient}</th>
                <th style={alertThStyle}>{labels.colStatus}</th>
              </tr>
            </thead>
            <tbody>
              {testAlerts.map((a) => {
                const color = a.ok
                  ? { bg: "#dcfce7", fg: "#166534", border: "#86efac" }
                  : { bg: "#fee2e2", fg: "#991b1b", border: "#fca5a5" };
                return (
                  <tr
                    key={a.id}
                    data-testid="launch-readiness-test-alert-row"
                    data-ok={a.ok ? "true" : "false"}
                  >
                    <td style={alertTdStyle}>
                      <span title={new Date(a.createdAt).toLocaleString(locale)}>
                        {new Date(a.createdAt).toLocaleString(locale, {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </td>
                    <td style={{ ...alertTdStyle, color: "#0f172a" }}>
                      {a.actorLabel ?? labels.unknownActor}
                    </td>
                    <td
                      style={{
                        ...alertTdStyle,
                        color: "#475569",
                        fontFamily: "ui-monospace, monospace",
                      }}
                    >
                      {a.recipient ?? "—"}
                    </td>
                    <td style={alertTdStyle}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          background: color.bg,
                          color: color.fg,
                          border: `1px solid ${color.border}`,
                        }}
                      >
                        {a.ok ? labels.statusOk : labels.statusFailed}
                      </span>
                      {a.errorMessage && (
                        <div
                          style={{
                            marginTop: 4,
                            color: "#94a3b8",
                            fontSize: 11,
                            fontFamily: "ui-monospace, monospace",
                          }}
                        >
                          {a.errorMessage}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const alertThStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  color: "#64748b",
  fontWeight: 600,
  borderBottom: "1px solid #e2e8f0",
  whiteSpace: "nowrap",
};

const alertTdStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "top",
};

const HISTORY_DOT_COLORS: Record<ReadinessGate["status"] | "missing", string> = {
  pass: "#22c55e",
  warn: "#f59e0b",
  fail: "#ef4444",
  missing: "#e2e8f0",
};

function HistorySection({
  history,
  gates,
  locale,
  labels,
}: {
  history: ReadinessHistoryEntry[];
  gates: ReadinessGate[];
  locale: Locale;
  labels: {
    title: string;
    subtitle: string;
    empty: string;
    gate: string;
    overall: string;
    go: string;
    noGo: string;
  };
}) {
  // Render newest-on-the-right so the sparkline reads left→right in time order.
  const ordered = [...history].reverse();

  return (
    <section
      data-testid="launch-readiness-history"
      style={{
        marginTop: 24,
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <header style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9" }}>
        <strong style={{ color: "#0f172a", fontSize: 14 }}>{labels.title}</strong>
        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>
          {labels.subtitle}
        </p>
      </header>

      {ordered.length === 0 ? (
        <p
          data-testid="launch-readiness-history-empty"
          style={{ margin: 0, padding: "16px", color: "#64748b", fontSize: 13 }}
        >
          {labels.empty}
        </p>
      ) : (
        <div style={{ padding: "12px 16px", overflowX: "auto" }}>
          <table
            style={{
              borderCollapse: "separate",
              borderSpacing: 0,
              width: "100%",
              fontSize: 12,
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    padding: "4px 8px 8px 0",
                    color: "#64748b",
                    fontWeight: 600,
                    minWidth: 180,
                  }}
                >
                  {labels.gate}
                </th>
                {ordered.map((snap) => (
                  <th
                    key={snap.id}
                    title={new Date(snap.checkedAt).toLocaleString(locale)}
                    style={{
                      padding: "4px 2px 8px",
                      color: "#94a3b8",
                      fontWeight: 500,
                      fontSize: 10,
                      writingMode: "vertical-rl",
                      transform: "rotate(180deg)",
                      whiteSpace: "nowrap",
                      maxHeight: 80,
                    }}
                  >
                    {formatShortTimestamp(snap.checkedAt, locale)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td
                  style={{
                    padding: "6px 8px 6px 0",
                    color: "#0f172a",
                    fontWeight: 700,
                    borderTop: "1px solid #f1f5f9",
                  }}
                >
                  {labels.overall}
                </td>
                {ordered.map((snap) => {
                  const isGo = snap.overall === "GO";
                  return (
                    <td
                      key={snap.id}
                      title={`${isGo ? labels.go : labels.noGo} — ${new Date(snap.checkedAt).toLocaleString(locale)}`}
                      data-testid="history-overall-dot"
                      data-snapshot-id={snap.id}
                      data-overall={snap.overall}
                      style={{
                        padding: "6px 2px",
                        textAlign: "center",
                        borderTop: "1px solid #f1f5f9",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background: isGo ? HISTORY_DOT_COLORS.pass : HISTORY_DOT_COLORS.fail,
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
              {gates.map((g) => (
                <tr
                  key={g.name}
                  data-testid="history-gate-row"
                  data-gate-name={g.name}
                >
                  <td
                    style={{
                      padding: "4px 8px 4px 0",
                      color: "#334155",
                      borderTop: "1px solid #f1f5f9",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: 260,
                    }}
                    title={g.label}
                  >
                    {g.label}
                  </td>
                  {ordered.map((snap) => {
                    const past = snap.gates.find((x) => x.name === g.name);
                    const status: ReadinessGate["status"] | "missing" =
                      past?.status ?? "missing";
                    const color = HISTORY_DOT_COLORS[status];
                    return (
                      <td
                        key={snap.id}
                        data-status={status}
                        title={`${g.label}: ${status} — ${new Date(snap.checkedAt).toLocaleString(locale)}`}
                        style={{
                          padding: "4px 2px",
                          textAlign: "center",
                          borderTop: "1px solid #f1f5f9",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            background: color,
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatShortTimestamp(iso: string, locale: Locale): string {
  const d = new Date(iso);
  // Compact MM-DD HH:mm — readable in a vertical column header.
  return d.toLocaleString(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
