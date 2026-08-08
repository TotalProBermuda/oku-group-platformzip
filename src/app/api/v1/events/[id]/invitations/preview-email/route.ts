import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderInvitationEmail, formatEventDate } from "@/server/invitation/emailTemplates";
import type { EmailTemplate } from "@/server/invitation/emailTemplates/types";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const roles: string[] = (session?.user as any)?.roles ?? [];
  const isAdmin = roles.some((r) => ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_IR", "ADMIN_HR"].includes(r));
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { template, customSubject, customMessage, flyerImageUrl, heroImageUrl, youtubeUrl, audienceLabel } = body;

  const series = await prisma.series.findUnique({
    where: { id },
    select: {
      title: true, subtitle: true, slug: true, startsAt: true,
      venueAddress: true, city: true, description: true,
      heroImageUrl: true, inviteFlyerImageUrl: true,
    },
  });

  if (!series) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const BASE = process.env.NEXTAUTH_URL ?? "https://oku.group";
  const DEMO_TOKEN = "preview-token-demo";

  const html = renderInvitationEmail({
    template: (template ?? "CLASSIC") as EmailTemplate,
    eventTitle: series.title,
    eventSubtitle: series.subtitle ?? undefined,
    eventDate: formatEventDate(series.startsAt),
    eventVenue: [series.venueAddress, series.city].filter(Boolean).join(", ") || "OKÜ Hospitality Group",
    eventDescription: series.description ?? undefined,
    eventSlug: series.slug,
    recipientName: "Preview Recipient",
    flyerImageUrl: flyerImageUrl ?? series.inviteFlyerImageUrl,
    heroImageUrl: heroImageUrl ?? series.heroImageUrl,
    youtubeUrl: youtubeUrl ?? undefined,
    customSubject,
    customMessage,
    audienceLabel,
    rsvpUrl: `${BASE}/invite/${DEMO_TOKEN}/rsvp`,
    declineUrl: `${BASE}/invite/${DEMO_TOKEN}/decline`,
  });

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
