import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";

const Body = z.object({
  effectiveFrom: z.string().datetime(),
  serviceFeeBps: z.number().int().min(0).max(10000),
  serviceFeeFlatCents: z.number().int().min(0).max(1000000).default(0),
  taxBps: z.number().int().min(0).max(10000),
  taxServiceFee: z.boolean(),
}).strict();

export async function GET() {
  const { roles } = await requireSession();
  if (!roles.includes("SUPERADMIN")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ rules: await prisma.checkoutFinanceRule.findMany({ orderBy: { effectiveFrom: "desc" } }) });
}

export async function POST(req: Request) {
  const { userId, roles } = await requireSession();
  if (!roles.includes("SUPERADMIN")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid finance rule" }, { status: 400 });
  const effectiveFrom = new Date(parsed.data.effectiveFrom);
  if (effectiveFrom <= new Date()) return NextResponse.json({ error: "Choose a future effective date. Existing rules cannot be rewritten." }, { status: 400 });
  try {
    const rule = await prisma.$transaction(async (tx) => {
      const created = await tx.checkoutFinanceRule.create({ data: { ...parsed.data, effectiveFrom, createdById: userId } });
      await tx.auditLog.create({ data: { actorId: userId, action: "checkout.finance_rule.created", metadata: { ...parsed.data, ruleId: created.id } } });
      return created;
    });
    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return NextResponse.json({ error: "A rule already takes effect at that time" }, { status: 409 });
    throw error;
  }
}
