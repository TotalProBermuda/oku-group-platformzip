// Gates the demo back-doors (demo-login, demo-checkout). Both NODE_ENV
// and the explicit flag must be set so the gate fails closed even if
// NODE_ENV is misconfigured.
export function isDemoModeEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.DEMO_MODE_ENABLED === "true";
}

export const DEMO_DISABLED_MESSAGE =
  "Demo mode is disabled in this environment. To enable, set NODE_ENV != 'production' and DEMO_MODE_ENABLED=true.";

let _logged = false;
// One-shot boot log so operators can grep startup logs to confirm what
// the running server is allowing. Called from instrumentation.register().
export function logDemoModeStatusOnce(): void {
  if (_logged) return;
  _logged = true;
  // Use stderr to match errorReporting.ts (single-line JSON to stderr).
  // Operators grep both streams in deploy logs the same way.
  console.error(
    JSON.stringify({
      type: "demo_mode_boot",
      enabled: isDemoModeEnabled(),
      nodeEnv: process.env.NODE_ENV ?? "development",
      flagSet: process.env.DEMO_MODE_ENABLED === "true",
    }),
  );
}
