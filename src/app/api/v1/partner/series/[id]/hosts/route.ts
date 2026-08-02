import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePartnerForSeries, PartnerAuthError } from "@/lib/partnerAuth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requirePartnerForSeries(id);

    const hosts = await prisma.seriesHost.findMany({
      where: { seriesId: id },
      orderBy: { sortOrder: "asc" },
      include: {
        entity: {
          include: {
            linkedUser: { select: { id: true, name: true, email: true } },
            linkedInfluencerProfile: { select: { id: true, handle: true } },
          },
        },
      },
    });
    return NextResponse.json({ ok: true, hosts });
  } catch (e: any) {
    if (e instanceof PartnerAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[partner/hosts] GET", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Add a CO_HOST to the series. Partners may only attach CO_HOST entities,
 * never PRIMARY_HOST / SPONSOR / BRAND_PARTNER (admin-only roles).
 *
 * Two ways to identify the co-host:
 *  - { entityId } — link an existing Entity directly
 *  - { email, displayName? } — find or create a PERSON Entity for that email,
 *    auto-linking it to a User if one already exists.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: seriesId } = await params;
    const auth = await requirePartnerForSeries(seriesId);
    if (!auth.isSeriesPartner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const commissionShareBps: number | null =
      typeof body.commissionShareBps === "number" ? body.commissionShareBps : null;
    if (commissionShareBps != null && (commissionShareBps < 0 || commissionShareBps > 10000)) {
      return NextResponse.json({ error: "commissionShareBps must be 0..10000" }, { status: 400 });
    }

    let entityId: string | null = body.entityId ?? null;

    if (!entityId) {
      const email = String(body.email ?? "").trim().toLowerCase();
      const displayName: string | null = body.displayName ? String(body.displayName).trim() : null;
      if (!email || !EMAIL_RE.test(email)) {
        return NextResponse.json({ error: "Provide entityId or a valid email" }, { status: 400 });
      }

      const linkedUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true, name: true },
      });

      // To avoid creating orphaned, un-claimable Entity rows for emails
      // that don't yet correspond to a real user, partners may only add
      // co-hosts for users who already have an account.
      if (!linkedUser) {
        return NextResponse.json(
          { error: "No user found for that email. Ask them to create an account first, then add them as a co-host." },
          { status: 404 },
        );
      }

      const existing = await prisma.entity.findUnique({ where: { linkedUserId: linkedUser.id } });
      if (existing) {
        entityId = existing.id;
      } else {
        const created = await prisma.entity.create({
          data: {
            type: "PERSON",
            displayName: displayName ?? linkedUser.name ?? email,
            linkedUserId: linkedUser.id,
          },
          select: { id: true },
        });
        entityId = created.id;
      }
    }

    const host = await prisma.seriesHost.upsert({
      where: { seriesId_entityId: { seriesId, entityId: entityId! } },
      create: {
        seriesId,
        entityId: entityId!,
        role: "CO_HOST",
        isFrontFacing: body.isFrontFacing ?? true,
        commissionShareBps,
        sortOrder: body.sortOrder ?? 0,
      },
      update: {
        role: "CO_HOST",
        isFrontFacing: body.isFrontFacing ?? true,
        commissionShareBps,
      },
      include: {
        entity: {
          include: {
            linkedUser: { select: { id: true, name: true, email: true } },
            linkedInfluencerProfile: { select: { id: true, handle: true } },
          },
        },
      },
    });

    return NextResponse.json({ ok: true, host }, { status: 201 });
  } catch (e: any) {
    if (e instanceof PartnerAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[partner/hosts] POST", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
