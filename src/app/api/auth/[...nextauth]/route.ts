import type { NextRequest } from "next/server";
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkRateLimitAsync, clientIp, rateLimitedResponse } from "@/server/rateLimit";

const handler = NextAuth(authOptions);

export const GET = handler;

// Only throttle mutation requests. This protects sign-in/token/CSRF actions
// without rate-limiting OAuth GET callbacks or ordinary session reads.
export async function POST(req: NextRequest, context: { params: { nextauth: string[] } }) {
  const rateLimit = await checkRateLimitAsync({
    key: `nextauth-post:${clientIp(req)}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.ok) return rateLimitedResponse(rateLimit);
  return handler(req, context);
}
