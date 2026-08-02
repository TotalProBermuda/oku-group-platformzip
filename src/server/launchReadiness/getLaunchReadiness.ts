/**
 * Launch-readiness shared service (Task #129).
 *
 * Single source of truth for "is this deploy ready to take real money?".
 * Consumed by:
 *   - `/api/v1/admin/launch-readiness` GET (projects to its legacy JSON shape)
 *   - `npm run prod:bootstrap` CLI
 *   - `/admin/launch-readiness` audit page (Task #130, downstream)
 *
 * Contract: `{ gates, overall, checkedAt }`.
 *   - `gates[].status`: "pass" | "warn" | "fail"
 *   - `gates[].severity`: "blocking" | "informational"
 *   - `overall`: "GO" only when no blocking gate has status "fail";
 *                "NO_GO" otherwise.
 *
 * Safe to call from a CLI: no `next/headers` imports, no request-scoped
 * globals.
 */
import { prisma } from "@/lib/prisma";
import {
  getActiveCheckoutGateway,
  type ActiveGatewaySnapshot,
} from "@/server/payments/activeGateway";
import { isEncryptionAvailable } from "@/server/security/encryption";
import { getResendClient } from "@/server/invitation/resend";

export type GateStatus = "pass" | "warn" | "fail";
export type GateSeverity = "blocking" | "informational";

export interface ReadinessGate {
  name: string;
  category:
    | "environment"
    | "auth"
    | "database"
    | "payments"
    | "email"
    | "users"
    | "flags";
  label: string;
  status: GateStatus;
  severity: GateSeverity;
  remediation: string;
  details?: string | null;
  /** Optional deep-link path to an admin surface that fixes this gate. */
  fixPath?: string | null;
}

export interface LaunchReadinessSnapshot {
  gates: ReadinessGate[];
  overall: "GO" | "NO_GO";
  checkedAt: string;
  /** Embedded for callers that want the full payments picture (UI). */
  activeGateway: ActiveGatewaySnapshot | null;
}

function envPresent(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.length > 0;
}

function gate(
  partial: Omit<ReadinessGate, "status" | "fixPath" | "details"> & {
    status: GateStatus;
    fixPath?: string | null;
    details?: string | null;
  },
): ReadinessGate {
  return {
    fixPath: partial.fixPath ?? null,
    details: partial.details ?? null,
    ...partial,
  };
}

async function checkDbReachable(): Promise<ReadinessGate> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return gate({
      name: "database.connection",
      category: "database",
      label: "Database reachable",
      status: "pass",
      severity: "blocking",
      remediation: "OK",
    });
  } catch (err) {
    return gate({
      name: "database.connection",
      category: "database",
      label: "Database reachable",
      status: "fail",
      severity: "blocking",
      remediation:
        "Postgres is not reachable. Verify DATABASE_URL and that the database is running.",
      details: err instanceof Error ? err.message : String(err),
    });
  }
}

async function checkSchemaInSync(): Promise<ReadinessGate> {
  // Probe a column added in a recent migration. If Prisma client and DB drift,
  // this throws and we surface a fail. We use `commerceSettings` since it is
  // a singleton row touched by Payments P4/P5 and present in production.
  try {
    await prisma.commerceSettings.findUnique({
      where: { id: "global" },
      select: { activeCheckoutGateway: true },
    });
    return gate({
      name: "database.schema_in_sync",
      category: "database",
      label: "Prisma schema in sync",
      status: "pass",
      severity: "blocking",
      remediation: "OK",
    });
  } catch (err) {
    return gate({
      name: "database.schema_in_sync",
      category: "database",
      label: "Prisma schema in sync",
      status: "fail",
      severity: "blocking",
      remediation:
        "Schema drift detected. Run `npx prisma db push` against this environment.",
      details: err instanceof Error ? err.message : String(err),
    });
  }
}

async function checkSuperadminExists(): Promise<ReadinessGate> {
  try {
    const count = await prisma.userRole.count({
      where: { roleKey: "SUPERADMIN" },
    });
    if (count > 0) {
      return gate({
        name: "superadmin.exists",
        category: "users",
        label: "At least one SUPERADMIN user exists",
        status: "pass",
        severity: "blocking",
        remediation: "OK",
        details: `${count} SUPERADMIN user(s) on record`,
      });
    }
    return gate({
      name: "superadmin.exists",
      category: "users",
      label: "At least one SUPERADMIN user exists",
      status: "fail",
      severity: "blocking",
      remediation:
        "No SUPERADMIN exists. Run `npm run prod:bootstrap` to create the first one.",
    });
  } catch (err) {
    return gate({
      name: "superadmin.exists",
      category: "users",
      label: "At least one SUPERADMIN user exists",
      status: "fail",
      severity: "blocking",
      remediation:
        "Could not query users. Resolve the database connection first.",
      details: err instanceof Error ? err.message : String(err),
    });
  }
}

