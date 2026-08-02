export function sameSiteForEnv(): "lax" | "none" {
  return process.env.NODE_ENV === "production" ? "lax" : "none";
}
