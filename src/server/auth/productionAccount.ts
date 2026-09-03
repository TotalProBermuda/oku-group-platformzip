import { prisma } from "@/lib/prisma";
import { LOCAL5_OPERATING_LOCATION } from "@/lib/operatingLocation";

type BootstrapRoleKey =
  | "SUPERADMIN"
  | "FB_DIRECTOR"
  | "RESTAURANT_SUPERVISOR"
  | "ADMIN_HR"
  | "ADMIN_IR";

type BootstrapAccount = {
  roleKey: BootstrapRoleKey;
  venueSlug?: string;
};

const CONFIGURED_BOOTSTRAP_ACCOUNTS = [
  { envKey: "SECONDARY_SUPERADMIN_EMAIL", roleKey: "SUPERADMIN" },
  {
    envKey: "FB_DIRECTOR_EMAIL",
    roleKey: "FB_DIRECTOR",
    venueSlug: LOCAL5_OPERATING_LOCATION.legacyVenueSlug,
  },
  {
    envKey: "RESTAURANT_SUPERVISOR_EMAIL",
    roleKey: "RESTAURANT_SUPERVISOR",
    venueSlug: LOCAL5_OPERATING_LOCATION.legacyVenueSlug,
  },
  { envKey: "ADMIN_HR_EMAIL", roleKey: "ADMIN_HR" },
  { envKey: "ADMIN_IR_EMAIL", roleKey: "ADMIN_IR" },
] as const;

export function configuredPrimaryOwnerEmail(): string | null {
  const email = process.env.PRIMARY_SUPERADMIN_EMAIL?.trim().toLowerCase();
  return email || null;
}

export function isPrimaryOwnerEmail(email: string | null | undefined): boolean {
  const ownerEmail = configuredPrimaryOwnerEmail();
  return !!ownerEmail && email?.trim().toLowerCase() === ownerEmail;
}

function configuredBootstrapAccount(email: string): BootstrapAccount | null {
  if (isPrimaryOwnerEmail(email)) {
    return { roleKey: "SUPERADMIN" };
  }

  for (const config of CONFIGURED_BOOTSTRAP_ACCOUNTS) {
    const configuredEmail = process.env[config.envKey]?.trim().toLowerCase();
    if (configuredEmail && configuredEmail === email) {
      return {
        roleKey: config.roleKey,
        ...("venueSlug" in config ? { venueSlug: config.venueSlug } : {}),
      };
    }
  }

  return null;
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

  const bootstrapAccount =
    identity.provider === "google" && identity.emailVerified === true
      ? configuredBootstrapAccount(email)
      : null;

  let account = await prisma.user.findUnique({
    where: { email },
    include: { roles: { select: { roleKey: true } } },
  });

  if (account && account.status !== "ACTIVE") return null;

  if (bootstrapAccount) {
    account = await prisma.$transaction(async (tx) => {
      const venue = bootstrapAccount.venueSlug
        ? await tx.venue.findUnique({
            where: { slug: bootstrapAccount.venueSlug },
            select: { id: true },
          })
        : null;
      if (bootstrapAccount.venueSlug && !venue) return null;

      const bootstrapUser = await tx.user.upsert({
        where: { email },
        update: {},
        create: {
          email,
          name: identity.name?.trim() || email.split("@")[0],
          imageUrl: identity.image || null,
          status: "ACTIVE",
        },
      });
      await tx.userRole.upsert({
        where: {
          userId_roleKey: {
            userId: bootstrapUser.id,
            roleKey: bootstrapAccount.roleKey,
          },
        },
        create: {
          userId: bootstrapUser.id,
          roleKey: bootstrapAccount.roleKey,
        },
        update: {},
      });
      if (venue) {
        await tx.restaurantHostProfile.upsert({
          where: { userId: bootstrapUser.id },
          update: { venueId: venue.id },
          create: {
            userId: bootstrapUser.id,
            venueId: venue.id,
            displayName: identity.name?.trim() || email.split("@")[0],
            isActive: true,
          },
        });
      }

      return tx.user.findUnique({
        where: { email },
        include: { roles: { select: { roleKey: true } } },
      });
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