async function checkNoDemoUsers(): Promise<ReadinessGate> {
  try {
    const demoCount = await prisma.user.count({
      where: { email: { endsWith: "@oku.local" } },
    });
    if (demoCount === 0) {
      return gate({
        name: "users.demo_absent",
        category: "users",
        label: "No demo users (@oku.local) present",
        status: "pass",
        severity: "blocking",
        remediation: "OK",
      });
    }
    return gate({
      name: "users.demo_absent",
      category: "users",
      label: "No demo users (@oku.local) present",
      status: "fail",
      severity: "blocking",
      remediation:
        `Found ${demoCount} demo user(s) with @oku.local emails. Remove them before launch.`,
      details: `${demoCount} demo user(s) present`,
    });
  } catch (err) {
    return gate({
      name: "users.demo_absent",
      category: "users",
      label: "No demo users (@oku.local) present",
      status: "fail",
      severity: "blocking",
      remediation: "Could not query users. Resolve the database connection first.",
      details: err instanceof Error ? err.message : String(err),
    });
  }
}

function checkEnvVar(opts: {
  name: string;
  varName: string;
  label: string;
  category: ReadinessGate["category"];
  severity?: GateSeverity;
  remediation: string;
}): ReadinessGate {
  const ok = envPresent(opts.varName);
  return gate({
    name: opts.name,
    category: opts.category,
    label: opts.label,
    status: ok ? "pass" : "fail",
    severity: opts.severity ?? "blocking",
    remediation: ok ? "OK" : opts.remediation,
  });
}

