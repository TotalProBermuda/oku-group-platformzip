import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ requireSession: vi.fn() }));
const store = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  experienceAddon: { findFirst: vi.fn(), update: vi.fn() },
  contentTranslation: { findUnique: vi.fn(), upsert: vi.fn() },
  auditLog: { create: vi.fn() },
}));
vi.mock("@/server/auth/session", () => auth);
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: async (fn: (tx: typeof store) => unknown) => fn(store) } }));
import { PATCH } from "@/app/api/v1/admin/experiences/[id]/addons/[addonId]/route";
const request = (data: unknown = { name: "English pairing", description: "Wine selection" }) => new Request("http://fixture.test/api/v1/admin/experiences/series/addons/addon", { method: "PATCH", body: JSON.stringify(data) });
const params = { params: Promise.resolve({ id: "series", addonId: "addon" }) };
beforeEach(() => {
  vi.clearAllMocks();
  auth.requireSession.mockResolvedValue({ userId: "admin", roles: ["SUPERADMIN"] });
  store.experienceAddon.findFirst.mockResolvedValue({ id: "addon", seriesId: "series" });
  store.experienceAddon.update.mockResolvedValue({ id: "addon" });
  store.contentTranslation.findUnique.mockResolvedValue(null);
});
describe("event add-on English editing authorization and atomic translation scheduling", () => {
  it.each(["CUSTOMER", "PARTNER", "FB_DIRECTOR"])("denies %s before touching the store", async role => {
    auth.requireSession.mockResolvedValue({ userId: "user", roles: [role] });
    expect((await PATCH(request(), params)).status).toBe(403);
    expect(store.experienceAddon.findFirst).not.toHaveBeenCalled();
    expect(store.contentTranslation.upsert).not.toHaveBeenCalled();
  });
  it("denies signed-out requests", async () => {
    auth.requireSession.mockRejectedValue(Object.assign(new Error("Unauthorized"), { status: 401 }));
    expect((await PATCH(request(), params)).status).toBe(401);
    expect(store.contentTranslation.upsert).not.toHaveBeenCalled();
  });
  it("requires add-on ownership by the requested series", async () => {
    store.experienceAddon.findFirst.mockResolvedValue(null);
    expect((await PATCH(request(), params)).status).toBe(404);
    expect(store.experienceAddon.findFirst).toHaveBeenCalledWith({ where: { id: "addon", seriesId: "series" } });
    expect(store.contentTranslation.upsert).not.toHaveBeenCalled();
  });
  it("does not allow an inventory or translated-text bypass through this endpoint", async () => {
    expect((await PATCH(request({ name: "English", description: "", soldCount: 0, nameEs: "Español" }), params)).status).toBe(400);
    expect(store.experienceAddon.update).not.toHaveBeenCalled();
  });
  it("writes English and both translations together and audits identifiers only", async () => {
    expect((await PATCH(request(), params)).status).toBe(200);
    expect(store.contentTranslation.upsert).toHaveBeenCalledTimes(4);
    expect(store.experienceAddon.update).toHaveBeenCalledWith({ where: { id: "addon" }, data: { name: "English pairing", description: "Wine selection" } });
    expect(JSON.stringify(store.auditLog.create.mock.calls)).not.toContain("Wine selection");
  });
});
