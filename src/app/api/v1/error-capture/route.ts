import { NextResponse } from "next/server";
import { captureException } from "@/server/errorReporting";
import { gatePublicPostAsync } from "@/server/rateLimit";

// Sink for client-side unhandled errors so they land in the same
// stderr stream as server captures. Rate-limited to keep a runaway
// browser-side error loop from drowning the log aggregator. Also
// applies a fingerprint-based dedup window so the same boundary +
// stack frame in the same URL doesn't fan out into N log lines.

const recentFingerprints = new Map<string, number>();
const DEDUP_WINDOW_MS = 60_000;
const DEDUP_MAX_KEYS = 500;

function fingerprint(message: string, stack: string | undefined, url: string | undefined): string {
  const topFrame = stack?.split("\n").find((l) => l.trim().length > 0)?.trim() ?? "";
  return `${message}|${topFrame}|${url ?? ""}`;
}

function isDuplicate(fp: string): boolean {
  const now = Date.now();
  // Opportunistic sweep before insertion.
  if (recentFingerprints.size > DEDUP_MAX_KEYS) {
    for (const [k, ts] of recentFingerprints) {
      if (now - ts > DEDUP_WINDOW_MS) recentFingerprints.delete(k);
    }
  }
  const last = recentFingerprints.get(fp);
  if (last !== undefined && now - last < DEDUP_WINDOW_MS) return true;
  recentFingerprints.set(fp, now);
  return false;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const gate = await gatePublicPostAsync(req, body, "error-capture", { limit: 30, windowMs: 60_000 });
  if (!gate.ok) return gate.response;

  const message = typeof body.message === "string" ? body.message : "Unknown client error";
  const stack = typeof body.stack === "string" ? body.stack : undefined;
  const url = typeof body.url === "string" ? body.url : undefined;
  const digest = typeof body.digest === "string" ? body.digest : undefined;
  const boundary = typeof body.boundary === "string" ? body.boundary : "client";

  if (isDuplicate(fingerprint(message, stack, url))) {
    // Silent ack — never tell the client we're suppressing, so a
    // misbehaving page can't probe the dedup window for fingerprinting.
    return NextResponse.json({ ok: true });
  }

  const err = new Error(message);
  if (stack) err.stack = stack;

  captureException(err, {
    source: "client",
    url,
    tags: { boundary, digest: digest ?? "none" },
  });

  return NextResponse.json({ ok: true });
}
