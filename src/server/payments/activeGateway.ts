/**
 * Payments P4 / P5 / P5a — Active checkout gateway service.
 *
 * Owns the read/write logic for `CommerceSettings.activeCheckoutGateway`
 * and computes the runtime "is this gateway ready for checkout?" picture
 * used by `/admin/payments`, `/api/v1/admin/launch-readiness`, and the
 * `assertActiveGatewayReady()` guard at `/api/v1/checkout/confirm` and
 * `/api/v1/checkout/demo`.
 *
 * Refund/void destinations are NOT routed through here — those continue to
 * read `Payment.provider` per persisted record (see refunds skill).
 *
 * P5a — adds:
 *   - "live adapter" sentinel so a future stub can hard-block selectability
 *   - last-test-passed gating with recency windows
 *     (7d sandbox / 24h production)
 *   - `environment` + `lastTest` on per-provider readiness
 *   - aggregated `activeEnvironment` on the snapshot
 */
import { prisma } from "@/lib/prisma";
import {
  decryptSecret,
  isEncryptionAvailable,
} from "@/server/security/encryption";
import { getCommerceSettings } from "@/server/commerce/commerceSettings";

export type ActiveProvider = "AUTHORIZE_NET" | "CYBERSOURCE";

export const PROVIDER_LABELS: Record<ActiveProvider, string> = {
  AUTHORIZE_NET: "Authorize.net",
  CYBERSOURCE: "Cybersource",
};

/**
 * Legacy export retained for callers that still import the symbol. Cybersource
 * is no longer hard-locked after Payments P5 — selectability is now driven by
 * the same readiness checks as Authorize.net (configured + enabled +
 * decryptable + recent passing test).
 */
export const CYBERSOURCE_LOCKED_REASON = "";

/**
 * Sentinel for the Cybersource live-money-movement adapter. Flip this to
 * `false` if any of charge/refund/void in `cybersourceAdapter` /
 * `src/server/cybersource/transactions.ts` is ever stubbed out — that will
 * surface the exact blocker text below in selectability and the launch
 * readiness banner uniformly.
 */
const CYBERSOURCE_ADAPTER_LIVE = true;
const CYBERSOURCE_ADAPTER_INCOMPLETE_BLOCKER =
  "Cybersource selected but live money movement adapter is incomplete.";

/** Recency windows for the most-recent passing test connection. */
const TEST_RECENCY_MS = {
  sandbox: 7 * 24 * 3600 * 1000, // 7 days
  production: 24 * 3600 * 1000, // 24 hours
};

export interface GatewayReadiness {
  provider: ActiveProvider;
  label: string;
  configured: boolean;
  blockers: string[];
  source: "db" | "env" | null;
  /** Effective environment for THIS provider, from its credential row. */
  environment: "sandbox" | "test" | "production" | null;
  /** Most recent test connection result; null if never tested. */
  lastTest: {
    passed: boolean;
    testedAt: string | null;
  } | null;
  /** Whether this provider is allowed to be SELECTED as active checkout gateway. */
  selectable: boolean;
  /** When selectable is false, why. */
  lockedReason: string | null;
}

export interface ActiveGatewaySnapshot {
  active: ActiveProvider;
  activeLabel: string;
  /** Effective environment for the active provider (sandbox|test|production). */
  activeEnvironment: "sandbox" | "test" | "production" | null;
  /** Composite readiness for the currently active provider. */
  ready: boolean;
  blockers: string[];
  source: "db" | "env" | null;
  /** Per-provider readiness for UI / readiness API. */
  providers: Record<ActiveProvider, GatewayReadiness>;
  updatedAt: string | null;
}

function envPresent(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.length > 0;
}

/**
 * Translate (passed?, testedAt?, env) into a human blocker string or null.
 * - never tested or last test failed → "<provider> selected but test connection has not passed."
 * - older than 24h in production → re-run before cutover blocker
 * - older than 7d in sandbox/test → re-run blocker
 */
function evaluateTestRecency(opts: {
  passed: boolean;
  testedAt: Date | null;
  environment: "sandbox" | "test" | "production" | null;
  providerLabel: string;
}): string | null {
  if (!opts.passed || !opts.testedAt) {
    return `${opts.providerLabel} selected but test connection has not passed.`;
  }
  const isProd = opts.environment === "production";
  const window = isProd ? TEST_RECENCY_MS.production : TEST_RECENCY_MS.sandbox;
  const age = Date.now() - opts.testedAt.getTime();
  if (age > window) {
    if (isProd) {
      return `${opts.providerLabel} selected but the last passing test is older than 24 hours; re-run the test before production cutover.`;
    }
    return `${opts.providerLabel} selected but the last passing test is older than 7 days; re-run the test.`;
  }
  return null;
}

