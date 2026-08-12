import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";

function randCode(prefix: string, len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = prefix.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);

    const { searchParams } = new URL(req.url);
    const search   = searchParams.get("search") ?? "";
    const pageSize = Math.min(parseInt(searchParams.get("pageSize") ?? "200"), 200);

    const where = search
      ? { OR: [
          { name:  { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
        ] }
      : undefined;

    const users = await prisma.user.findMany({
      where,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      include: {
        roles: { select: { roleKey: true } },
        referrer: { select: { id: true, referrerType: true, referralCode: true, isActive: true, compensationPlanId: true } },
      },
    });

    return NextResponse.json({ ok: true, data: users });
  } catch (e: any) {
    const status = e.status || 500;
    return NextResponse.json({ ok: false, error: e.message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);

    const body = await req.json();
    const { name, email, phone, initialRole, referrerType, organizationName, referrerPhone } = body;

    if (!email?.trim()) return NextResponse.json({ ok: false, error: "Email is required" }, { status: 400 });
    if (!initialRole)   return NextResponse.json({ ok: false, error: "Initial role is required" }, { status: 400 });
    if (initialRole === "REFERRER" && !referrerType) {
      return NextResponse.json({ ok: false, error: "Referrer type is required when creating a REFERRER user" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (existing) return NextResponse.json({ ok: false, error: "A user with this email already exists" }, { status: 409 });

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: email.trim().toLowerCase(),
          name:  name?.trim() || null,
          phone: phone?.trim() || null,
          status: "ACTIVE",
          roles: { create: [{ roleKey: initialRole }] },
        },
        include: {
          roles: { select: { roleKey: true } },
          referrer: { select: { id: true, referrerType: true, referralCode: true, isActive: true, compensationPlanId: true } },
        },
      });

      if (initialRole === "REFERRER") {
        const prefix = (name || email).replace(/[^a-zA-Z]/g, "").slice(0, 3);
        let referralCode = randCode(prefix);
        let attempts = 0;
        while (await tx.referrer.findUnique({ where: { referralCode } }) && attempts++ < 10) {
          referralCode = randCode(prefix);
        }

        await tx.referrer.create({
          data: {
            fullName:         name?.trim() || email.trim(),
            referrerType:     referrerType,
            phone:            referrerPhone?.trim() || phone?.trim() || null,
            organizationName: organizationName?.trim() || null,
            referralCode,
            isActive:         true,
            userId:           newUser.id,
          },
        });

        return tx.user.findUnique({
          where: { id: newUser.id },
          include: {
            roles: { select: { roleKey: true } },
            referrer: { select: { id: true, referrerType: true, referralCode: true, isActive: true, compensationPlanId: true } },
          },
        });
      }

      return newUser;
    });

    return NextResponse.json({ ok: true, data: user }, { status: 201 });
  } catch (e: any) {
    const status = e.status || 500;
    return NextResponse.json({ ok: false, error: e.message }, { status });
  }
}
