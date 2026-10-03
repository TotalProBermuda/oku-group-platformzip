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
  mocks.auth.mockResolvedValue(session); mocks.user.mockResolvedValue({ id: "user" });
  expect(await requireSession()).toEqual({ session, userId: "user", roles: ["PARTNER_SELLER"] });
});
it("preserves existing stale-ID fallback without granting roles", async () => {
  mocks.auth.mockResolvedValue({ user: { id: "old", email: "test@example.invalid" } });
  mocks.user.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "current" });
  const result = await requireSession();
  expect(result.userId).toBe("current"); expect(result.roles).toEqual([]);
});
