import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireSession: vi.fn(), getUploadPresignUrl: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/object-storage", () => ({ getUploadPresignUrl: mocks.getUploadPresignUrl }));
import { POST } from "@/app/api/v1/admin/event-artwork/upload/route";
const request = (body: unknown) => new Request("http://localhost/api/v1/admin/event-artwork/upload", { method: "POST", body: JSON.stringify(body) });
const valid = { filename: "locale.png", contentType: "image/png", size: 1000 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireSession.mockResolvedValue({ userId: "admin-1", roles: ["SUPERADMIN"] });
  mocks.getUploadPresignUrl.mockResolvedValue({ uploadUrl: "https://storage.test/temporary", mediaUrl: "/api/v1/media/bucket/public/uploads/artwork.png" });
});
describe("localized artwork uploads", () => {
  it.each(["FB_DIRECTOR", "PARTNER_ADMIN", "CUSTOMER", "INFLUENCER"])("rejects uploads by %s before requesting a presign", async role => {
    mocks.requireSession.mockResolvedValue({ userId: "other-1", roles: [role] });
    expect((await POST(request(valid))).status).toBe(403);
    expect(mocks.getUploadPresignUrl).not.toHaveBeenCalled();
  });
  it("rejects guests", async () => {
    mocks.requireSession.mockRejectedValue(Object.assign(new Error("Unauthorized"), { status: 401 }));
    expect((await POST(request(valid))).status).toBe(401);
    expect(mocks.getUploadPresignUrl).not.toHaveBeenCalled();
  });
  it("returns permanent media path and derives extension from approved MIME", async () => {
    const response = await POST(request({ ...valid, filename: "untrusted.svg" }));
    expect(response.status).toBe(200);
    expect(mocks.getUploadPresignUrl).toHaveBeenCalledWith("artwork.png", "image/png");
    expect((await response.json()).mediaUrl).toContain("/api/v1/media/");
  });
  it.each([{ ...valid, contentType: "image/svg+xml" }, { ...valid, size: 0 }, { ...valid, size: 10 * 1024 * 1024 + 1 }, null])("rejects invalid upload metadata", async body => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.getUploadPresignUrl).not.toHaveBeenCalled();
  });
  it("fails explicitly when storage is unavailable", async () => {
    mocks.getUploadPresignUrl.mockRejectedValue(new Error("Storage offline"));
    expect((await POST(request(valid))).status).toBe(503);
  });
});
