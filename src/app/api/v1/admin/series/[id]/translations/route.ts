import { NextResponse } from "next/server";
import { z } from "zod/v3";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { checkRateLimitAsync, rateLimitedResponse } from "@/server/rateLimit";
import { eventTranslationStatus, processEventTranslationRequest } from "@/server/i18n/eventTranslationRequest";

export const maxDuration = 30;
type Context = { params: Promise<{ id: string }> };
function failure(error: unknown) {
  const status = typeof (error as { status?: number })?.status === "number"
    ? (error as { status: number }).status : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 503;
  return NextResponse.json({ ok: false, error: status === 503
    ? "Saved content is unchanged. Translation is unavailable; retry later."
    : status === 400 ? "Invalid translation request." : "Request denied." }, { status });
}
export async function GET(_req: Request, { params }: Context) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:experiences:write");
    return NextResponse.json({ ok: true, translation: await eventTranslationStatus((await params).id) });
  } catch (error) { return failure(error); }
}
export async function POST(req: Request, { params }: Context) {
  try {
    const { roles, userId } = await requireSession();
    requirePermission(roles, "admin:experiences:write");
    const rate = await checkRateLimitAsync({ key: `event-translation:${userId}`, limit: 20,
      windowMs: 60_000, requireDistributed: false });
    if (!rate.ok) return rateLimitedResponse(rate);
    const input = z.object({ retry: z.boolean().optional() }).strict().parse(await req.json());
    const translation = await processEventTranslationRequest((await params).id, { retry: input.retry, signal: req.signal });
    return NextResponse.json({ ok: true, translation });
  } catch (error) { return failure(error); }
}
