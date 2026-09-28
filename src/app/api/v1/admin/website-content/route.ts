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

const localizedLabelSchema = z.object({
  en: z.string().trim().min(1).max(80),
  es: z.string().trim().min(1).max(80),
  pt: z.string().trim().min(1).max(80),
});

const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/, "Use HH:mm time format");
const shiftSchema = z.object({
  label: localizedLabelSchema,
  start: timeSchema,
  end: timeSchema,
}).refine((shift) => shift.start < shift.end || shift.end === "24:00", "Shift end must be after its start");

const contentSchema = z.object({
  hours: z.array(z.object({
    days: z.object({ en: z.string().trim().min(1).max(80), es: z.string().trim().min(1).max(80), pt: z.string().trim().min(1).max(80) }),
    time: z.string().trim().min(1).max(80),
  })).min(1).max(7),
  operationalCalendar: z.object({
    timezone: z.literal("America/Panama"),
    weekly: z.array(z.object({
      day: z.number().int().min(0).max(6),
      enabled: z.boolean(),
      shifts: z.array(shiftSchema).max(4),
    })).length(7).refine((days) => new Set(days.map((entry) => entry.day)).size === 7, "Each weekday must appear once"),
    exceptions: z.array(z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      name: localizedLabelSchema,
      closed: z.boolean(),
      shifts: z.array(shiftSchema).max(4),
    })).max(100),
  }).superRefine((calendar, context) => {
    const validateShifts = (shifts: Array<{ start: string; end: string }>, path: Array<string | number>) => {
      const sorted = [...shifts].sort((a, b) => a.start.localeCompare(b.start));
      for (let index = 1; index < sorted.length; index += 1) {
        if (sorted[index].start < sorted[index - 1].end) {
          context.addIssue({ code: z.ZodIssueCode.custom, path, message: "Operating shifts cannot overlap" });
        }
      }
    };
    calendar.weekly.forEach((day, index) => {
      if (day.enabled && day.shifts.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ["weekly", index, "shifts"], message: "Open days require at least one shift" });
      validateShifts(day.shifts, ["weekly", index, "shifts"]);
    });
    const dates = new Set<string>();
    calendar.exceptions.forEach((entry, index) => {
      if (dates.has(entry.date)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["exceptions", index, "date"], message: "Only one exception is allowed per date" });
      dates.add(entry.date);
      if (!entry.closed && entry.shifts.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ["exceptions", index, "shifts"], message: "Special opening days require at least one shift" });
      validateShifts(entry.shifts, ["exceptions", index, "shifts"]);
    });
  }),
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
