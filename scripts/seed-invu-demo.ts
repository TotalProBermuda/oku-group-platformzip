/**
 * Seed demo content for the INVU Closed Orders panel.
 *
 * Strategy: pull the last 7 days of REAL closed orders from INVU, then
 * back-cast a small set of demo reservations against a subset of those rows
 * so the matching engine produces a realistic mix:
 *   - ~50% strong (exact name + table + close time match)
 *   - ~30% heuristic (party size + close time within 60 min, no table)
 *   - ~20% unmatched (real INVU rows with no demo reservation)
 *
 * Also seeds:
 *   - One IntegrationBranchMapping for the connected venue (if missing)
 *   - 2 RestaurantHostProfile rows (Streetside Hosts) if missing
 *   - 4 demo Referrers (Taxi, Concierge, Influencer, Tour Guide) if missing
 *
 * Idempotent: each helper checks for existence before creating.
 *
 * Usage: npx tsx scripts/seed-invu-demo.ts
 */
import { prisma } from "../src/lib/prisma";
import { decrypt } from "../src/server/services/invu/invuEncryptionService";
import {
  ReservationSource,
  ReservationStatus,
  ReferrerType,
  CommissionStatus,
  ConversionStage,
} from "@prisma/client";

const INVU_BASE = "https://api6.invupos.com/invuApiPos/index.php";

type InvuClosedOrder = {
  id: string | number;
  num_cita?: string | number;
  fecha_apertura_date?: string;
  fecha_cierre_date?: string;
  hora_cierre?: string;
  comensales?: string | number;
  // INVU sometimes returns these as objects like `{id: 7, nombre: "T-9"}` and sometimes as strings.
  mesa?: string | { nombre?: string; name?: string } | null;
  cliente?: string | { nombre?: string; name?: string } | null;
  subtotal?: string | number;
  total?: string | number;
  propinas?: string | number;
  tax?: string | number;
};

function extractString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const cand = o.nombre ?? o.name ?? o.label ?? o.value;
    if (typeof cand === "string" && cand.trim()) return cand.trim();
  }
  return null;
}

async function pullLast7Days(token: string): Promise<InvuClosedOrder[]> {
  const now = Math.floor(Date.now() / 1000);
  const sevenDaysAgo = now - 7 * 24 * 60 * 60;
  const url = `${INVU_BASE}?r=citas/ordenesAllAdv/fini/${sevenDaysAgo}/ffin/${now}/tipo/1/grouping/1`;
  const res = await fetch(url, {
    headers: { accept: "application/json", authorization: token },
  });
  if (!res.ok) throw new Error(`INVU fetch failed: ${res.status}`);
  const json: { data?: InvuClosedOrder[] } = await res.json();
  return Array.isArray(json.data) ? json.data : [];
}

async function ensureBranchMapping(venueId: string, credentialId: string) {
  const existing = await prisma.integrationBranchMapping.findFirst({
    where: { venueId, credentialId },
  });
  if (existing) {
    console.log(`  ✓ branch mapping exists (${existing.id})`);
    return existing;
  }
  const m = await prisma.integrationBranchMapping.create({
    data: {
      venueId,
      credentialId,
      invuBranchId: "default",
      invuBranchLabel: "Default branch (auto-created by demo seed)",
      isSyncEnabled: true,
    },
  });
  console.log(`  + created branch mapping ${m.id}`);
  return m;
}

async function ensureUser(email: string, name: string): Promise<{ id: string }> {
  const u = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, status: "ACTIVE" },
    select: { id: true },
  });
  return u;
}

async function ensureStreetsideHosts(venueId: string) {
  const seedHosts = [
    { email: "demo.host.maria@goldhouse.bm", name: "Maria Vargas", display: "Maria V." },
    { email: "demo.host.diego@goldhouse.bm", name: "Diego Hernandez", display: "Diego H." },
  ];
  const profiles = [];
  for (const h of seedHosts) {
    const user = await ensureUser(h.email, h.name);
    const existing = await prisma.restaurantHostProfile.findUnique({
      where: { userId: user.id },
    });
    if (existing) {
      profiles.push(existing);
      continue;
    }
    const created = await prisma.restaurantHostProfile.create({
      data: {
        userId: user.id,
        displayName: h.display,
        venueId,
        isActive: true,
      },
    });
    profiles.push(created);
    console.log(`  + created host ${h.display}`);
  }
  return profiles;
}

