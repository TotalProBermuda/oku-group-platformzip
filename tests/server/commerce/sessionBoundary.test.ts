import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: mocks.auth }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.user } } }));
import { requireSession, getOptionalSession } from "@/server/auth/session";
beforeEach(() => vi.resetAllMocks());
it.each([null, { user: { email: "guest@example.invalid" } }])("does not assume identity from an incomplete session", async session => {
  mocks.auth.mockResolvedValue(session);
  expect(await getOptionalSession()).toBeNull();
  await expect(requireSession()).rejects.toMatchObject({ status: 401 });
  expect(mocks.user).not.toHaveBeenCalled();
});
it("retains identity and roles after narrowing a valid session", async () => {
  const session = { user: { id: "user", email: "test@example.invalid", roles: ["PARTNER_SELLER"] }, expires: "future" };
  mocks.auth.mockResolvedValue(session); mocks.user.mockResolvedValue({
    id: "user", email: "test@example.invalid", status: "ACTIVE", roles: [{ roleKey: "PARTNER_SELLER" }],
  });
  expect(await requireSession()).toEqual({ session, userId: "user", roles: ["PARTNER_SELLER"] });
});
it("rejects a stale identity without rebinding it to another account by email", async () => {
  mocks.auth.mockResolvedValue({ user: { id: "old", email: "test@example.invalid" } });
  mocks.user.mockResolvedValue(null);
  await expect(requireSession()).rejects.toMatchObject({ status: 401 });
  expect(mocks.user).toHaveBeenCalledTimes(1);
  expect(mocks.user.mock.calls[0][0].where).toEqual({ id: "old" });
});
it("fails closed when account revalidation cannot reach the database", async () => {
  mocks.auth.mockResolvedValue({ user: { id: "user", roles: ["SUPERADMIN"] } });
  const failure = new Error("Database unavailable");
  mocks.user.mockRejectedValue(failure);
  await expect(getOptionalSession()).rejects.toBe(failure);
  await expect(requireSession()).rejects.toBe(failure);
});
