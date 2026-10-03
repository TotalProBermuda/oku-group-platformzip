import { expect, it, vi } from "vitest";
import { exchangePasswordlessLink } from "@/lib/passwordlessExchange";
const dependencies = () => ({
  signOut: vi.fn(async () => undefined),
  signIn: vi.fn(async () => ({ ok: true, url: "/" })),
  getSession: vi.fn(async () => ({ user: { passwordlessDestination: "/partner/seller" } })),
});
it("redirects only after a confirmed session, in order", async () => {
  const deps = dependencies();
  expect(await exchangePasswordlessLink(deps)).toEqual({ ok: true, destination: "/partner/seller" });
  expect(deps.signOut.mock.invocationCallOrder[0]).toBeLessThan(deps.signIn.mock.invocationCallOrder[0]);
  expect(deps.signIn.mock.invocationCallOrder[0]).toBeLessThan(deps.getSession.mock.invocationCallOrder[0]);
});
it.each(["signOut", "signIn", "getSession"] as const)("recovers from %s failure without automatic replay", async step => {
  const deps = dependencies();
  deps[step].mockRejectedValue(new Error("private provider details"));
  expect(await exchangePasswordlessLink(deps)).toEqual({ ok: false, reason: "CONNECTION" });
  expect(deps.signIn.mock.calls.length).toBe(step === "signOut" ? 0 : 1);
});
it("does not look up a session after a rejected credential", async () => {
  const deps = dependencies();
  deps.signIn.mockResolvedValue({ ok: false, url: "/" });
  expect(await exchangePasswordlessLink(deps)).toEqual({ ok: false, reason: "INVALID_LINK" });
  expect(deps.getSession).not.toHaveBeenCalled();
});
it("does not claim success with a missing session", async () => {
  const deps = dependencies();
  deps.getSession.mockResolvedValue(null as never);
  expect(await exchangePasswordlessLink(deps)).toEqual({ ok: false, reason: "CONNECTION" });
});
it.each(["https://evil.invalid", "//evil.invalid", "/\\evil.invalid", "/\r\nLocation: evil"])("rejects unsafe redirect %s", async path => {
  const deps = dependencies();
  deps.getSession.mockResolvedValue({ user: { passwordlessDestination: path } });
  expect(await exchangePasswordlessLink(deps)).toEqual({ ok: true, destination: "/my" });
});
