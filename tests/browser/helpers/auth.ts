/**
 * Authenticate a Playwright browser context as a seeded `*@oku.local`
 * demo user. Hits the dev-only `/api/auth/demo-login` endpoint to get a
 * valid NextAuth session cookie, then plants it on the browser context
 * with `domain=localhost; secure=false` so localhost can use it without
 * HTTPS.
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
  const m = setCookie.match(/next-auth\.session-token=([^;]+)/);
  if (!m) throw new Error(`Could not parse session token from: ${setCookie}`);
  await context.addCookies([
    {
      name: "next-auth.session-token",
      value: m[1],
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

export async function clearAuth(context: BrowserContext): Promise<void> {
  await context.clearCookies();
}
