import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");

  if (slug) {
    const job = await prisma.jobPost.findUnique({ where: { slug } });
    if (!job || !job.isActive) {
      return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, data: job });
  }

  const jobs = await prisma.jobPost.findMany({ where: { isActive: true }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ ok: true, data: jobs });
}
