import { describe, expect, it, vi } from "vitest";
import { authenticate, getClosedOrders, getInvoiceByNumCita } from "@/lib/invu/client";

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

  it("surfaces an INVU HTTP-200 authorization body instead of treating it as an empty list", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"status":403,"error":"token details must not leak"}',
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getClosedOrders("vendor-token", "branch", new Date(0), new Date(1))).rejects.toThrow(
      "INVU getClosedOrders authorization or provider error (403)",
    );
    await expect(getClosedOrders("vendor-token", "branch", new Date(0), new Date(1))).rejects.not.toThrow(
      "token details must not leak",
    );
    vi.unstubAllGlobals();
  });

  it("looks up a bound ticket by num_cita and returns its invoice envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"encontro":true,"id":"provider-id","num_cita":"1-2-4982-44729"}',
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getInvoiceByNumCita("vendor-token", "1-2-4982-44729")).resolves.toMatchObject({
      encontro: true,
      num_cita: "1-2-4982-44729",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("r=citas/view/id/1-2-4982-44729/tipo/0"),
      expect.objectContaining({ method: "GET" }),
    );
    vi.unstubAllGlobals();
  });
});
