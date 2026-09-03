import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  userFindUnique: vi.fn(),
  userUpsert: vi.fn(),
  userUpdate: vi.fn(),
  userRoleUpsert: vi.fn(),
  venueFindUnique: vi.fn(),
  restaurantHostProfileUpsert: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    user: {
      findUnique: mocks.userFindUnique,
      upsert: mocks.userUpsert,
      update: mocks.userUpdate,
    },
    userRole: { upsert: mocks.userRoleUpsert },
    venue: { findUnique: mocks.venueFindUnique },
    restaurantHostProfile: { upsert: mocks.restaurantHostProfileUpsert },
  },
}));

import {
  assertMayManageUser,
  authorizeProductionAccount,
  configuredPrimaryOwnerEmail,
} from "@/server/auth/productionAccount";

describe("production Google Workspace accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback) => callback({
      user: {
        findUnique: mocks.userFindUnique,
        upsert: mocks.userUpsert,
      },
      userRole: { upsert: mocks.userRoleUpsert },
      venue: { findUnique: mocks.venueFindUnique },
      restaurantHostProfile: { upsert: mocks.restaurantHostProfileUpsert },
    }));
    mocks.userUpsert.mockImplementation(async ({ create }) => ({
      id: "bootstrap-user",
      ...create,
    }));
    process.env.PRIMARY_SUPERADMIN_EMAIL = "Denzil@OKUHospitalityGroup.com ";
    delete process.env.SECONDARY_SUPERADMIN_EMAIL;
    delete process.env.FB_DIRECTOR_EMAIL;
    delete process.env.RESTAURANT_SUPERVISOR_EMAIL;
    delete process.env.ADMIN_HR_EMAIL;
    delete process.env.ADMIN_IR_EMAIL;
  });

  it("normalizes the configured primary owner email", () => {
    expect(configuredPrimaryOwnerEmail()).toBe("denzil@okuhospitalitygroup.com");
  });

  it("rejects an unverified Google identity", async () => {
    await expect(authorizeProductionAccount({
      provider: "google",
      email: "denzil@okuhospitalitygroup.com",
      emailVerified: false,
    })).resolves.toBeNull();
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
  });

  it("rejects an unknown non-owner instead of domain-auto-provisioning", async () => {
    mocks.userFindUnique.mockResolvedValueOnce(null);
    await expect(authorizeProductionAccount({
      provider: "google",
      email: "stranger@okuhospitalitygroup.com",
      emailVerified: true,
    })).resolves.toBeNull();
    expect(mocks.userUpsert).not.toHaveBeenCalled();
  });

  it("bootstraps only the configured owner and grants SUPERADMIN", async () => {
    const owner = {
      id: "owner-1",
      email: "denzil@okuhospitalitygroup.com",
      name: "Denzil Nelson",
      imageUrl: null,
      status: "ACTIVE",
      roles: [{ roleKey: "SUPERADMIN" }],
    };
    mocks.userFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(owner);
    mocks.userUpsert.mockResolvedValueOnce(owner);
    mocks.userUpdate.mockResolvedValueOnce(owner);

    await expect(authorizeProductionAccount({
      provider: "google",
      email: "DENZIL@okuhospitalitygroup.com",
      name: "Denzil Nelson",
      emailVerified: true,
    })).resolves.toMatchObject({ id: "owner-1", roles: ["SUPERADMIN"] });

    expect(mocks.userRoleUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: { userId: "owner-1", roleKey: "SUPERADMIN" },
    }));
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });

  it("bootstraps the configured secondary superadmin without owner protection", async () => {
    process.env.SECONDARY_SUPERADMIN_EMAIL = "tonka@okuhospitalitygroup.com";
    const account = {
      id: "admin-2",
      email: "tonka@okuhospitalitygroup.com",
      name: "Tonka",
      imageUrl: null,
      status: "ACTIVE",
      roles: [{ roleKey: "SUPERADMIN" }],
    };
    mocks.userFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(account);
    mocks.userUpsert.mockResolvedValueOnce(account);
    mocks.userUpdate.mockResolvedValueOnce(account);

    await expect(authorizeProductionAccount({
      provider: "google",
      email: "tonka@okuhospitalitygroup.com",
      name: "Tonka",
      emailVerified: true,
    })).resolves.toMatchObject({ id: "admin-2", roles: ["SUPERADMIN"] });

    expect(mocks.userRoleUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: { userId: "admin-2", roleKey: "SUPERADMIN" },
    }));
    expect(mocks.restaurantHostProfileUpsert).not.toHaveBeenCalled();
  });

  it.each([
    ["FB_DIRECTOR_EMAIL", "admin@okuhospitalitygroup.com", "FB_DIRECTOR"],
    ["RESTAURANT_SUPERVISOR_EMAIL", "events@okuhospitalitygroup.com", "RESTAURANT_SUPERVISOR"],
  ])("bootstraps %s with a Gold House host profile", async (envKey, email, roleKey) => {
    process.env[envKey] = email;
    const account = {
      id: `${roleKey.toLowerCase()}-1`,
      email,
      name: "Operations User",
      imageUrl: null,
      status: "ACTIVE",
      roles: [{ roleKey }],
    };
    mocks.userFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(account);
    mocks.userUpsert.mockResolvedValueOnce(account);
    mocks.userUpdate.mockResolvedValueOnce(account);
    mocks.venueFindUnique.mockResolvedValueOnce({ id: "gold-house-1" });

    await expect(authorizeProductionAccount({
      provider: "google",
      email,
      name: "Operations User",
      emailVerified: true,
    })).resolves.toMatchObject({ roles: [roleKey] });

    expect(mocks.userRoleUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: { userId: account.id, roleKey },
    }));
    expect(mocks.restaurantHostProfileUpsert).toHaveBeenCalledWith({
      where: { userId: account.id },
      update: { venueId: "gold-house-1" },
      create: {
        userId: account.id,
        venueId: "gold-house-1",
        displayName: "Operations User",
        isActive: true,
      },
    });
  });

  it("rejects venue-bound provisioning when Gold House is missing", async () => {
    process.env.FB_DIRECTOR_EMAIL = "admin@okuhospitalitygroup.com";
    mocks.userFindUnique.mockResolvedValueOnce(null);
    mocks.venueFindUnique.mockResolvedValueOnce(null);

    await expect(authorizeProductionAccount({
      provider: "google",
      email: "admin@okuhospitalitygroup.com",
      emailVerified: true,
    })).resolves.toBeNull();

    expect(mocks.userUpsert).not.toHaveBeenCalled();
    expect(mocks.userRoleUpsert).not.toHaveBeenCalled();
    expect(mocks.restaurantHostProfileUpsert).not.toHaveBeenCalled();
  });

  it.each([
    ["ADMIN_HR_EMAIL", "hr@okuhospitalitygroup.com", "ADMIN_HR"],
    ["ADMIN_IR_EMAIL", "ir@okuhospitalitygroup.com", "ADMIN_IR"],
  ])("supports future explicitly configured %s accounts without domain-wide provisioning", async (
    envKey,
    email,
    roleKey,
  ) => {
    process.env[envKey] = email;
    const account = {
      id: `${roleKey.toLowerCase()}-1`,
      email,
      name: null,
      imageUrl: null,
      status: "ACTIVE",
      roles: [{ roleKey }],
    };
    mocks.userFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(account);
    mocks.userUpsert.mockResolvedValueOnce(account);
    mocks.userUpdate.mockResolvedValueOnce(account);

    await expect(authorizeProductionAccount({
      provider: "google",
      email,
      emailVerified: true,
    })).resolves.toMatchObject({ roles: [roleKey] });

    expect(mocks.userRoleUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: { userId: account.id, roleKey },
    }));
    expect(mocks.restaurantHostProfileUpsert).not.toHaveBeenCalled();
  });

  it("does not grant configured roles to an existing suspended account", async () => {
    process.env.SECONDARY_SUPERADMIN_EMAIL = "tonka@okuhospitalitygroup.com";
    mocks.userFindUnique.mockResolvedValueOnce({
      id: "suspended-1",
      email: "tonka@okuhospitalitygroup.com",
      status: "SUSPENDED",
      roles: [],
    });

    await expect(authorizeProductionAccount({
      provider: "google",
      email: "tonka@okuhospitalitygroup.com",
      emailVerified: true,
    })).resolves.toBeNull();

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.userRoleUpsert).not.toHaveBeenCalled();
  });

  it("prevents another administrator from managing the primary owner", async () => {
    mocks.userFindUnique.mockResolvedValueOnce({ email: "denzil@okuhospitalitygroup.com" });
    await expect(assertMayManageUser("tonka-1", "owner-1")).rejects.toMatchObject({ status: 403 });
  });

  it("allows the primary owner to manage their own non-destructive profile fields", async () => {
    mocks.userFindUnique.mockResolvedValueOnce({ email: "denzil@okuhospitalitygroup.com" });
    await expect(assertMayManageUser("owner-1", "owner-1")).resolves.toEqual({ targetIsPrimaryOwner: true });
  });
});