async function ensureReferrers(): Promise<
  Array<{ id: string; fullName: string; referrerType: ReferrerType; sourceType: ReservationSource }>
> {
  const seeds: Array<{
    fullName: string;
    referralCode: string;
    referrerType: ReferrerType;
    sourceType: ReservationSource;
  }> = [
    { fullName: "Reefside Taxi #441", referralCode: "TAXI-441", referrerType: "TAXI_DRIVER", sourceType: "TAXI_DRIVER" },
    { fullName: "Hamilton Princess Concierge", referralCode: "HP-CONC", referrerType: "HOTEL_CONCIERGE", sourceType: "HOTEL_CONCIERGE" },
    { fullName: "Bermuda Bites Tours", referralCode: "BB-TOURS", referrerType: "TOUR_GUIDE", sourceType: "TOUR_GUIDE" },
    { fullName: "@islandfoodie.bm", referralCode: "IFB-INF", referrerType: "PARTNER", sourceType: "STREETSIDE_HOST" },
  ];
  const out = [];
  for (const s of seeds) {
    const r = await prisma.referrer.upsert({
      where: { referralCode: s.referralCode },
      update: {},
      create: {
        fullName: s.fullName,
        referralCode: s.referralCode,
        referrerType: s.referrerType,
        isActive: true,
      },
      select: { id: true, fullName: true, referrerType: true },
    });
    out.push({ ...r, sourceType: s.sourceType });
  }
  console.log(`  ✓ ensured ${out.length} demo referrers`);
  return out;
}

function pad(n: number) { return String(n).padStart(2, "0"); }
function randCode(): string {
  return "DEMO-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function backcastReservation(params: {
  venueId: string;
  order: InvuClosedOrder;
  matchKind: "STRONG" | "HEURISTIC";
  attribution: { hostId?: string; referrerId?: string; sourceType: ReservationSource; sourceLabel: string };
}) {
  const { venueId, order, matchKind, attribution } = params;
  const closeStr = order.fecha_cierre_date;
  if (!closeStr) return null;
  const closeDate = new Date(closeStr);
  if (isNaN(closeDate.getTime())) return null;

  const partySize = parseInt(String(order.comensales ?? "2"), 10) || 2;
  const tableLabel = extractString(order.mesa);
  const clienteName = extractString(order.cliente);

  // STRONG: align name + table + within 15 min of close
  // HEURISTIC: same party size + within 60 min, no table, different name
  const reservationDate =
    matchKind === "STRONG"
      ? new Date(closeDate.getTime() - 90 * 60 * 1000) // typical seating ≈ 90 min before close
      : new Date(closeDate.getTime() - (75 + Math.floor(Math.random() * 60)) * 60 * 1000);

  const contactName =
    matchKind === "STRONG" && clienteName
      ? clienteName
      : ["Alex Reid", "Jordan Lee", "Sam Patel", "Taylor Brooks", "Robin Chen"][
          Math.floor(Math.random() * 5)
        ];

  const contactEmail = `demo+${randCode().toLowerCase()}@goldhouse.bm`;
  const reservation = await prisma.reservation.create({
    data: {
      venueId,
      source: attribution.sourceType,
      status: ReservationStatus.COMPLETED,
      reservationDate,
      partySize,
      contactName,
      contactEmail,
      contactEmailNormalized: contactEmail,
      confirmationCode: randCode(),
      assignedTableLabel: matchKind === "STRONG" ? tableLabel : null,
      assignedRestaurantHostId: attribution.hostId ?? null,
      commissionEligible: true,
      arrivalConfirmedAt: reservationDate,
      seatedAt: reservationDate,
      sourceContext: `demo-seed:${matchKind}`,
    },
  });

  await prisma.reservationAttribution.create({
    data: {
      reservationId: reservation.id,
      referrerId: attribution.referrerId ?? null,
      sourceType: attribution.sourceType,
      sourceLabel: attribution.sourceLabel,
      commissionEligible: true,
      commissionStatus: CommissionStatus.PENDING,
      conversionStage: ConversionStage.PATRONIZED,
      coversAttributed: partySize,
      patronizedAt: closeDate,
      notes: `Demo seed (${matchKind}) — back-cast against INVU order ${order.id}`,
    },
  });

  return reservation;
}

