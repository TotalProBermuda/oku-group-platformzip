import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gatePublicPostAsync } from "@/server/rateLimit";

export async function POST(req: Request) {
  try {
    // .catch keeps malformed JSON from bypassing the gate via the outer try/catch.
    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    const gate = await gatePublicPostAsync(req, body, "jobs-apply", { limit: 5, windowMs: 60_000 });
    if (!gate.ok) return gate.response;

    const { jobSlug, name, email, phone, notes } = body as Record<string, string | undefined>;

    if (!jobSlug || !name || !email) {
      return NextResponse.json({ ok: false, error: "jobSlug, name, and email are required" }, { status: 400 });
    }

    const job = await prisma.jobPost.findUnique({ where: { slug: jobSlug } });
    if (!job) {
      return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
    }

    await prisma.jobApplication.create({
      data: {
        jobId: job.id,
        name,
        email,
        phone: phone || null,
        notes: notes || null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
