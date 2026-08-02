import { describe, it, expect, vi, afterEach } from "vitest";
import { logRequest, logRequestError } from "@/server/security/requestLogger";

describe("requestLogger", () => {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  afterEach(() => {
    logSpy.mockClear();
    errSpy.mockClear();
  });

  it("scrubs Authorization / Cookie header values from request logs", () => {
    const headers = new Headers();
    headers.set("authorization", "Bearer abc.def.ghi");
    headers.set("cookie", "session=secret-token-xyz");
    headers.set("x-trace-id", "trace-1");

    logRequest({
      method: "GET",
      url: "/admin/payouts/beneficiaries/u_1",
      headers,
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logSpy.mock.calls[0][0] as string;
    const entry = JSON.parse(line);
    expect(entry.headers.authorization).toBe("[REDACTED]");
    expect(entry.headers.cookie).toBe("[REDACTED]");
    expect(entry.headers["x-trace-id"]).toBe("trace-1");
    expect(entry.method).toBe("GET");
  });

  it("scrubs long digit runs in body payloads (e.g. an accidentally-logged account number)", () => {
    logRequest({
      method: "POST",
      url: "/api/v1/me/beneficiary",
      body: { banescoAccountNumber: "9876543210" },
    });
    const entry = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(entry.body.banescoAccountNumber).toBe("[REDACTED:digits]");
    // Raw digits never appear anywhere in the serialized line.
    expect(logSpy.mock.calls[0][0]).not.toContain("9876543210");
  });

  it("logRequestError scrubs error message + headers and writes to stderr", () => {
    logRequestError({
      method: "PATCH",
      url: "/api/v1/admin/payouts/beneficiaries/u_2",
      headers: { authorization: "Bearer leak.this.token" },
      error: new Error("Account 1234567890 is invalid"),
    });
    expect(errSpy).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(errSpy.mock.calls[0][0] as string);
    expect(entry.headers.authorization).toBe("[REDACTED]");
    expect(entry.error.message).toBe("Account [REDACTED:digits] is invalid");
  });
});
