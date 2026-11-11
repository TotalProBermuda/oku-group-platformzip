import { prisma } from "@/lib/prisma";
import { getResendClient, isResendConfigured } from "@/server/invitation/resend";
import { safeEnqueue } from "@/server/queue/queue";

const APP_URL = (process.env.NEXTAUTH_URL || process.env.APP_URL || "https://www.okuhospitalitygroup.com").replace(/\/$/, "");

/** Persist an in-app alert for each active SuperAdmin, then send email best-effort. */
export async function alertSuperadminsOfGuestChat(input: {
  sessionId: string; guestName: string; venueName: string; preview: string;
  reason: "new_chat" | "guest_waiting"; dedupeKey: string;
}) {
  const admins = await prisma.userRole.findMany({
    where: { roleKey: "SUPERADMIN", user: { status: "ACTIVE" } },
    select: { user: { select: { id: true, email: true } } },
  });
  const recipients = admins.flatMap((row) => row.user ? [row.user] : []);
  if (!recipients.length) return { notified: 0, emailed: 0 };
  const title = input.reason === "new_chat" ? "New guest chat" : "Guest is waiting in chat";
  const preview = input.preview.replace(/\s+/g, " ").slice(0, 180);
  const body = `${input.guestName} · ${input.venueName}: ${preview}`;
  const href = `/host/dashboard?tab=chat&session=${encodeURIComponent(input.sessionId)}`;
  await Promise.all(recipients.map(({ id }) => prisma.notification.upsert({
    where: { id: `chat_alert_${input.dedupeKey}_${id}` }, update: {},
    create: { id: `chat_alert_${input.dedupeKey}_${id}`, userId: id, title, body, href },
  })));
  if (!isResendConfigured()) return { notified: recipients.length, emailed: 0 };
  const sends = await Promise.allSettled(recipients.map(({ id, email }) => safeEnqueue("send_chat_alert_email", {
    to: email, subject: `${title} — ${input.venueName}`,
    body: `${body}\n\nOpen the OKÜ host dashboard to reply: ${APP_URL}${href}\n\nGuest conversations remain in the OKÜ chat dashboard.`,
  }, `chat-alert-${input.dedupeKey}-${id}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 180))));
  for (const result of sends) if (result.status === "rejected") console.error("[guest-chat-alert] email enqueue failed", result.reason);
  return { notified: recipients.length, emailed: sends.filter((result) => result.status === "fulfilled").length };
}

export async function sendChatAlertEmail(input: { to: string; subject: string; body: string }) {
  const { client, fromEmail } = await getResendClient();
  const result = await client.emails.send({ from: fromEmail, to: input.to, subject: input.subject, text: input.body });
  if (result.error) throw new Error(`Resend rejected chat alert: ${result.error.message}`);
  return result;
}
