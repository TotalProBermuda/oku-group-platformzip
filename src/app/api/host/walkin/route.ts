import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";

export async function POST(req: NextRequest) {
  // Creating walk-in waitlist entries / attribution reservations is operational
  // floor control — restaurant hosts / admins only. This route was previously
  // unauthenticated.
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "host:reservations:checkin");
  } catch (e) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ error: err.message ?? "Unauthorized" }, { status: err.status ?? 401 });
  }
  try {
    const { name, phone, partySize, concept, referralCode } = await req.json();

    if (!name || !partySize || !concept) {
      return NextResponse.json({ error: "name, partySize, and concept are required." }, { status: 400 });
    }

    const venue = await prisma.venue.findFirst({ where: { slug: "gold-house" } });
    if (!venue) return NextResponse.json({ error: "Venue not found." }, { status: 500 });

    const zone = await prisma.zone.findFirst({ where: { venueId: venue.id, conceptKey: concept } });

    // Create waitlist entry or walk-in reservation
    const entry = await prisma.resWaitlistEntry.create({
      data: {
        venueId: venue.id,
        zoneId: zone?.id ?? null,
        source: referralCode ? "STREETSIDE_HOST" : "WALK_IN",
        status: "ACTIVE",
        contactName: name,
        contactPhone: phone || null,
        partySize: Number(partySize),
        conceptRequested: concept,
        estimatedWaitMinutes: 20,
      },
    });

    // Log referral
    if (referralCode) {
      const referrer = await prisma.referrer.findFirst({ where: { referralCode: referralCode.toUpperCase(), isActive: true } });
      if (referrer) {
        // Create a minimal reservation for attribution tracking
        const code = Array.from({ length: 8 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 34)]).join("");
        const res = await prisma.reservation.create({
          data: {
            venueId: venue.id,
            zoneId: zone?.id ?? null,
            source: "STREETSIDE_HOST",
            status: "PENDING",
            reservationDate: new Date(),
            partySize: Number(partySize),
            conceptRequested: concept,
            contactName: name,
            contactEmail: `walkin-${entry.id}@gold-house.local`,
            contactPhone: phone || null,
            confirmationCode: code,
          },
        });
        await prisma.reservationAttribution.create({
          data: {
            reservationId: res.id,
            referrerId: referrer.id,
            sourceType: "STREETSIDE_HOST",
            commissionEligible: true,
            conversionStage: "REFERRED_UPSTAIRS",
          },
        });
        await prisma.reservationHandoff.create({
          data: {
            reservationId: res.id,
            sentByRole: "STREETSIDE_HOST",
            sentByLabel: referrer.fullName,
            handoffStatus: "PENDING",
            waitTimeMinutes: 20,
          },
        });
      }
    }

    return NextResponse.json({ success: true, waitlistEntryId: entry.id });
  } catch (err) {
    console.error("[POST /api/host/walkin]", err);
    return NextResponse.json({ error: "Failed to log walk-in." }, { status: 500 });
  }
}
