// Deliberately do not import worker/index or any queue: no unrelated jobs/Redis.
import { prisma } from "@/lib/prisma";
import { startTranslationPolling } from "../src/server/i18n/translationProcessor";

let stopPolling: () => Promise<void> = async () => {};
let stopping = false;

async function shutdown(code: number) {
  if (stopping) return;
  stopping = true;
  try {
    await stopPolling();
    await prisma.$disconnect();
  } catch {
    console.error("[translations] shutdown failed");
    code = 1;
  }
  process.exit(code);
}

process.once("SIGTERM", () => { void shutdown(0); });
process.once("SIGINT", () => { void shutdown(0); });
process.once("disconnect", () => { void shutdown(1); });
process.once("uncaughtException", () => {
  console.error("[translations] fatal exception");
  void shutdown(1);
});
process.once("unhandledRejection", () => {
  console.error("[translations] fatal rejection");
  void shutdown(1);
});

async function boot() {
  // Read-only preflight: fail before web readiness if the reviewed schema is absent.
  await prisma.contentTranslation.findFirst({
    select: { attemptCount: true, nextAttemptAt: true, processingUntil: true, lastErrorCode: true },
  });
  if (stopping) return;
  stopPolling = startTranslationPolling();
  if (!process.env.DEEPL_AUTH_KEY) {
    console.warn("[translations] provider not configured; English fallback remains active");
  }
  process.send?.({ type: "translation-worker-ready" });
}

void boot().catch(() => {
  // Never log query errors, connection details, text, or credentials.
  console.error("[translations] startup schema/database check failed");
  void shutdown(1);
});
