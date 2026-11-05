import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), profile: vi.fn(), series: vi.fn(), actor: vi.fn(), referrals: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ requireSession: mocks.auth }));
vi.mock("@/server/referrals/myReferralsSource", () => ({ getMyReferrals: mocks.referrals }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  partnerProfile: { findUnique: mocks.profile }, series: { findMany: mocks.series }, referralActor: { findFirst: mocks.actor },
} }));
import { GET } from "@/app/api/v1/partner/dashboard/route";
beforeEach(() => { vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ userId: "partner-user" });
  mocks.profile.mockResolvedValue({ id: "partner", name: "Partner" });
  mocks.series.mockResolvedValue([]); mocks.referrals.mockResolvedValue([]);
});
it("queries the schema's active links relation and retains referral code", async () => {
  mocks.actor.mockResolvedValue({ actorTypeCode: "PARTNER", links: [{ code: "TEST" }] });
  const response = await GET();
  expect(response.status).toBe(200);
  expect(mocks.actor).toHaveBeenCalledWith({ where: { userId: "partner-user" }, select: {
    actorTypeCode: true, links: { where: { isActive: true }, select: { code: true }, orderBy: { createdAt: "asc" }, take: 1 },
  } });
  expect((await response.json()).referral.referralCode).toBe("TEST");
});
it.each([null, { actorTypeCode: "PARTNER", links: [] }])("supports a partner without an active code", async actor => {
  mocks.actor.mockResolvedValue(actor);
  expect((await (await GET()).json()).referral.referralCode).toBeNull();
});
it("does not query partner data without authentication", async () => {
  mocks.auth.mockRejectedValue(new Error("Unauthorized"));
  expect((await GET()).status).toBe(401); expect(mocks.profile).not.toHaveBeenCalled();
});
it("requires a partner profile before querying referral identity", async () => {
  mocks.profile.mockResolvedValue(null);
  expect((await GET()).status).toBe(403); expect(mocks.actor).not.toHaveBeenCalled();
});
