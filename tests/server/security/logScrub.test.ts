import { describe, it, expect } from "vitest";
import {
  scrubLogString,
  scrubLogPayload,
  scrubErrorMessage,
  redactEmailForLog,
} from "@/server/security/logScrub";

describe("scrubLogString", () => {
  it("strips long digit runs (≥9)", () => {
    const out = scrubLogString("account 1234567890 ok");
    expect(out).toBe("account [REDACTED:digits] ok");
    expect(scrubLogString("year 2026")).toBe("year 2026"); // short runs untouched
  });

  it("strips iv.ct.tag ciphertext shapes from @/server/security/encryption", () => {
    const cipher = "abc12345.def67890ZZ.ghi45678QQ";
    const out = scrubLogString(`secret=${cipher}!`);
    expect(out).toContain("[REDACTED:cipher]");
    expect(out).not.toContain(cipher);
    // Does not eat normal dotted text.
    expect(scrubLogString("v1.2.3")).toBe("v1.2.3");
    expect(scrubLogString("report.tar.gz")).toBe("report.tar.gz");
  });

  it("strips Panama cedula / RUC formats", () => {
    expect(scrubLogString("cedula 8-123-1234")).toBe("cedula [REDACTED:idcard]");
    expect(scrubLogString("ruc 123-456-789012-1")).toContain("[REDACTED:idcard]");
    expect(scrubLogString("PE-12-345-6789")).toContain("[REDACTED:idcard]");
  });
});

describe("scrubLogPayload", () => {
  it("recurses into nested objects and arrays", () => {
    const out = scrubLogPayload({
      ok: true,
      body: {
        accountNumber: "9876543210",
        notes: ["cedula 8-100-2000", "harmless"],
      },
    });
    expect(out).toEqual({
      ok: true,
      body: {
        accountNumber: "[REDACTED:digits]",
        notes: ["cedula [REDACTED:idcard]", "harmless"],
      },
    });
  });

  it("redacts Authorization, Cookie, set-cookie header values entirely", () => {
    const out = scrubLogPayload({
      headers: {
        Authorization: "Bearer abc.def.ghi",
        Cookie: "session=xyz; other=1",
        "set-cookie": "session=xyz; HttpOnly",
        "x-trace-id": "trace-7",
      },
    }) as { headers: Record<string, string> };
    expect(out.headers.Authorization).toBe("[REDACTED]");
    expect(out.headers.Cookie).toBe("[REDACTED]");
    expect(out.headers["set-cookie"]).toBe("[REDACTED]");
    expect(out.headers["x-trace-id"]).toBe("trace-7");
  });

  it("normalizes Error instances and scrubs their message + stack", () => {
    const err = new Error("Account 1234567890 rejected");
    const out = scrubLogPayload(err) as { name: string; message: string };
    expect(out.name).toBe("Error");
    expect(out.message).toBe("Account [REDACTED:digits] rejected");
  });

  it("breaks reference cycles with [Circular]", () => {
    const a: Record<string, unknown> = { name: "a" };
    a.self = a;
    const out = scrubLogPayload(a) as Record<string, unknown>;
    expect(out.self).toBe("[Circular]");
  });

  it("leaves primitives untouched", () => {
    expect(scrubLogPayload(42)).toBe(42);
    expect(scrubLogPayload(null)).toBeNull();
    expect(scrubLogPayload(undefined)).toBeUndefined();
    expect(scrubLogPayload(true)).toBe(true);
  });
});

describe("scrubErrorMessage", () => {
  it("scrubs digit runs from Error messages so HTTP responses cannot leak account numbers", () => {
    const err = new Error("Invalid bank account 1234567890");
    expect(scrubErrorMessage(err)).toBe("Invalid bank account [REDACTED:digits]");
  });
  it("scrubs ID-card patterns from string throws", () => {
    expect(scrubErrorMessage("rejected for cedula 8-123-1234")).toBe(
      "rejected for cedula [REDACTED:idcard]",
    );
  });
  it("scrubs ciphertext shapes that may appear in Prisma error quotes", () => {
    const out = scrubErrorMessage(
      new Error("decrypt failed for abc12345.def67890ZZ.ghi45678QQ"),
    );
    expect(out).toContain("[REDACTED:cipher]");
    expect(out).not.toContain("ghi45678QQ");
  });
  it("returns a safe placeholder for non-Error / non-string throws", () => {
    expect(scrubErrorMessage({ weird: true })).toBe("Internal error");
    expect(scrubErrorMessage(undefined)).toBe("Internal error");
    expect(scrubErrorMessage(null)).toBe("Internal error");
    expect(scrubErrorMessage(new Error(""))).toBe("Internal error");
  });
});

describe("redactEmailForLog", () => {
  it("masks the local-part", () => {
    expect(redactEmailForLog("jane@example.com")).toBe("j***@example.com");
  });
  it("returns *** for null/empty/no-domain", () => {
    expect(redactEmailForLog(null)).toBe("***");
    expect(redactEmailForLog("")).toBe("***");
    expect(redactEmailForLog("noatsign")).toBe("***");
  });
});
