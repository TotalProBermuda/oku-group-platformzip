import { Resend } from "resend";

const RESEND_TEST_SENDER = "onboarding@resend.dev";
let _fromEmail = "events@oku.group";

function sanitizeFromEmail(email: string | undefined): string {
  if (!email) return RESEND_TEST_SENDER;
  // Resend requires the sender domain to be verified — free webmail providers
  // (gmail, yahoo, hotmail, etc.) cannot be registered as Resend senders.
  const freeMailProviders = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com"];
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (freeMailProviders.includes(domain)) return RESEND_TEST_SENDER;
  return email;
}

async function getCredentials(): Promise<{ apiKey: string; fromEmail: string }> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  // Operator-set env vars always win over the Replit Resend connector.
  // The connector can point at a different Resend account/workspace than the
  // one where the production sender domain is verified — when that happens,
  // RESEND_API_KEY is the explicit override the operator has chosen.
  const envApiKey = process.env.RESEND_API_KEY;
  if (envApiKey) {
    return {
      apiKey: envApiKey,
      fromEmail: sanitizeFromEmail(process.env.RESEND_FROM_EMAIL) ?? _fromEmail,
    };
  }

  if (hostname && xReplitToken) {
    try {
      const data = await fetch(
        `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=resend`,
        { headers: { Accept: "application/json", "X-Replit-Token": xReplitToken } }
      ).then((r) => r.json());
      const settings = data.items?.[0]?.settings;
      if (settings?.api_key) {
        const fromCandidate = process.env.RESEND_FROM_EMAIL || settings.from_email;
        return {
          apiKey: settings.api_key,
          fromEmail: sanitizeFromEmail(fromCandidate),
        };
      }
    } catch {
      // fall through to error
    }
  }

  throw new Error("RESEND_NOT_CONFIGURED");
}

export async function getResendClient(): Promise<{ client: Resend; fromEmail: string }> {
  const { apiKey, fromEmail } = await getCredentials();
  return { client: new Resend(apiKey), fromEmail };
}

export function isResendConfigured(): boolean {
  return !!(
    process.env.RESEND_API_KEY ||
    process.env.REPLIT_CONNECTORS_HOSTNAME
  );
}
