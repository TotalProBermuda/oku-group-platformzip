import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { RoleKey } from "@/types/roles";
import { isDemoModeEnabled } from "@/lib/demoMode";

type AuthenticatedContext = {
  session: Omit<Session, "expires"> & { expires?: string; user: NonNullable<Session["user"]> };
  userId: string;
  roles: RoleKey[];
};

export async function requireSession(): Promise<AuthenticatedContext> {
  const current = await getOptionalSession();
  if (!current) {
    const err = new Error("Unauthorized") as Error & { status: number };
    err.status = 401;
    throw err;
  }
  return current;
}

export async function getOptionalSession(): Promise<AuthenticatedContext | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const current = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, status: true, roles: { select: { roleKey: true } } },
  });
  if (!current || current.status !== "ACTIVE" ||
    (current.email.toLowerCase().endsWith("@oku.local") && !isDemoModeEnabled())) return null;
  const roles = current.roles.map((role) => role.roleKey) as RoleKey[];
  return {
    session: { ...session, user: { ...session.user, id: current.id, email: current.email, roles } },
    userId: current.id,
    roles,
  };
}
