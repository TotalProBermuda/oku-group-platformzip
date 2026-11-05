import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), redirect: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
import { requireMembershipControlAccess } from "../../src/server/membership/requireControlAccess";

afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });
describe("membership controls server boundary", () => {
  it.each([null, { user: {} }, { user: { roles: ["ADMIN_FINANCE"] } },
    { user: { roles: ["PARTNER"] } }, { user: { roles: "SUPERADMIN" } }])("denies non-Superadmin sessions %j", async session => {
    mocks.session.mockResolvedValue(session);
    mocks.redirect.mockImplementation(() => { throw new Error("REDIRECT"); });
    await expect(requireMembershipControlAccess()).rejects.toThrow("REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/admin");
  });
  it("allows Superadmin without calling a database or mutation API", async () => {
    mocks.session.mockResolvedValue({ user: { roles: ["SUPERADMIN"] } });
    await expect(requireMembershipControlAccess()).resolves.toBeUndefined();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
