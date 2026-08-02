import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { gatePublicPostAsync, parseRequestBody } from "@/server/rateLimit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session  = await getServerSession(authOptions);
  const body     = await parseRequestBody(req);

  const gate = await gatePublicPostAsync(req, body, "waitlist", { limit: 5, windowMs: 60_000 });
  if (!gate.ok) return gate.response as NextResponse;

  const email    = (body.email as string | undefined) || session?.user?.email;
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const series = await prisma.series.findUnique({ where: { slug }, select: { id: true, waitlistEnabled: true } });
  if (!series) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!series.waitlistEnabled) return NextResponse.json({ error: "Waitlist not enabled" }, { status: 400 });

  const user = session?.user?.id ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true } }) : null;

  await prisma.experienceWaitlist.upsert({
    where: { seriesId_email: { seriesId: series.id, email } },
    update: { status: "ACTIVE" },
    create: { seriesId: series.id, email, userId: user?.id ?? null, source: (body.source as string | undefined) ?? "EVENT_PAGE" },
  });

  return NextResponse.json({ ok: true });
}