async function main() {
  console.log("=== INVU Closed Orders demo seed ===\n");

  const credential = await prisma.invuIntegrationCredential.findFirst({
    where: { status: "CONNECTED" },
    include: { venue: true },
  });
  if (!credential || !credential.venue) {
    console.error("No CONNECTED INVU credential found. Connect the integration first.");
    return;
  }
  if (!credential.accessTokenEncrypted) {
    console.error("Credential is connected but no token stored.");
    return;
  }
  const venueId = credential.venue.id;
  console.log(`Venue: ${credential.venue.slug} (${venueId})\n`);

  console.log("[1/4] Ensuring branch mapping…");
  await ensureBranchMapping(venueId, credential.id);

  console.log("\n[2/4] Ensuring demo hosts + referrers…");
  const hosts = await ensureStreetsideHosts(venueId);
  const referrers = await ensureReferrers();

  console.log("\n[3/4] Pulling last 7 days of INVU closed orders…");
  const token = decrypt(credential.accessTokenEncrypted);
  const orders = await pullLast7Days(token);
  console.log(`  pulled ${orders.length} orders`);
  if (orders.length < 8) {
    console.warn(`  WARN: fewer than 8 orders available — distribution may skew`);
  }

  // Sort newest first, take up to the most recent 10 with valid close dates
  const usable = orders
    .filter((o) => o.fecha_cierre_date && o.comensales)
    .sort((a, b) => new Date(b.fecha_cierre_date!).getTime() - new Date(a.fecha_cierre_date!).getTime())
    .slice(0, 10);

  console.log(`\n[4/4] Back-casting demo reservations against ${usable.length} INVU orders…`);

  // Skip if we already seeded recently (idempotency: look for existing demo-seed reservations in the window)
  const existingSeed = await prisma.reservation.count({
    where: {
      venueId,
      sourceContext: { startsWith: "demo-seed:" },
      reservationDate: { gte: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
    },
  });
  if (existingSeed > 0) {
    console.log(`  ℹ ${existingSeed} demo-seed reservations already exist in the last 8 days — skipping back-cast.`);
    console.log("\nSeed complete (no new reservations).");
    return;
  }

  // 4 strong, 2 heuristic, leave 2-4 unmatched
  const strongOrders = usable.slice(0, 4);
  const heuristicOrders = usable.slice(4, 6);

  let attrIdx = 0;
  const nextAttribution = () => {
    const r = referrers[attrIdx % referrers.length];
    attrIdx++;
    // Half of strong matches go to a Streetside Host (no referrer), half to referrers
    if (attrIdx % 2 === 0 && hosts.length > 0) {
      return {
        hostId: hosts[Math.floor(Math.random() * hosts.length)].id,
        sourceType: "STREETSIDE_HOST" as ReservationSource,
        sourceLabel: "Streetside Host",
      };
    }
    return {
      referrerId: r.id,
      sourceType: r.sourceType,
      sourceLabel: r.fullName,
    };
  };

  let created = 0;
  for (const o of strongOrders) {
    const res = await backcastReservation({
      venueId,
      order: o,
      matchKind: "STRONG",
      attribution: nextAttribution(),
    });
    if (res) created++;
  }
  for (const o of heuristicOrders) {
    const res = await backcastReservation({
      venueId,
      order: o,
      matchKind: "HEURISTIC",
      attribution: nextAttribution(),
    });
    if (res) created++;
  }

  console.log(`  + created ${created} demo reservations`);
  const unmatchedCount = usable.length - created;
  console.log(`  ≈ ${unmatchedCount} INVU orders intentionally left unmatched (will appear in Unmatched tab)`);

  console.log("\n✓ Seed complete. Run a Pull from /admin/integrations/invu/closed-orders to populate TableSessions.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
