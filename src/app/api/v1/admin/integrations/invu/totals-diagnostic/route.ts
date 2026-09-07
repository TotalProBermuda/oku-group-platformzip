import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/server/services/invu/invuEncryptionService";
import { probeInvoiceTotals } from "@/lib/invu/client";

function isSuperadmin(session: unknown): boolean {
  const s = session as { user?: { roles?: string[] } } | null;
  return !!s?.user?.roles?.includes("SUPERADMIN");
}

/**
 * A deliberately narrow production diagnostic for INVU's documented
 * `OrdenesAllTotales` endpoint. It verifies capability without exposing a
 * token, raw provider payload, financial amounts, or customer data.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isSuperadmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const venueId = typeof body?.venueId === "string" ? body.venueId : "";
  const boundOrderId = typeof body?.boundOrderId === "string" ? body.boundOrderId.trim() : "";
  if (!venueId || !boundOrderId) {
    return NextResponse.json({ error: "venueId and boundOrderId are required" }, { status: 400 });
  }

  const credential = await prisma.invuIntegrationCredential.findFirst({
    where: { venueId, status: "CONNECTED", isEnabled: true },
    select: { accessTokenEncrypted: true, apiPasswordEncrypted: true },
  });
  const encrypted = credential?.accessTokenEncrypted ?? credential?.apiPasswordEncrypted;
  if (!encrypted) {
    return NextResponse.json({ error: "No connected INVU credential for this venue" }, { status: 422 });
  }

  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  try {
    const diagnostic = await probeInvoiceTotals(decrypt(encrypted), boundOrderId, fromDate, toDate);
    return NextResponse.json({
      endpoint: "invoiceTotals",
      windowDays: 7,
      ...diagnostic,
    });
  } catch {
    // Do not disclose unexpected provider, database, or cryptographic details.
    return NextResponse.json({ error: "Invoice totals diagnostic could not be completed" }, { status: 502 });
  }
}
