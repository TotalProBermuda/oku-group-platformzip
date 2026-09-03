import { prisma } from "@/lib/prisma";

export function configuredPrimaryOwnerEmail(): string | null {
  const email = process.env.PRIMARY_SUPERADMIN_EMAIL?.trim().toLowerCase();
  return email || null;
}

export function isPrimaryOwnerEmail(email: string | null | undefined): boolean {
  const ownerEmail = configuredPrimaryOwnerEmail();
  return !!ownerEmail && email?.trim().toLowerCase() === ownerEmail;
}

type OAuthIdentity = {
  email?: string | null;
  name?: string | null;
  image?: string | null;
  provider: string;
  emailVerified?: boolean;
};

/**
 * Converts a verified OAuth identity into an existing, active OKÜ account.
 * Accounts are never provisioned just because they share the company domain.
 * The sole exception is the configured primary owner, which is bootstrapped on
 * first Google sign-in so a fresh production database cannot lock out its owner.
 */
export async function authorizeProductionAccount(identity: OAuthIdentity) {
  const email = identity.email?.trim().toLowerCase();
  if (!email) return null;
  if (identity.provider === "google" && identity.emailVerified !== true) return null;

  let account = await prisma.user.findUnique({
    where: { email },
    include: { roles: { select: { roleKey: true } } },
  });

  if (!account && isPrimaryOwnerEmail(email)) {
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name: identity.name?.trim() || "Primary Owner",
        imageUrl: identity.image || null,
        status: "ACTIVE",
      },
    });
    const owner = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.userRole.upsert({
      where: { userId_roleKey: { userId: owner.id, roleKey: "SUPERADMIN" } },
      create: { userId: owner.id, roleKey: "SUPERADMIN" },
      update: {},
    });
    account = await prisma.user.findUnique({
      where: { email },
      include: { roles: { select: { roleKey: true } } },
    });
  }

  if (!account || account.status !== "ACTIVE") return null;

  await prisma.user.update({
    where: { id: account.id },
    data: {
      lastLoginAt: new Date(),
      ...(account.name ? {} : { name: identity.name?.trim() || null }),
      ...(account.imageUrl ? {} : { imageUrl: identity.image || null }),
    },
  });

  return {
    id: account.id,
    email: account.email,
    name: account.name || identity.name || null,
    image: account.imageUrl || identity.image || null,
    roles: account.roles.map((role) => role.roleKey),
  };
}

export async function assertMayManageUser(actorUserId: string, targetUserId: string) {
  const ownerEmail = configuredPrimaryOwnerEmail();
  if (!ownerEmail) return { targetIsPrimaryOwner: false };

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { email: true },
  });
  const targetIsPrimaryOwner = target?.email.toLowerCase() === ownerEmail;
  if (targetIsPrimaryOwner && actorUserId !== targetUserId) {
    throw Object.assign(new Error("The primary owner account can only be managed by its owner"), { status: 403 });
  }
  return { targetIsPrimaryOwner };
}
