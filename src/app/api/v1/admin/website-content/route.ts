import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { getWebsiteContent } from "@/server/content/websiteContent";

const copySchema = z.object({
  headline: z.string().trim().min(1).max(120),
  tag: z.string().trim().min(1).max(80),
  tagline: z.string().trim().min(1).max(240),
  description: z.string().trim().min(1).max(800),
  heroLine1: z.string().trim().min(1).max(80),
  heroLine2: z.string().trim().max(80),
  heroLine3: z.string().trim().max(80),
  about: z.array(z.string().trim().min(1).max(1200)).min(1).max(6),
});

const localizedCopySchema = z.object({
  en: copySchema,
  es: copySchema,
  pt: copySchema,
});

const contentSchema = z.object({
  hours: z.array(z.object({
    days: z.object({ en: z.string().trim().min(1).max(80), es: z.string().trim().min(1).max(80), pt: z.string().trim().min(1).max(80) }),
    time: z.string().trim().min(1).max(80),
  })).min(1).max(7),
  venues: z.object({
    oku: localizedCopySchema,
    catch: localizedCopySchema,
    terrace: localizedCopySchema,
  }),
});

export async function GET(request: NextRequest) {
  try {
    await requireAdminRoles(request, ["SUPERADMIN"]);
    return NextResponse.json({ ok: true, data: await getWebsiteContent() });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return NextResponse.json({ ok: false, error: status === 500 ? "Unable to load website content" : "Unauthorized" }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminRoles(request, ["SUPERADMIN"]);
    const parsed = contentSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues.map((issue) => issue.message).join("; ") }, { status: 400 });

    const row = await prisma.commerceSettings.upsert({
      where: { id: "global" },
      create: { id: "global", websiteContent: parsed.data, updatedById: auth.userId },
      update: { websiteContent: parsed.data, updatedById: auth.userId },
      select: { websiteContent: true },
    });
    await prisma.auditLog.create({
      data: { actorId: auth.userId, action: "website.content.update", metadata: { updatedAt: new Date().toISOString() } },
    }).catch(() => null);
    return NextResponse.json({ ok: true, data: row.websiteContent });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to save website content" }, { status });
  }
}
