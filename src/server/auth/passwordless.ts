import { createHash, randomBytes } from "node:crypto";
import type { PasswordlessTokenPurpose, Prisma, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getResendClient } from "@/server/invitation/resend";
import { sanitizeCallbackUrlForRoles } from "@/lib/routePolicy";

const TOKEN_TTL_MS = 15 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PasswordlessIdentity = {
  id: string;
  email: string;
  name: string | null;
  status: UserStatus;
  roles: string[];
  destination: string;
};

type SupportedLocale = "en" | "es" | "pt";

function normalizeLocale(value: unknown): SupportedLocale {
  if (typeof value !== "string") return "en";
  const locale = value.trim().toLowerCase().split("-")[0];
  return locale === "es" || locale === "pt" ? locale : "en";
}

export function normalizePasswordlessEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidPasswordlessEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_PATTERN.test(value);
}

export function hashPasswordlessToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function passwordlessEmailRateLimitKey(email: string): string {
  return createHash("sha256").update(normalizePasswordlessEmail(email), "utf8").digest("hex");
}

/**
 * Accept only same-origin paths. The role-aware redirect callback performs a
 * second authorization pass after sign-in.
 */
export function sanitizePasswordlessCallback(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (
    !candidate ||
    candidate === "/" ||
    candidate.length > 500 ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /[\r\n]/.test(candidate)
  ) {
    return null;
  }
  try {
    const parsed = new URL(candidate, "https://local.invalid");
    if (parsed.origin !== "https://local.invalid") return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function publicBaseUrl(): string {
  const configured =
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_BASE_URL ??
    process.env.APP_URL;
  if (!configured) {
    throw new Error("NEXTAUTH_URL or APP_URL is required for passwordless email");
  }
  const parsed = new URL(configured);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Passwordless email base URL must use HTTP(S)");
  }
  return parsed.origin;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildMagicLink(rawToken: string, email: string): string {
  // The credential lives in the URL fragment, which browsers do not send in
  // HTTP request lines, referrers, or server access logs.
  const fragment = new URLSearchParams({ token: rawToken, email });
  return `${publicBaseUrl()}/auth/verify#${fragment.toString()}`;
}

async function sendPasswordlessEmail(input: {
  email: string;
  name: string | null;
  rawToken: string;
  purpose: PasswordlessTokenPurpose;
  locale: SupportedLocale;
}) {
  const resend = await getResendClient();
  const isInvite = input.purpose === "REFERRER_INVITE";
  const link = buildMagicLink(input.rawToken, input.email);
  const copy = {
    en: {
      greeting: input.name ? `Hi ${escapeHtml(input.name)},` : "Hello,",
      subject: isInvite ? "Your OKÜ referrer invitation" : "Your secure OKÜ sign-in link",
      heading: isInvite ? "Your referrer access is ready" : "Sign in to OKÜ",
      intro: isInvite
        ? "Use this secure link to open your referrer dashboard. This invitation is tied to this email address."
        : "Use this secure link to access your OKÜ bookings and account.",
      button: "Continue securely",
      footer: "This one-time link expires in 15 minutes. If you did not request it, you can ignore this email.",
    },
    es: {
      greeting: input.name ? `Hola ${escapeHtml(input.name)},` : "Hola,",
      subject: isInvite ? "Tu invitación de referente de OKÜ" : "Tu enlace seguro para iniciar sesión en OKÜ",
      heading: isInvite ? "Tu acceso de referente está listo" : "Inicia sesión en OKÜ",
      intro: isInvite
        ? "Usa este enlace seguro para abrir tu panel de referente. La invitación está vinculada a este correo."
        : "Usa este enlace seguro para acceder a tus reservas y a tu cuenta de OKÜ.",
      button: "Continuar de forma segura",
      footer: "Este enlace de un solo uso caduca en 15 minutos. Si no lo solicitaste, puedes ignorar este correo.",
    },
    pt: {
      greeting: input.name ? `Olá ${escapeHtml(input.name)},` : "Olá,",
      subject: isInvite ? "Seu convite de indicador da OKÜ" : "Seu link seguro para entrar na OKÜ",
      heading: isInvite ? "Seu acesso de indicador está pronto" : "Entre na OKÜ",
      intro: isInvite
        ? "Use este link seguro para abrir seu painel de indicador. O convite está vinculado a este e-mail."
        : "Use este link seguro para acessar suas reservas e sua conta da OKÜ.",
      button: "Continuar com segurança",
      footer: "Este link de uso único expira em 15 minutos. Se você não o solicitou, ignore este e-mail.",
    },
  }[input.locale];

  const result = await resend.client.emails.send({
    from: `OKÜ Hospitality Group <${resend.fromEmail}>`,
    to: input.email,
    subject: copy.subject,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1614">
        <div style="background:#1a1614;padding:24px;text-align:center">
          <span style="color:#c41e3a;font:700 24px Georgia,serif">OKÜ</span>
          <span style="color:#9ca3af;font-size:11px;letter-spacing:.15em;margin-left:8px">HOSPITALITY GROUP</span>
        </div>
        <div style="padding:36px">
          <h1 style="font:700 26px Georgia,serif">${copy.heading}</h1>
          <p>${copy.greeting}</p>
          <p>${copy.intro}</p>
          <p style="margin:28px 0">
            <a href="${link}" style="display:inline-block;background:#c41e3a;color:#fff;text-decoration:none;padding:13px 22px;border-radius:6px;font-weight:700">${copy.button}</a>
          </p>
          <p style="color:#6b7280;font-size:13px">${copy.footer}</p>
        </div>
      </div>`,
  });
  if (result.error) throw new Error("Passwordless email delivery failed");
}

async function findActiveUserByEmail(
  tx: Prisma.TransactionClient,
  email: string,
) {
  return tx.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    include: { roles: { include: { role: true } }, profile: { select: { language: true } } },
  });
}

async function findKnownCustomerEvidence(
  tx: Prisma.TransactionClient,
  email: string,
) {
  const [reservation, ticket] = await Promise.all([
    tx.reservation.findFirst({
      where: { contactEmailNormalized: email },
      select: { contactName: true },
    }),
    tx.ticket.findFirst({
      where: { attendeeEmailNormalized: email },
      select: { attendeeName: true },
    }),
  ]);
  return {
    eligible: Boolean(reservation || ticket),
    name: reservation?.contactName ?? ticket?.attendeeName ?? null,
  };
}

async function createAttendeeForKnownCustomer(
  tx: Prisma.TransactionClient,
  email: string,
  locale: SupportedLocale,
) {
  const evidence = await findKnownCustomerEvidence(tx, email);
  if (!evidence.eligible) return null;

  const attendeeRole = await tx.role.findUnique({ where: { key: "ATTENDEE" } });
  if (!attendeeRole) throw new Error("ATTENDEE role is not configured");

  return tx.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: evidence.name,
      status: "ACTIVE",
      roles: { create: { roleKey: attendeeRole.key } },
      profile: { create: { language: locale } },
    },
    include: { roles: { include: { role: true } }, profile: { select: { language: true } } },
  });
}

export async function issuePasswordlessToken(input: {
  email: string;
  callbackUrl?: unknown;
  purpose?: PasswordlessTokenPurpose;
  requireExistingUserId?: string;
  locale?: unknown;
}): Promise<{ issued: boolean }> {
  const email = normalizePasswordlessEmail(input.email);
  if (!isValidPasswordlessEmail(email)) return { issued: false };
  const purpose = input.purpose ?? "SIGN_IN";
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashPasswordlessToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  const callbackUrl = sanitizePasswordlessCallback(input.callbackUrl);
  const recipient = await prisma.$transaction(async (tx) => {
    let candidate = await findActiveUserByEmail(tx, email);
    let evidence: Awaited<ReturnType<typeof findKnownCustomerEvidence>> | null = null;
    if (input.requireExistingUserId && candidate?.id !== input.requireExistingUserId) {
      return null;
    }
    if (!candidate && !input.requireExistingUserId && purpose === "SIGN_IN") {
      evidence = await findKnownCustomerEvidence(tx, email);
      if (!evidence.eligible) return null;
    }
    if (!candidate && purpose !== "SIGN_IN") return null;
    if (candidate && candidate.status !== "ACTIVE") return null;
    const locale = normalizeLocale(input.locale ?? candidate?.profile?.language);

    await tx.passwordlessToken.updateMany({
      where: {
        email,
        purpose,
        consumedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    await tx.passwordlessToken.create({
      data: {
        tokenHash,
        purpose,
        email,
        userId: candidate?.id ?? null,
        locale,
        callbackUrl,
        expiresAt,
      },
    });
    return {
      name: candidate?.name ?? evidence?.name ?? null,
      locale,
    };
  });

  if (!recipient) return { issued: false };
  await sendPasswordlessEmail({
    email,
    name: recipient.name,
    rawToken,
    purpose,
    locale: recipient.locale,
  });
  return { issued: true };
}

export async function consumePasswordlessToken(input: {
  rawToken: string;
  claimedEmail: string;
}): Promise<PasswordlessIdentity | null> {
  const claimedEmail = normalizePasswordlessEmail(input.claimedEmail);
  if (!isValidPasswordlessEmail(claimedEmail) || input.rawToken.length < 32 || input.rawToken.length > 256) {
    return null;
  }
  const tokenHash = hashPasswordlessToken(input.rawToken);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const token = await tx.passwordlessToken.findUnique({
      where: { tokenHash },
      include: {
        user: { include: { roles: { include: { role: true } } } },
      },
    });
    if (
      !token ||
      token.email !== claimedEmail ||
      (token.user && normalizePasswordlessEmail(token.user.email) !== claimedEmail) ||
      (token.user && token.user.status !== "ACTIVE") ||
      (!token.user && token.purpose !== "SIGN_IN") ||
      token.consumedAt ||
      token.revokedAt ||
      token.expiresAt <= now
    ) {
      return null;
    }

    const claimed = await tx.passwordlessToken.updateMany({
      where: {
        id: token.id,
        consumedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });
    if (claimed.count !== 1) return null;

    let user = token.user;
    if (!user) {
      user = await findActiveUserByEmail(tx, claimedEmail);
      if (user && user.status !== "ACTIVE") return null;
      if (!user) {
        user = await createAttendeeForKnownCustomer(
          tx,
          claimedEmail,
          normalizeLocale(token.locale),
        );
      }
      if (!user || user.status !== "ACTIVE") return null;
      await tx.passwordlessToken.update({
        where: { id: token.id },
        data: { userId: user.id },
      });
    }

    const activeClaim = await tx.user.updateMany({
      where: { id: user.id, status: "ACTIVE" },
      data: { lastLoginAt: now },
    });
    if (activeClaim.count !== 1) return null;

    const currentUser = await tx.user.findUnique({
      where: { id: user.id },
      include: { roles: { include: { role: true } } },
    });
    if (!currentUser || currentUser.status !== "ACTIVE") return null;

    const roles = currentUser.roles.map((entry) => entry.role.key);
    return {
      id: currentUser.id,
      email: currentUser.email,
      name: currentUser.name,
      status: currentUser.status,
      roles,
      destination: sanitizeCallbackUrlForRoles(token.callbackUrl, roles),
    };
  });
}