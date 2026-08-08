import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { EventReferrerCommissionMode, PartnerDelegateRole } from "@prisma/client";
import { PartnerAuthError, requireSeriesPartnerOnly } from "@/lib/partnerAuth";
import {
  createSeatAndIssueInvite,
  listSeatsForSeries,
} from "@/server/partnerSeats/service";
import { sendSeatInviteEmail } from "@/server/partnerSeats/email";
import { prisma } from "@/lib/prisma";

const SalesSchema = z
  .object({
    isReferrerEnabled: z.boolean(),
    commissionMode: z.nativeEnum(EventReferrerCommissionMode),
    flatAmountCents: z.number().int().min(0).nullable().optional(),
    perSeatAmountCents: z.number().int().min(0).nullable().optional(),
    percentageBps: z.number().int().min(0).max(10000).nullable().optional(),
  })
  .nullable()
  .optional();

const CreateSchema = z.object({
  invitedEmail: z.string().email(),
  invitedName: z.string().trim().min(1, "First and last name are required").max(120),
  roleCode: z.nativeEnum(PartnerDelegateRole),
  scope: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("series") }),
    z.object({ kind: z.literal("session"), sessionId: z.string().min(1) }),
  ]),
  sales: SalesSchema,
});

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    await requireSeriesPartnerOnly(id);
    const seats = await listSeatsForSeries(id);
    return NextResponse.json({ seats });
  } catch (e) {
    if (e instanceof PartnerAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: seriesId } = await ctx.params;
    const auth = await requireSeriesPartnerOnly(seriesId);
    if (!auth.partnerProfileId && !auth.isSuperadmin) {
      return NextResponse.json({ error: "No partner profile" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;

    // If session-scoped, the session must belong to this series.
    if (input.scope.kind === "session") {
      const sess = await prisma.session.findUnique({
        where: { id: input.scope.sessionId },
        select: { seriesId: true },
      });
      if (!sess || sess.seriesId !== seriesId) {
        return NextResponse.json({ error: "Session does not belong to series" }, { status: 400 });
      }
    }

    // Resolve partnerId — if superadmin acts on a series with no partner, use auth.series.partnerId.
    const partnerId = auth.partnerProfileId ?? auth.series.partnerId;
    if (!partnerId) {
      return NextResponse.json({ error: "Series has no partner" }, { status: 400 });
    }

    // Sales-enabled seats must be series-scoped (matches how influencer
    // attribution works at the series level).
    if (input.sales?.isReferrerEnabled && input.scope.kind !== "series") {
      return NextResponse.json(
        { error: "Sales-enabled seats must be series-scoped" },
        { status: 400 }
      );
    }

    const issued = await createSeatAndIssueInvite({
      partnerId,
      createdByUserId: auth.userId,
      scope:
        input.scope.kind === "series"
          ? { seriesId }
          : { sessionId: input.scope.sessionId, seriesId },
      invitedEmail: input.invitedEmail,
      invitedName: input.invitedName ?? null,
      roleCode: input.roleCode,
      sales: input.sales ?? null,
    });

    // Resolve display info for the email.
    const partner = await prisma.partnerProfile.findUnique({
      where: { id: partnerId },
      select: { name: true },
    });
    const scopeLabel =
      input.scope.kind === "series"
        ? auth.series.title
        : (await prisma.session.findUnique({
            where: { id: input.scope.sessionId },
            select: { title: true, startsAt: true },
          }).then((s) =>
            s
              ? `${auth.series.title} — ${s.title ?? new Date(s.startsAt).toLocaleDateString()}`
              : auth.series.title
          ));

    const emailResult = await sendSeatInviteEmail({
      toEmail: input.invitedEmail,
      toName: input.invitedName ?? null,
      rawToken: issued.rawToken,
      roleCode: input.roleCode,
      partnerName: partner?.name ?? "OKÜ Partner",
      scopeLabel: scopeLabel ?? auth.series.title,
      expiresAt: issued.expiresAt,
    });

    return NextResponse.json(
      {
        seatId: issued.seatId,
        emailSent: emailResult.sent,
        emailError: emailResult.reason ?? null,
        previewLink: emailResult.previewLink,
      },
      { status: 201 }
    );
  } catch (e) {
    if (e instanceof PartnerAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    );
  }
}
