import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ find: vi.fn(), auth: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { eventInvitation: { findUnique: mocks.find }, eventRegistrant: { upsert: mocks.upsert } } }));
vi.mock("next-auth", () => ({ getServerSession: mocks.auth }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
import { validateToken } from "@/server/invitation/tokenService";
import { POST } from "@/app/api/v1/invitations/[token]/confirm-free/route";
import { NextRequest } from "next/server";
beforeEach(() => vi.resetAllMocks());
it.each(["REVOKED", "EXPIRED", "DECLINED"])("rejects %s without returning invitation data", async status => {
  mocks.find.mockResolvedValue({ status });
  expect(await validateToken("test-token")).toEqual({ valid: false, reason: status });
});
it("rejects an unknown token", async () => {
  mocks.find.mockResolvedValue(null);
  expect(await validateToken("missing")).toEqual({ valid: false, reason: "NOT_FOUND" });
});
it("returns a typed invitation only for a valid result", async () => {
  const invitation = { id: "invite", status: "SENT" }; mocks.find.mockResolvedValue(invitation);
  const result = await validateToken("test-token");
  if (!result.valid) throw new Error("Expected valid token");
  expect(result.invitation.id).toBe("invite");
});
it("rejects an incomplete session before any registration write", async () => {
  mocks.auth.mockResolvedValue({ user: { email: "test@example.invalid" } });
  const response = await POST(new NextRequest("http://localhost/test", { method: "POST" }), { params: Promise.resolve({ token: "test" }) });
  expect(response.status).toBe(401); expect(mocks.find).not.toHaveBeenCalled(); expect(mocks.upsert).not.toHaveBeenCalled();
});
