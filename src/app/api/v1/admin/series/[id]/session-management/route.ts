import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { applySessionManagement, previewSessionManagement } from "@/server/series/sessionManagement";
import { defaultField, effectiveField, fieldKeys, inventory, loadSessionState } from "@/server/series/sessionState";
import { Prisma } from "@prisma/client";
import { finishEventSave } from "@/server/i18n/eventTranslationRequest";

function failure(error: unknown) {
  if (error instanceof z.ZodError) return NextResponse.json({ ok: false, error: error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  if (error instanceof SyntaxError) return NextResponse.json({ ok: false, error: "Invalid JSON request." }, { status: 400 });
  if (error && typeof error === "object" && "code" in error && error.code === "P2034")
    return NextResponse.json({ ok: false, error: "A concurrent change was detected. Preview again before saving." }, { status: 409 });
  const status = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 500;
  if (status >= 500) console.error("Session management failed", error);
  return NextResponse.json({ ok: false, error: status < 500 && error instanceof Error ? error.message : "Session management is unavailable. Check that its additive schema has been installed in this environment." }, { status });
}
async function authorize() {
  const auth = await requireSession();
  requirePermission(auth.roles, "admin:experiences:write");
  return auth;
}
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorize();
    const { id } = await params;
    const data = await prisma.$transaction(async tx => {
      const state = await loadSessionState(tx, id);
      const fields = fieldKeys(state);
      const [entities, profiles, sponsorTiers, referrals] = await Promise.all([
        tx.entity.findMany({ select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }),
        tx.profile.findMany({ where: { status: "ACTIVE" }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }),
        tx.sponsorTier.findMany({ where: { isActive: true }, select: { id: true, label: true }, orderBy: { displayOrder: "asc" } }),
        auth.roles.includes("SUPERADMIN") ? tx.referralAssignment.findMany({ where: { OR: [
          { scopeType: "GLOBAL" }, { scopeType: "SERIES", scopeId: id },
          ...(state.series.venueId ? [{ scopeType: "VENUE" as const, scopeId: state.series.venueId }] : []),
        ] }, select: { id: true, scopeType: true, scopeId: true, isCommissionEligible: true, status: true, isActive: true, referralActor: { select: { displayName: true, status: true } } } }) : Promise.resolve([]),
      ]);
      return {
        fields, defaults: Object.fromEntries(fields.map(k => [k, defaultField(state, k)])),
        sessions: state.sessions.map(s => ({
          id: s.id, title: s.title ?? state.series.title, startsAt: s.startsAt, endsAt: s.endsAt, status: s.status,
          hasTicketHistory: s.soldCount > 0 || s.tickets.length > 0 || s.Order.length > 0,
          inventory: inventory(s), fields: Object.fromEntries(fields.map(k => [k, effectiveField(state, s, k)])),
        })),
        options: { tickets: state.series.ticketTypes.map(t => ({ id: t.id, name: t.name })), entities, profiles, sponsorTiers,
          referrals: referrals.map(({ referralActor, ...row }) => ({ ...row, actorName: referralActor.displayName, actorStatus: referralActor.status })) },
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return NextResponse.json({ ok: true, data });
  } catch (error) { return failure(error); }
}
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorize(), { id } = await params;
    const data = await previewSessionManagement(id, auth.userId, auth.roles, await req.json());
    return NextResponse.json({ ok: true, data });
  } catch (error) { return failure(error); }
}
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorize(), { id } = await params;
    const input = z.object({ previewId: z.string().min(1).max(100), requestId: z.string().uuid() }).strict().parse(await req.json());
    const data = await applySessionManagement(id, auth.userId, auth.roles, input.previewId, input.requestId);
    return finishEventSave(id, { ok: true, data }, req);
  } catch (error) { return failure(error); }
}
