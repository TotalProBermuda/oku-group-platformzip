import { afterEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SeriesTranslationStatus from "@/components/admin/SeriesTranslationStatus";
import { continueSeriesTranslationChunks, type SeriesTranslation } from "@/components/admin/useSeriesTranslations";

const pending: SeriesTranslation = { seriesId: "event", state: "pending", completed: 0,
  pending: 10, failed: 0, processing: 0, canContinue: true, retryAfterMs: 0 };
afterEach(() => vi.restoreAllMocks());

it.each(["pending", "retry", "ready"] as const)("renders truthful %s status and explicit actions", state => {
  const html = renderToStaticMarkup(createElement(SeriesTranslationStatus, {
    translation: { ...pending, state }, onResume: () => {}, onRetry: () => {},
  }));
  expect(html).toContain('aria-live="polite"');
  if (state === "pending") {
    expect(html).toContain("Saved / translation pending");
    expect(html).toContain("Resume translations");
    expect(html).not.toContain("translations ready");
  } else if (state === "retry") {
    expect(html).toContain("Saved / translation needs retry");
    expect(html).toContain("Retry translations");
  } else expect(html).toContain("Saved / translations ready");
});
it("disables retry during persisted cooldown; absence of status never claims translations are ready", () => {
  const html = renderToStaticMarkup(createElement(SeriesTranslationStatus, {
    translation: { ...pending, state: "retry", retryAfterMs: 5000 }, onRetry: () => {},
  }));
  expect(html).toContain("disabled");
  expect(html).toContain("5 seconds");
  expect(renderToStaticMarkup(createElement(SeriesTranslationStatus, { translation: null })))
    .not.toContain("translations ready");
});
it("caps editor continuation at six awaited requests with explicit retry on first request only", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ translation: pending }));
  const result = await continueSeriesTranslationChunks("event", true, new AbortController().signal, value => value as SeriesTranslation);
  expect(result?.state).toBe("pending");
  expect(fetcher).toHaveBeenCalledTimes(6);
  expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({ retry: true });
  expect(JSON.parse(fetcher.mock.calls[1][1]!.body as string)).toEqual({});
});
it.each([
  { ...pending, state: "ready" as const },
  { ...pending, state: "retry" as const },
  { ...pending, retryAfterMs: 5000 },
  { ...pending, canContinue: false },
])("stops continuation on completion, failure, backoff or a live lease", async translation => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ translation }));
  await continueSeriesTranslationChunks("event", false, new AbortController().signal, value => value as SeriesTranslation);
  expect(fetcher).toHaveBeenCalledOnce();
});
it("browser close aborts continuation and prevents late metadata from overwriting UI state", async () => {
  const controller = new AbortController(), receive = vi.fn();
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    controller.abort(); return Response.json({ translation: pending });
  });
  await continueSeriesTranslationChunks("event", false, controller.signal, receive);
  expect(fetcher).toHaveBeenCalledOnce(); expect(receive).not.toHaveBeenCalled();
  await continueSeriesTranslationChunks("event", false, controller.signal, receive);
  expect(fetcher).toHaveBeenCalledOnce();
});
it("a failed request surfaces an explicit retry rather than silently continuing", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({}, { status: 503 }));
  await expect(continueSeriesTranslationChunks("event", false, new AbortController().signal, () => null))
    .rejects.toThrow("Translation continuation unavailable");
  expect(fetcher).toHaveBeenCalledOnce();
});
