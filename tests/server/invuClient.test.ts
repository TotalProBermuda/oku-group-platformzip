import { describe, expect, it, vi } from "vitest";
import { authenticate, getClosedOrders } from "@/lib/invu/client";

describe("INVU client", () => {
  it("does not copy an authentication response body into an error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"token":"should-never-appear"}',
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(authenticate("user", "password")).rejects.toThrow("INVU auth failed (401)");
    await expect(authenticate("user", "password")).rejects.not.toThrow("should-never-appear");
    vi.unstubAllGlobals();
  });

  it("does not copy a closed-orders error body into an error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => '{"authorization":"should-never-appear"}',
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getClosedOrders("vendor-token", "branch", new Date(0), new Date(1))).rejects.toThrow(
      "INVU getClosedOrders failed (500)",
    );
    await expect(getClosedOrders("vendor-token", "branch", new Date(0), new Date(1))).rejects.not.toThrow(
      "should-never-appear",
    );
    vi.unstubAllGlobals();
  });
});