function checkAppEncryptionKey(): ReadinessGate {
  if (!envPresent("APP_ENCRYPTION_KEY")) {
    return gate({
      name: "auth.app_encryption_key",
      category: "auth",
      label: "APP_ENCRYPTION_KEY set and valid",
      status: "fail",
      severity: "blocking",
      remediation:
        "Set APP_ENCRYPTION_KEY (32 bytes base64). Generate with: " +
        `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    });
  }
  if (!isEncryptionAvailable()) {
    return gate({
      name: "auth.app_encryption_key",
      category: "auth",
      label: "APP_ENCRYPTION_KEY set and valid",
      status: "fail",
      severity: "blocking",
      remediation:
        "APP_ENCRYPTION_KEY is set but does not decode to 32 bytes. Regenerate it.",
    });
  }
  return gate({
    name: "auth.app_encryption_key",
    category: "auth",
    label: "APP_ENCRYPTION_KEY set and valid",
    status: "pass",
    severity: "blocking",
    remediation: "OK",
  });
}

function checkNodeEnv(): ReadinessGate {
  const env = process.env.NODE_ENV ?? "development";
  if (env === "production") {
    return gate({
      name: "environment.node_env_production",
      category: "environment",
      label: "NODE_ENV === 'production'",
      status: "pass",
      severity: "blocking",
      remediation: "OK",
      details: `NODE_ENV=${env}`,
    });
  }
  return gate({
    name: "environment.node_env_production",
    category: "environment",
    label: "NODE_ENV === 'production'",
    status: "fail",
    severity: "blocking",
    remediation: "Set NODE_ENV=production for production deployments.",
    details: `NODE_ENV=${env}`,
  });
}

function checkDemoModeOff(): ReadinessGate {
  const flagSet = process.env.DEMO_MODE_ENABLED === "true";
  if (!flagSet) {
    return gate({
      name: "flags.demo_mode_disabled",
      category: "flags",
      label: "DEMO_MODE_ENABLED is not 'true'",
      status: "pass",
      severity: "blocking",
      remediation: "OK",
    });
  }
  return gate({
    name: "flags.demo_mode_disabled",
    category: "flags",
    label: "DEMO_MODE_ENABLED is not 'true'",
    status: "fail",
    severity: "blocking",
    remediation:
      "Unset DEMO_MODE_ENABLED (or set to 'false') in this environment to disable the demo back-doors.",
  });
}

async function checkResend(): Promise<ReadinessGate> {
  try {
    const r = await getResendClient();
    if (r.client && r.fromEmail) {
      return gate({
        name: "email.resend_configured",
        category: "email",
        label: "Resend transactional email configured",
        status: "pass",
        severity: "blocking",
        remediation: "OK",
        details: `from=${r.fromEmail}`,
      });
    }
    return gate({
      name: "email.resend_configured",
      category: "email",
      label: "Resend transactional email configured",
      status: "fail",
      severity: "blocking",
      remediation:
        "Set RESEND_API_KEY and RESEND_FROM_EMAIL (or connect the Resend integration).",
    });
  } catch {
    return gate({
      name: "email.resend_configured",
      category: "email",
      label: "Resend transactional email configured",
      status: "fail",
      severity: "blocking",
      remediation:
        "Set RESEND_API_KEY and RESEND_FROM_EMAIL (or connect the Resend integration).",
    });
  }
}

function checkActiveGateway(snap: ActiveGatewaySnapshot | null): ReadinessGate[] {
  if (!snap) {
    return [
      gate({
        name: "payments.active_gateway_ready",
        category: "payments",
        label: "Active checkout gateway ready",
        status: "fail",
        severity: "blocking",
        remediation:
          "Could not read active gateway state. Verify CommerceSettings exists and APP_ENCRYPTION_KEY is set.",
        fixPath: "/admin/payments",
      }),
    ];
  }

  const out: ReadinessGate[] = [];

  out.push(
    gate({
      name: "payments.active_gateway_ready",
      category: "payments",
      label: `Active checkout gateway ready (${snap.activeLabel})`,
      status: snap.ready ? "pass" : "fail",
      severity: "blocking",
      remediation: snap.ready
        ? "OK"
        : `Fix blockers for ${snap.activeLabel}: ${snap.blockers.join("; ")}`,
      details: snap.blockers.length ? snap.blockers.join("; ") : null,
      fixPath:
        snap.active === "CYBERSOURCE"
          ? "/admin/payments?tab=cybersource"
          : "/admin/payments?tab=authnet",
    }),
  );

  // OKÜ Panama spec: Cybersource MUST be the active checkout gateway and
  // ready (configured, enabled, decryptable, recent passing test). This is
  // a blocking launch gate — Authorize.net active in Panama is a NO_GO even
  // if it is otherwise healthy.
  const cs = snap.providers.CYBERSOURCE;
  const csActive = snap.active === "CYBERSOURCE";
  out.push(
    gate({
      name: "payments.cybersource_panama_active",
      category: "payments",
      label: "Cybersource active for OKÜ Panama",
      status: csActive && cs.selectable ? "pass" : "fail",
      severity: "blocking",
      remediation: csActive
        ? cs.selectable
          ? "OK"
          : `Cybersource is active but not selectable: ${cs.blockers.join("; ")}`
        : cs.selectable
        ? `Cybersource is selectable but Authorize.net is the active gateway. Switch to Cybersource under /admin/payments → Active gateway.`
        : `Cybersource is not active AND not selectable: ${cs.blockers.join("; ")}`,
      details: cs.blockers.length ? cs.blockers.join("; ") : null,
      fixPath: "/admin/payments?tab=cybersource",
    }),
  );

  // Authorize.net is the inactive provider for Panama. Surface as
  // informational so operators can see it without it blocking GO.
  const an = snap.providers.AUTHORIZE_NET;
  out.push(
    gate({
      name: "payments.authnet_status",
      category: "payments",
      label: "Authorize.net status (informational)",
      status: an.configured
        ? an.selectable
          ? "pass"
          : "warn"
        : "warn",
      severity: "informational",
      remediation: an.configured
        ? an.selectable
          ? "Authorize.net is configured and selectable."
          : `Authorize.net configured but not selectable: ${an.blockers.join("; ")}`
        : "Authorize.net not configured. This is informational only when Cybersource is the active gateway.",
      details: an.blockers.length ? an.blockers.join("; ") : null,
      fixPath: "/admin/payments?tab=authnet",
    }),
  );

  return out;
}

function bansecoPlaceholder(): ReadinessGate {
  // Per task spec: surface as informational, never block GO. Waiting on the
  // official Banesco spec.
  return gate({
    name: "payments.banesco_payouts",
    category: "payments",
    label: "Banesco bulk payouts readiness",
    status: "warn",
    severity: "informational",
    remediation:
      "Waiting on Banesco spec — bulk-payout readiness will be wired up once the official format lands.",
  });
}

export async function getLaunchReadiness(): Promise<LaunchReadinessSnapshot> {
  const [
    dbGate,
    schemaGate,
    superadminGate,
    demoUsersGate,
    resendGate,
    activeGateway,
  ] = await Promise.all([
    checkDbReachable(),
    checkSchemaInSync(),
    checkSuperadminExists(),
    checkNoDemoUsers(),
    checkResend(),
    getActiveCheckoutGateway().catch(() => null),
  ]);

  const gates: ReadinessGate[] = [
    checkNodeEnv(),
    checkDemoModeOff(),
    checkEnvVar({
      name: "environment.database_url",
      varName: "DATABASE_URL",
      label: "DATABASE_URL set",
      category: "environment",
      remediation: "Set DATABASE_URL to the production Postgres connection string.",
    }),
    checkEnvVar({
      name: "auth.nextauth_secret",
      varName: "NEXTAUTH_SECRET",
      label: "NEXTAUTH_SECRET set",
      category: "auth",
      remediation:
        "Set NEXTAUTH_SECRET to a strong random string before launch.",
    }),
    checkEnvVar({
      name: "auth.nextauth_url",
      varName: "NEXTAUTH_URL",
      label: "NEXTAUTH_URL set",
      category: "auth",
      remediation: "Set NEXTAUTH_URL to the production base URL.",
    }),
    checkEnvVar({
      name: "auth.public_app_url",
      varName: "NEXT_PUBLIC_APP_URL",
      label: "NEXT_PUBLIC_APP_URL set",
      category: "auth",
      remediation:
        "Set NEXT_PUBLIC_APP_URL to the production base URL (used in emails and links).",
    }),
    checkAppEncryptionKey(),
    dbGate,
    schemaGate,
    superadminGate,
    demoUsersGate,
    resendGate,
    ...checkActiveGateway(activeGateway),
    bansecoPlaceholder(),
  ];

  const blockingFailed = gates.some(
    (g) => g.severity === "blocking" && g.status === "fail",
  );

  const snapshot: LaunchReadinessSnapshot = {
    gates,
    overall: blockingFailed ? "NO_GO" : "GO",
    checkedAt: new Date().toISOString(),
    activeGateway,
  };

  // Persist + prune best-effort. Never let a snapshot write break a readiness
  // read — the page must still render even if the DB write fails. We still
  // log so silent failure is observable in workflow logs / error capture.
  await persistSnapshot(snapshot).catch((err) => {
    console.error(
      "[launchReadiness] failed to persist snapshot",
      err instanceof Error ? err.message : err,
    );
  });

  return snapshot;
}

const SNAPSHOT_RETENTION_DAYS = 90;

async function persistSnapshot(snap: LaunchReadinessSnapshot): Promise<void> {
  const compactGates = snap.gates.map((g) => ({
    name: g.name,
    status: g.status,
    severity: g.severity,
  }));
  await prisma.launchReadinessSnapshot.create({
    data: {
      overall: snap.overall,
      gates: compactGates,
      checkedAt: new Date(snap.checkedAt),
    },
  });
  const cutoff = new Date(
    Date.now() - SNAPSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  await prisma.launchReadinessSnapshot.deleteMany({
    where: { checkedAt: { lt: cutoff } },
  });
}

export interface ReadinessHistoryGate {
  name: string;
  status: GateStatus;
  severity: GateSeverity;
}

export interface ReadinessHistoryEntry {
  id: string;
  overall: "GO" | "NO_GO";
  checkedAt: string;
  gates: ReadinessHistoryGate[];
}

const GATE_STATUSES: ReadonlySet<GateStatus> = new Set([
  "pass",
  "warn",
  "fail",
]);
const GATE_SEVERITIES: ReadonlySet<GateSeverity> = new Set([
  "blocking",
  "informational",
]);

/**
 * Runtime-validate a single gate entry from persisted JSON. Returns null for
 * anything that doesn't match the expected shape so malformed rows can't
 * leak into the UI (e.g. with missing color mapping or invalid severity).
 */
function decodeHistoryGate(raw: unknown): ReadinessHistoryGate | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const name = obj.name;
  const status = obj.status;
  const severity = obj.severity;
  if (typeof name !== "string" || name.length === 0) return null;
  if (typeof status !== "string" || !GATE_STATUSES.has(status as GateStatus)) {
    return null;
  }
  if (
    typeof severity !== "string" ||
    !GATE_SEVERITIES.has(severity as GateSeverity)
  ) {
    return null;
  }
  return {
    name,
    status: status as GateStatus,
    severity: severity as GateSeverity,
  };
}

function decodeHistoryGates(raw: unknown): ReadinessHistoryGate[] {
  if (!Array.isArray(raw)) return [];
  const out: ReadinessHistoryGate[] = [];
  for (const entry of raw) {
    const decoded = decodeHistoryGate(entry);
    if (decoded) out.push(decoded);
  }
  return out;
}

/** Most recent snapshots first. */
export async function getRecentLaunchReadinessSnapshots(
  limit = 20,
): Promise<ReadinessHistoryEntry[]> {
  try {
    const rows = await prisma.launchReadinessSnapshot.findMany({
      orderBy: { checkedAt: "desc" },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      overall: r.overall === "GO" ? "GO" : "NO_GO",
      checkedAt: r.checkedAt.toISOString(),
      gates: decodeHistoryGates(r.gates),
    }));
  } catch (err) {
    console.error(
      "[launchReadiness] failed to load snapshot history",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}
