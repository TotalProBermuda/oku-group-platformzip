import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { RoleKey } from "@/types/roles";

/**
 * Resolves the real DB userId from a JWT session.
 * JWT tokens can become stale after a seed re-run (the user record is deleted
 * and recreated with a new CUID). We verify the raw id exists; if not, we fall
 * back to an email lookup so callers always receive a valid DB primary key.
 */
async function resolveDbUserId(rawId: string, email?: string | null): Promise<string> {
  const exists = await prisma.user.findUnique({ where: { id: rawId }, select: { id: true } });
  if (exists) return rawId;
  if (!email) return rawId;
  const byEmail = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  return byEmail?.id ?? rawId;
}

export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    const err = new Error("Unauthorized") as Error & { status: number };
    err.status = 401;
    throw err;
  }
  const roles = (session.user.roles || []) as RoleKey[];
  const userId = await resolveDbUserId(session.user.id as string, session.user.email);
  return { session, userId, roles };
}

export async function getOptionalSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const roles = (session.user.roles || []) as RoleKey[];
  const userId = await resolveDbUserId(session.user.id as string, session.user.email);
  return { session, userId, roles };
}
