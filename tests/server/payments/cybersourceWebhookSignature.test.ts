import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { verifyCybersourceWebhookSignature } from "@/server/cybersource/webhookSignature";

describe("CyberSource webhook signature verification", () => {
  const now = 1_700_000_000_000;
  const key = Buffer.from("webhook-digital-signature-key").toString("base64");
  const body = Buffer.from('{"eventType":"payments.payments.captured"}');

  function signedHeader(timestamp = now) {
    const signature = crypto
      .createHmac("sha256", Buffer.from(key, "base64"))
      .update(`${timestamp}.${body.toString("utf8")}`, "utf8")
      .digest("base64");
    return `t=${timestamp};keyId=test-key;sig=${signature}`;
  }

  it("accepts CyberSource's timestamped base64 signature", () => {
    expect(
      verifyCybersourceWebhookSignature({
        rawBody: body,
        signatureHeader: signedHeader(),
        digitalSignatureKey: key,
        now,
      }),
    ).toBe(true);
  });

  it("rejects a changed body, malformed header, and expired delivery", () => {
    expect(
      verifyCybersourceWebhookSignature({
        rawBody: Buffer.from("changed"),
        signatureHeader: signedHeader(),
        digitalSignatureKey: key,
        now,
      }),
    ).toBe(false);
    expect(
      verifyCybersourceWebhookSignature({
        rawBody: body,
        signatureHeader: "sha256=not-a-cybersource-header",
        digitalSignatureKey: key,
        now,
      }),
    ).toBe(false);
    expect(
      verifyCybersourceWebhookSignature({
        rawBody: body,
        signatureHeader: signedHeader(now - 300_001),
        digitalSignatureKey: key,
        now,
      }),
    ).toBe(false);
  });
});
