// Next.js instrumentation entry. register() runs once at server boot;
// onRequestError fires for any unhandled error in routes/server-comps/
// middleware. Both forward through src/server/errorReporting.ts.
export async function register() {
  const { logDemoModeStatusOnce } = await import("@/lib/demoMode");
  logDemoModeStatusOnce();

  // If an operator sets SENTRY_DSN expecting Sentry forwarding, surface
  // a one-shot warning so they know the current sink is stderr-only.
  // Wiring @sentry/nextjs is a one-file change in errorReporting.ts.
  if (process.env.SENTRY_DSN) {
    console.error(
      JSON.stringify({
        type: "error_reporting_boot",
        sentryDsnSet: true,
        sentryActive: false,
        message: "SENTRY_DSN is set but the Sentry SDK is not wired; events go to stderr only. See src/server/errorReporting.ts header.",
      }),
    );
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { captureException } = await import("@/server/errorReporting");
    process.on("unhandledRejection", (reason) => {
      captureException(reason, { source: "process.unhandledRejection" });
    });
    process.on("uncaughtException", (err) => {
      captureException(err, { source: "process.uncaughtException" });
    });
  }
}

export async function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: { routerKind: "Pages Router" | "App Router"; routePath: string; routeType: string },
) {
  const { captureException } = await import("@/server/errorReporting");
  captureException(err, {
    source: "next.onRequestError",
    url: request.path,
    method: request.method,
    tags: {
      routerKind: context.routerKind,
      routeType: context.routeType,
      routePath: context.routePath,
    },
  });
}
