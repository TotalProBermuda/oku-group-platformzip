import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/server/auth/adminGuard";
import {
  listSecurityAlerts,
  summarizeAlerts,
  type AlertPattern,
  type AlertSeverity,
} from "@/server/security/listSecurityAlerts";
import { scrubErrorMessage } from "@/server/security/logScrub";

const VALID_SEVERITY: ReadonlySet<string> = new Set(["info", "warn", "critical"]);
const VALID_PATTERN: ReadonlySet<string> = new Set(["A", "B", "C", "D", "E", "F"]);

export async function GET(req: Request) {
  try {
    await requireAdminPermission(req, "admin:security:read");

    const url = new URL(req.url);
    const lookbackHoursRaw = url.searchParams.get("lookbackHours");
    const lookbackHours = lookbackHoursRaw
      ? Math.max(1, Math.min(24 * 30, Number.parseInt(lookbackHoursRaw, 10) || 0))
      : 24 * 7;

    const sevRaw = url.searchParams.get("severity");
    const patRaw = url.searchParams.get("pattern");
    const severity =
      sevRaw && VALID_SEVERITY.has(sevRaw) ? (sevRaw as AlertSeverity) : undefined;
    const pattern =
      patRaw && VALID_PATTERN.has(patRaw) ? (patRaw as AlertPattern) : undefined;

    const rows = await listSecurityAlerts({
      lookbackMs: lookbackHours * 60 * 60 * 1000,
      severity,
      pattern,
    });
    const summary = summarizeAlerts(rows);
    return NextResponse.json({
      ok: true,
      lookbackHours,
      summary,
      alerts: rows,
    });
  } catch (e: unknown) {
    const status = (e as { status?: number })?.status ?? 500;
    return NextResponse.json(
      { ok: false, error: scrubErrorMessage(e) },
      { status },
    );
  }
}
