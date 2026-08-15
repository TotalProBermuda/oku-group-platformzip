import { describe, expect, it, vi } from "vitest";
import { authenticate } from "@/lib/invu/client";

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
});
