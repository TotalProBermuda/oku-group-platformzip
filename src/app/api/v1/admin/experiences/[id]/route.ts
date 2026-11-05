import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import type { Prisma } from "@prisma/client";
import { AvailableSeatsMode, AttendeeListMode, MembershipRuleMode, SeriesHostType, SeriesStatus, VenueKey } from "@prisma/client";
import { z } from "zod/v3";
import { prisma } from "@/lib/prisma";
import { syncTranslations } from "@/server/i18n/eventTranslations";
import { finishEventSave } from "@/server/i18n/eventTranslationRequest";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assertSeriesReadyForPublication, SeriesPublicationError, syncSeriesOccupanciesForStatus } from "@/server/series/publicationLifecycle";
import { seriesSocialLinksSchema } from "@/lib/socialLinks";
import { parseArtworkEdit } from "@/server/series/artworkInput";
import { legacySeriesWriteBlocked, managedWriteMessage } from "@/server/series/legacySessionGuard";

function isAdmin(session: Session | null) {
  return session?.user?.roles?.some((r: string) => ["SUPERADMIN","FB_DIRECTOR"].includes(r));
}

const SeriesPatchSchema = z.object({
  title: z.string().min(1).optional(),
  subtitle: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  venue: z.nativeEnum(VenueKey).nullable().optional(),
  venueId: z.string().nullable().optional(),
  spaceId: z.string().nullable().optional(),
  hostType: z.nativeEnum(SeriesHostType).optional(),
  influencerId: z.string().nullable().optional(),
  partnerId: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  venueAddress: z.string().nullable().optional(),
  heroImageUrl: z.string().nullable().optional(),
  capacityTotal: z.number().int().nonnegative().optional(),
  availableSeatsMode: z.nativeEnum(AvailableSeatsMode).optional(),
  attendeeListMode: z.nativeEnum(AttendeeListMode).optional(),
  showCountdown: z.boolean().optional(),
  countdownLabel: z.string().nullable().optional(),
  publicReleaseAt: z.string().nullable().optional(),
  earlyReleaseAt: z.string().nullable().optional(),
  newsletterCaptureEnabled: z.boolean().optional(),
  waitlistEnabled: z.boolean().optional(),
  membershipRuleMode: z.nativeEnum(MembershipRuleMode).optional(),
  isFeatured: z.boolean().optional(),
  seoTitle: z.string().nullable().optional(),
  seoDescription: z.string().nullable().optional(),
  status: z.nativeEnum(SeriesStatus).optional(),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  communityUrl: z.string().nullable().optional(),
  socialLinksJson: z.unknown().optional(),
}).passthrough();

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const series = await prisma.series.findUnique({
    where: { id },
    include: {
      ticketTypes: { include: { pricingRules: true }, orderBy: { displayOrder: "asc" } },
      sessions: { orderBy: { startsAt: "asc" }, include: { ticketPrices: true } },
      addons: { orderBy: { displayOrder: "asc" } },
      experienceInfluencer: { include: { influencer: { select: { id: true, displayName: true, handle: true } } } },
      operationalVenue: { select: { id: true, name: true, slug: true } },
      eventSpace: { select: { id: true, name: true, conceptKey: true } },
      _count: { select: { Order: true, waitlists: true, analyticsDays: true } },
    },
  });
  if (!series) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ series });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actorId = (session!.user as { id: string }).id;

  const { id } = await params;
  const rawBody: unknown = await req.json().catch(() => ({}));
  const parsedBody = SeriesPatchSchema.safeParse(rawBody);
  if (!parsedBody.success) return NextResponse.json({ error: "Invalid series update." }, { status: 400 });
  const body = parsedBody.data;
  const data: Prisma.SeriesUncheckedUpdateInput = {
    title: body.title,
    subtitle: body.subtitle,
    description: body.description,
    category: body.category,
    venue: body.venue,
    venueId: body.venueId,
    spaceId: body.spaceId,
    hostType: body.hostType,
    influencerId: body.influencerId,
    partnerId: body.partnerId,
    city: body.city,
    country: body.country,
    venueAddress: body.venueAddress,
    heroImageUrl: body.heroImageUrl,
    capacityTotal: body.capacityTotal,
    availableSeatsMode: body.availableSeatsMode,
    attendeeListMode: body.attendeeListMode,
    showCountdown: body.showCountdown,
    countdownLabel: body.countdownLabel,
    publicReleaseAt: body.publicReleaseAt ? new Date(body.publicReleaseAt) : body.publicReleaseAt,
    earlyReleaseAt: body.earlyReleaseAt ? new Date(body.earlyReleaseAt) : body.earlyReleaseAt,
    newsletterCaptureEnabled: body.newsletterCaptureEnabled,
    waitlistEnabled: body.waitlistEnabled,
    membershipRuleMode: body.membershipRuleMode,
    isFeatured: body.isFeatured,
    seoTitle: body.seoTitle,
    seoDescription: body.seoDescription,
    status: body.status,
    startsAt: body.startsAt ? new Date(body.startsAt) : body.startsAt,
    endsAt: body.endsAt ? new Date(body.endsAt) : body.endsAt,
    communityUrl: body.communityUrl,
  };
  // Preserve PATCH semantics: omitted fields must not appear in the update or
  // its audit record. Prisma ignores undefined values, but audit metadata
  // should describe only the fields the editor actually submitted.
  for (const key of Object.keys(data) as (keyof Prisma.SeriesUncheckedUpdateInput)[]) {
    if (data[key] === undefined) delete data[key];
  }
  try {
    Object.assign(data, parseArtworkEdit(rawBody as Record<string, unknown>, session?.user?.roles ?? [], "series"));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: (error as { status: number }).status });
  }
  if (body.socialLinksJson !== undefined) {
    const links = seriesSocialLinksSchema.safeParse(body.socialLinksJson ?? {});
    if (!links.success) return NextResponse.json({ error: "Enter secure HTTPS links for the series social profiles." }, { status: 400 });
    data.socialLinksJson = links.data;
  }
  const existing = await prisma.series.findUnique({ where: { id }, select: { venueId: true, spaceId: true, hostType: true, influencerId: true, partnerId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const targetVenueId = body.venueId ?? existing.venueId;
  if (body.venueId !== undefined && body.venueId !== null) {
    const venue = await prisma.venue.findUnique({ where: { id: body.venueId }, select: { id: true } });
    if (!venue) return NextResponse.json({ error: "Venue not found" }, { status: 404 });
  }
  // Switching the restaurant must never carry a space from the old venue.
  if (body.venueId !== undefined && body.spaceId === undefined) data.spaceId = null;
  let selectedSpace: { conceptKey: string } | null = null;
  if (body.spaceId) {
    if (!targetVenueId) return NextResponse.json({ error: "Select an operational venue first" }, { status: 400 });
    selectedSpace = await prisma.restaurantSpace.findFirst({ where: { id: body.spaceId, venueId: targetVenueId, isActive: true }, select: { conceptKey: true } });
    if (!selectedSpace) return NextResponse.json({ error: "Space must belong to the selected venue" }, { status: 400 });
  }
  // The legacy concept is derived from the selected physical-space data, never
  // trusted from the browser. This prevents a Terrace event being labelled CATCH.
  if (body.spaceId !== undefined || body.venueId !== undefined) {
    data.venue = selectedSpace?.conceptKey === "OKU" || selectedSpace?.conceptKey === "CATCH" ? selectedSpace.conceptKey : null;
  }
  const targetHostType = body.hostType ?? existing.hostType;
  const targetInfluencerId = body.influencerId !== undefined ? body.influencerId : existing.influencerId;
  const targetPartnerId = body.partnerId !== undefined ? body.partnerId : existing.partnerId;
  if (targetHostType === "INFLUENCER") {
    if (!targetInfluencerId) return NextResponse.json({ error: "Select an influencer host" }, { status: 400 });
    const influencer = await prisma.influencerProfile.findUnique({ where: { id: targetInfluencerId }, select: { id: true } });
    if (!influencer) return NextResponse.json({ error: "Influencer host not found" }, { status: 404 });
    data.influencerId = targetInfluencerId;
    data.partnerId = null;
  } else if (targetHostType === "PARTNER") {
    if (!targetPartnerId) return NextResponse.json({ error: "Select a partner host" }, { status: 400 });
    const partner = await prisma.partnerProfile.findUnique({ where: { id: targetPartnerId }, select: { id: true } });
    if (!partner) return NextResponse.json({ error: "Partner host not found" }, { status: 404 });
    data.partnerId = targetPartnerId;
    data.influencerId = null;
  } else if (body.hostType !== undefined) {
    data.influencerId = null;
    data.partnerId = null;
  }

  // Publishing activates its deliberate occupancy blocks only after the admin
  // has created them. Pausing/postponing immediately releases future public
  // availability while preserving the event and its reservation-conflict audit.
  try {
    const series = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Series" WHERE "id" = ${id} FOR UPDATE`;
      const defaultFields = ["title", "subtitle", "description", "capacityTotal", "heroImageUrl", "heroImageUrlEn", "heroImageUrlEs", "heroImageUrlPt", "startsAt", "endsAt"];
      if (defaultFields.some(k => k in data) && await legacySeriesWriteBlocked(id, tx)) throw Object.assign(new Error(managedWriteMessage), { status: 409 });
      const updated = await tx.series.update({ where: { id }, data });
      await syncTranslations(tx, "Series", id, updated);
      if (body.status === "PUBLISHED") await assertSeriesReadyForPublication(tx, id);
    if (body.status) {
      await syncSeriesOccupanciesForStatus(tx, id, body.status);
    }
    await tx.auditLog.create({ data: { actorId, action: "EXPERIENCE_UPDATED", metadata: { seriesId: id, fields: Object.keys(data) } } });
    return updated;
    });
    return finishEventSave(id, { series }, req);
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && error.status === 409) return NextResponse.json({ error: error instanceof Error ? error.message : managedWriteMessage }, { status: 409 });
    if (error instanceof SeriesPublicationError) {
      return NextResponse.json({ error: "This series is not ready to publish.", issues: error.issues }, { status: 409 });
    }
    throw error;
  }
}
