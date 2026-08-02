import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function isAdmin(session: any) {
  return session?.user?.roles?.some((r: string) => ["SUPERADMIN","ADMIN_COMMERCIAL"].includes(r));
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const series = await prisma.series.findUnique({
    where: { id },
    include: {
      ticketTypes: { include: { pricingRules: true }, orderBy: { displayOrder: "asc" } },
      sessions: { orderBy: { startsAt: "asc" } },
      addons: { orderBy: { displayOrder: "asc" } },
      experienceInfluencer: { include: { influencer: { select: { id: true, displayName: true, handle: true } } } },
      _count: { select: { Order: true, waitlists: true, analyticsDays: true } },
    },
  });
  if (!series) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ series });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const allowed = ["title","subtitle","description","category","venue","hostType","city","country","venueAddress",
    "heroImageUrl","capacityTotal","availableSeatsMode","attendeeListMode","showCountdown","countdownLabel",
    "publicReleaseAt","earlyReleaseAt","newsletterCaptureEnabled","waitlistEnabled","membershipRuleMode",
    "isFeatured","seoTitle","seoDescription","status","startsAt","endsAt","communityUrl"];
  const data: any = {};
  for (const k of allowed) if (k in body) data[k] = body[k];
  if (data.publicReleaseAt) data.publicReleaseAt = new Date(data.publicReleaseAt);
  if (data.earlyReleaseAt)  data.earlyReleaseAt  = new Date(data.earlyReleaseAt);
  if (data.startsAt)        data.startsAt        = new Date(data.startsAt);
  if (data.endsAt)          data.endsAt          = new Date(data.endsAt);

  const series = await prisma.series.update({ where: { id }, data });
  await prisma.auditLog.create({ data: { actorId: session.user.id, action: "EXPERIENCE_UPDATED", metadata: { seriesId: id, fields: Object.keys(data) } } });
  return NextResponse.json({ series });
}
