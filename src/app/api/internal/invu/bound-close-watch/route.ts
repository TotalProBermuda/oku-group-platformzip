import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { syncRecentBoundCloseouts } from "@/server/services/invu/invuClosedOrdersService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasValidWatchSecret(request: NextRequest): boolean {
  const secret = process.env.INVU_CLOSE_WATCH_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!secret || !supplied) return false;

  const expected = Buffer.from(secret);
  const received = Buffer.from(supplied);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

// Called by the single scheduled GitHub Action. It intentionally has no
// session auth because schedulers have no browser session; the dedicated
// secret is required instead. The watcher itself only performs INVU reads.
export async function POST(request: NextRequest) {
  if (!process.env.INVU_CLOSE_WATCH_SECRET) {
    return NextResponse.json({ ok: false, error: "Close watcher is not configured" }, { status: 503 });
  }
  if (!hasValidWatchSecret(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncRecentBoundCloseouts({ days: 7, limit: 10 });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[invu-close-watch] run failed", error);
    return NextResponse.json({ ok: false, error: "Close watcher failed" }, { status: 502 });
  }
}
