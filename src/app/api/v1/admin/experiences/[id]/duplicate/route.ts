import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

type SeriesWithRelations = Prisma.SeriesGetPayload<{
  include: {
    ticketTypes: { include: { pricingRules: true }; orderBy: { displayOrder: "asc" } };
    sessions: { orderBy: { startsAt: "asc" } };
  };
}>;

function isSuperAdmin(session: { user?: { roles?: string[] } } | null): boolean {
  return (session?.user?.roles ?? []).includes("SUPERADMIN");
}

/** Shift a date by preserving its offset from anchorOriginal, rebased to anchorNew. */
function shiftDate(d: Date, anchorOriginal: Date, anchorNew: Date): Date {
  const offsetMs = d.getTime() - anchorOriginal.getTime();
  return new Date(anchorNew.getTime() + offsetMs);
}

function shiftNullable(d: Date | null, anchorOriginal: Date, anchorNew: Date): Date | null {
  if (!d) return null;
  return shiftDate(d, anchorOriginal, anchorNew);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isSuperAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { title?: string };

  const original: SeriesWithRelations | null = await prisma.series.findUnique({
    where: { id },
    include: {
      ticketTypes: { include: { pricingRules: true }, orderBy: { displayOrder: "asc" } },
      sessions: { orderBy: { startsAt: "asc" } },
    },
  });

  if (!original) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const newTitle = (body.title?.trim()) || `${original.title} (Copy)`;

  const now = new Date();

  // Anchor: the original series start (or first session, or now).
  const anchorOriginal: Date = original.startsAt
    ?? (original.sessions[0]?.startsAt)
    ?? now;

  // New anchor: preserve the same forward distance from today as the original anchor has.
  // delta = anchorOriginal - now (how far in the future/past the original is).
  // If positive (future event): copy begins at the same future horizon.
  // If negative (past event): copy begins |delta| days from today, so the admin
  //   gets the same scheduling window they originally had.
  const deltaMs = anchorOriginal.getTime() - now.getTime();
  const anchorNew = new Date(now.getTime() + Math.abs(deltaMs));

  let slug = `${original.slug}-copy`;
  let attempt = 0;
  while (await prisma.series.findUnique({ where: { slug } })) {
    attempt++;
    slug = `${original.slug}-copy-${attempt}`;
  }

  const newSeries = await prisma.series.create({
    data: {
      title: newTitle,
      subtitle: original.subtitle,
      slug,
      description: original.description,
      category: original.category,
      venue: original.venue,
      hostType: original.hostType,
      city: original.city,
      country: original.country,
      venueAddress: original.venueAddress,
      heroImageUrl: original.heroImageUrl,
      galleryJson: original.galleryJson ?? Prisma.JsonNull,
      capacityTotal: original.capacityTotal,
      capacitySold: 0,
      capacityReserved: 0,
      availableSeatsMode: original.availableSeatsMode,
      attendeeListMode: original.attendeeListMode,
      showCountdown: original.showCountdown,
      countdownLabel: original.countdownLabel,
      publicReleaseAt: shiftNullable(original.publicReleaseAt, anchorOriginal, anchorNew),
      earlyReleaseAt: shiftNullable(original.earlyReleaseAt, anchorOriginal, anchorNew),
      startsAt: shiftNullable(original.startsAt, anchorOriginal, anchorNew),
      endsAt: shiftNullable(original.endsAt, anchorOriginal, anchorNew),
      membershipRuleMode: original.membershipRuleMode,
      minMembershipTier: original.minMembershipTier,
      waitlistEnabled: original.waitlistEnabled,
      newsletterCaptureEnabled: original.newsletterCaptureEnabled,
      isFeatured: false,
      communityUrl: original.communityUrl,
      seoTitle: original.seoTitle,
      seoDescription: original.seoDescription,
      status: "DRAFT",
      seriesVisibilityMode: original.seriesVisibilityMode,
      allowInviteOnlyAccess: original.allowInviteOnlyAccess,
      allowReferrerAccess: original.allowReferrerAccess,
      salePriorityMode: original.salePriorityMode,
      isFounderOnly: original.isFounderOnly,
      ticketTypes: {
        create: original.ticketTypes.map((tt) => ({
          name: tt.name,
          description: tt.description,
          tierCode: tt.tierCode,
          priceCents: tt.priceCents,
          currency: tt.currency,
          maxPerOrder: tt.maxPerOrder,
          minPerOrder: tt.minPerOrder,
          typeCapacity: tt.typeCapacity,
          soldCount: 0,
          displayOrder: tt.displayOrder,
          saleStartsAt: shiftNullable(tt.saleStartsAt, anchorOriginal, anchorNew),
          saleEndsAt: shiftNullable(tt.saleEndsAt, anchorOriginal, anchorNew),
          visibilityMode: tt.visibilityMode,
          requiresMembership: tt.requiresMembership,
          earlyAccessOnly: tt.earlyAccessOnly,
          ticketStatus: "ACTIVE" as const,
          pricingRules: tt.pricingRules.length
            ? {
                create: tt.pricingRules.map((pr) => ({
                  ruleType: pr.ruleType,
                  conditionJson: pr.conditionJson,
                  actionJson: pr.actionJson,
                  priority: pr.priority,
                  isActive: pr.isActive,
                })),
              }
            : undefined,
        })),
      },
      sessions: {
        create: original.sessions.map((s) => ({
          title: s.title,
          startsAt: shiftDate(s.startsAt, anchorOriginal, anchorNew),
          endsAt: shiftDate(s.endsAt, anchorOriginal, anchorNew),
          capacity: s.capacity,
          soldCount: 0,
          status: "SCHEDULED" as const,
          overridesSeriesHost: false,
          inheritsSeriesSponsors: s.inheritsSeriesSponsors,
          giftBagEnabled: s.giftBagEnabled,
          streetsideEnabled: s.streetsideEnabled,
        })),
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: (session as { user: { id: string } }).user.id,
      action: "EXPERIENCE_DUPLICATED",
      metadata: { originalId: id, newId: newSeries.id },
    },
  });

  return NextResponse.json({ series: newSeries });
}
