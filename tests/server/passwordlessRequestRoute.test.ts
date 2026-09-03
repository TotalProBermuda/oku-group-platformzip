import { describe, expect, it, vi } from "vitest";

const issue = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/passwordless", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/passwordless")>();
  return { ...actual, issuePasswordlessToken: issue };
});

import { POST } from "@/app/api/auth/passwordless/request/route";

function request(email: string, ip: string) {
  return new Request("https://app.example/api/auth/passwordless/request", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "app.example",
      origin: "https://app.example",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify({ email, callbackUrl: "/account", _company: "" }),
  });
}

describe("passwordless request endpoint", () => {
  it("returns identical public responses for eligible and ineligible addresses", async () => {
    issue.mockResolvedValueOnce({ issued: true }).mockResolvedValueOnce({ issued: false });
    const eligible = await POST(request("eligible-1@example.com", "198.51.100.1") as any);
    const ineligible = await POST(request("ineligible-1@example.com", "198.51.100.2") as any);
    expect(eligible.status).toBe(200);
    expect(ineligible.status).toBe(200);
    expect(await eligible.json()).toEqual(await ineligible.json());
  });

  it("rate limits by normalized email independently of source IP", async () => {
    issue.mockResolvedValue({ issued: false });
    const email = "rate-limit-passwordless@example.com";
    for (let index = 0; index < 3; index++) {
      const response = await POST(request(email, `203.0.113.${index + 1}`) as any);
      expect(response.status).toBe(200);
    }
    const blocked = await POST(request(email.toUpperCase(), "203.0.113.10") as any);
    expect(blocked.status).toBe(429);
  });

  it("rejects cross-origin email-spam attempts", async () => {
    const req = request("origin-check@example.com", "192.0.2.1");
    req.headers.set("origin", "https://evil.example");
    const response = await POST(req as any);
    expect(response.status).toBe(403);
    expect(issue).not.toHaveBeenCalledWith(expect.objectContaining({
      email: "origin-check@example.com",
    }));
  });
});