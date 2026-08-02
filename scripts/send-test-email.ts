import { getResendClient } from "../src/server/invitation/resend";

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error("Usage: tsx scripts/send-test-email.ts <recipient>");
    process.exit(1);
  }
  const { client, fromEmail } = await getResendClient();
  const sent = await client.emails.send({
    from: fromEmail,
    to,
    subject: "OKÜ — Resend Test Email",
    text:
      "This is a test email from the OKÜ platform Resend integration.\n\n" +
      `Sent at: ${new Date().toISOString()}\n` +
      `From: ${fromEmail}\n` +
      `To: ${to}\n`,
  });
  const errorMessage = (sent as { error?: { message?: string } | null })?.error?.message ?? null;
  console.log(JSON.stringify({ ok: !errorMessage, to, fromEmail, error: errorMessage, raw: sent }, null, 2));
  process.exit(errorMessage ? 1 : 0);
}

main().catch((err) => {
  console.error("Send failed:", err);
  process.exit(1);
});