async function getAuthNetLastTest(): Promise<{
  passed: boolean;
  testedAt: Date | null;
}> {
  const last = await prisma.auditLog
    .findFirst({
      where: {
        action: {
          in: [
            "launch.readiness.authnet_test",
            "launch.readiness.authnet_test.failed",
          ],
        },
      },
      orderBy: { createdAt: "desc" },
    })
    .catch(() => null);
  if (!last) return { passed: false, testedAt: null };
  const m = (last.metadata ?? {}) as Record<string, unknown>;
  const passed =
    last.action === "launch.readiness.authnet_test" && m.ok === true;
  return { passed, testedAt: last.createdAt };
}

async function readAuthNetReadiness(): Promise<GatewayReadiness> {
  const cred = await prisma.paymentGatewayCredential
    .findUnique({ where: { provider: "AUTHORIZE_NET" } })
    .catch(() => null);

  let dbUsable = false;
  if (
    cred &&
    cred.isActive &&
    cred.enableGateway &&
    cred.apiLoginIdEncrypted &&
    cred.transactionKeyEncrypted &&
    isEncryptionAvailable()
  ) {
    try {
      decryptSecret(cred.apiLoginIdEncrypted);
      decryptSecret(cred.transactionKeyEncrypted);
      dbUsable = true;
    } catch {
      dbUsable = false;
    }
  }

  const envOk =
    envPresent("AUTHORIZE_NET_API_LOGIN_ID") &&
    envPresent("AUTHORIZE_NET_TRANSACTION_KEY");

  const blockers: string[] = [];
  if (!dbUsable && !envOk) {
    blockers.push(
      "No usable Authorize.net credential (no encrypted DB row and env vars missing)",
    );
  }
  if (cred && (!cred.isActive || !cred.enableGateway) && !envOk) {
    blockers.push(
      "Authorize.net DB credential exists but is disabled and env vars missing",
    );
  }

  const source: "db" | "env" | null = dbUsable ? "db" : envOk ? "env" : null;
  const environment: GatewayReadiness["environment"] = dbUsable
    ? cred!.environment === "production"
      ? "production"
      : "sandbox"
    : envOk
    ? (process.env.AUTHORIZE_NET_ENV || "").toLowerCase() === "production"
      ? "production"
      : "sandbox"
    : null;

  const configured = dbUsable || envOk;

  // Last-test gating: we still surface the readiness object even if creds are
  // missing — but we only add the test-recency blocker when creds are usable;
  // otherwise the credential blocker is already the user's first signal.
  let lastTest: GatewayReadiness["lastTest"] = null;
  if (configured) {
    const t = await getAuthNetLastTest();
    lastTest = {
      passed: t.passed,
      testedAt: t.testedAt ? t.testedAt.toISOString() : null,
    };
    const recencyBlocker = evaluateTestRecency({
      passed: t.passed,
      testedAt: t.testedAt,
      environment,
      providerLabel: PROVIDER_LABELS.AUTHORIZE_NET,
    });
    if (recencyBlocker) blockers.push(recencyBlocker);
  }

  return {
    provider: "AUTHORIZE_NET",
    label: PROVIDER_LABELS.AUTHORIZE_NET,
    configured,
    blockers,
    source,
    environment,
    lastTest,
    selectable: configured && blockers.length === 0,
    lockedReason: blockers[0] ?? null,
  };
}

