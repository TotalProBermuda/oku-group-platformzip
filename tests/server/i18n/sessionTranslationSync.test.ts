import { describe, expect, it, vi } from "vitest";
import { sourceHash } from "@/server/i18n/sourceHash";
import { syncTranslations } from "@/server/i18n/eventTranslations";

describe("session translation sync", () => {
  it("requeues legacy English fallback mislabeled as a manual translation", async () => {
    const sourceText = "From the French Riviera to the rooftops of Casco Viejo.";
    const existing = {
      sourceTextHash: sourceHash(sourceText),
      translatedText: sourceText,
      provider: "manual-session-management",
    };
    const upsert = vi.fn();
    const tx = {
      contentTranslation: {
        findUnique: vi.fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(null),
        upsert,
      },
    };

    await syncTranslations(tx as never, "EventSession", "session-1", { subtitle: sourceText });

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0][0]).toMatchObject({
      update: { status: "STALE", provider: "deepl", translatedText: "", attemptCount: 0 },
    });
  });

  it("preserves a genuine reviewed translation when the source is unchanged", async () => {
    const sourceText = "From the French Riviera to the rooftops of Casco Viejo.";
    const existing = {
      sourceTextHash: sourceHash(sourceText),
      translatedText: "De la Riviera Francesa a las azoteas de Casco Viejo.",
      provider: "manual-session-management",
    };
    const tx = {
      contentTranslation: {
        findUnique: vi.fn().mockResolvedValue(existing),
        upsert: vi.fn(),
      },
    };

    await syncTranslations(tx as never, "EventSession", "session-1", { subtitle: sourceText });

    expect(tx.contentTranslation.upsert).not.toHaveBeenCalled();
  });
});
