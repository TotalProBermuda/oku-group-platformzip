/**
 * Authenticate a Playwright browser context as a seeded `*@oku.local`
 * demo user. Hits the dev-only `/api/auth/demo-login` endpoint to get a
 * valid NextAuth session cookie, then plants it on the browser context
 * for the configured Playwright host. This keeps the helper usable both
 * against localhost and an HTTPS preview environment.
 */
import type { BrowserContext } from "@playwright/test";

export async function loginAs(
  context: BrowserContext,
  email: string,
  baseUrl = "http://localhost:5000",
): Promise<void> {
  const url = `${baseUrl}/api/auth/demo-login?email=${encodeURIComponent(email)}&callbackUrl=/`;
  const res = await fetch(url, { redirect: "manual" });
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error(`No session cookie returned for ${email}`);
  const m = setCookie.match(/((?:__Secure-)?next-auth\.session-token)=([^;]+)/);
  if (!m) throw new Error(`Could not parse session token from: ${setCookie}`);
  const target = new URL(baseUrl);
  await context.addCookies([
    {
      name: m[1],
      value: m[2],
      domain: target.hostname,
      path: "/",
      httpOnly: true,
      secure: target.protocol === "https:",
      sameSite: "Lax",
    },
  ]);
}

export async function clearAuth(context: BrowserContext): Promise<void> {
  await context.clearCookies();
}