async function readCybersourceReadiness(): Promise<GatewayReadiness> {
  const cred = await prisma.cybersourceGatewayCredential
    .findUnique({ where: { provider: "CYBERSOURCE" } })
    .catch(() => null);

  let dbUsable = false;
  if (
    cred &&
    cred.enabled &&
    cred.merchantIdEncrypted &&
    cred.keyIdEncrypted &&
    cred.sharedSecretEncrypted &&
    isEncryptionAvailable()
  ) {
    try {
      decryptSecret(cred.merchantIdEncrypted);
      decryptSecret(cred.keyIdEncrypted);
      decryptSecret(cred.sharedSecretEncrypted);
      dbUsable = true;
    } catch {
      dbUsable = false;
    }
  }

  const blockers: string[] = [];
  if (!isEncryptionAvailable()) {
    blockers.push(
      "APP_ENCRYPTION_KEY missing — cannot decrypt Cybersource credentials",
    );
  }
  if (!cred) {
    blockers.push("Cybersource credentials not saved");
  } else if (
    !cred.merchantIdEncrypted ||
    !cred.keyIdEncrypted ||
    !cred.sharedSecretEncrypted
  ) {
    blockers.push("Cybersource credential row is incomplete");
  } else if (!cred.enabled) {
    blockers.push("Cybersource is configured but disabled");
  } else if (!dbUsable) {
    blockers.push(
      "Cybersource credentials cannot be decrypted with the current APP_ENCRYPTION_KEY",
    );
  }

  // Live-adapter sentinel — applies uniformly to selectability + readiness
  // banner. Flip CYBERSOURCE_ADAPTER_LIVE to false to surface this blocker.
  if (!CYBERSOURCE_ADAPTER_LIVE) {
    blockers.push(CYBERSOURCE_ADAPTER_INCOMPLETE_BLOCKER);
  }

  const environment: GatewayReadiness["environment"] = cred
    ? cred.environment === "production"
      ? "production"
      : "test"
    : null;

  // Last-test gating from the credential row.
  let lastTest: GatewayReadiness["lastTest"] = null;
  if (dbUsable && cred) {
    const passed = cred.lastTestStatus === "passed";
    const testedAt = cred.lastTestedAt ?? null;
    lastTest = {
      passed,
      testedAt: testedAt ? testedAt.toISOString() : null,
    };
    const recencyBlocker = evaluateTestRecency({
      passed,
      testedAt,
      environment,
      providerLabel: PROVIDER_LABELS.CYBERSOURCE,
    });
    if (recencyBlocker) blockers.push(recencyBlocker);
  }

  return {
    provider: "CYBERSOURCE",
    label: PROVIDER_LABELS.CYBERSOURCE,
    configured: dbUsable,
    blockers,
    source: dbUsable ? "db" : null,
    environment,
    lastTest,
    selectable: dbUsable && blockers.length === 0,
    lockedReason: blockers[0] ?? null,
  };
}

export async function getActiveCheckoutGateway(): Promise<ActiveGatewaySnapshot> {
  const [settings, authNet, cybersource] = await Promise.all([
    getCommerceSettings(),
    readAuthNetReadiness(),
    readCybersourceReadiness(),
  ]);

  const active = (settings.activeCheckoutGateway ??
    "AUTHORIZE_NET") as ActiveProvider;
  const providers = {
    AUTHORIZE_NET: authNet,
    CYBERSOURCE: cybersource,
  };
  const r = providers[active];
  return {
    active,
    activeLabel: PROVIDER_LABELS[active],
    activeEnvironment: r.environment,
    ready: r.configured && r.blockers.length === 0,
    blockers: r.blockers,
    source: r.source,
    providers,
    updatedAt: settings.updatedAt?.toISOString() ?? null,
  };
}

/**
 * Hard guard for `/api/v1/checkout/confirm` and `/api/v1/checkout/demo`.
 * Returns `null` when the active gateway is ready, otherwise a plain object
 * with the single-line reason and a 503 status. Callers should turn that into
 * a NextResponse.
 */
export async function assertActiveGatewayReady(): Promise<
  | null
  | { status: 503; error: string; provider: ActiveProvider }
> {
  const snap = await getActiveCheckoutGateway();
  if (snap.ready) return null;
  const reason =
    snap.blockers[0] ?? `${snap.activeLabel} is not ready for checkout`;
  return {
    status: 503,
    error: `Checkout unavailable: ${reason}`,
    provider: snap.active,
  };
}

/**
 * Persist a new active checkout gateway. Validates per-provider readiness
 * (configured + enabled + decryptable + passing recent test). The PATCH route
 * owns authz, audit, and the production-confirm checkbox enforcement.
 */
export async function setActiveCheckoutGateway(
  next: ActiveProvider,
): Promise<ActiveGatewaySnapshot> {
  const snap = await getActiveCheckoutGateway();
  const target = snap.providers[next];
  if (!target.selectable) {
    const reason =
      target.lockedReason ??
      target.blockers[0] ??
      `${PROVIDER_LABELS[next]} is not ready for activation`;
    const e = new Error(reason) as Error & { status: number };
    e.status = 400;
    throw e;
  }
  await prisma.commerceSettings.update({
    where: { id: "global" },
    data: { activeCheckoutGateway: next },
  });
  return getActiveCheckoutGateway();
}
