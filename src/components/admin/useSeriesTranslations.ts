"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SeriesTranslation = {
  seriesId: string;
  state: "ready" | "pending" | "retry";
  completed: number;
  pending: number;
  failed: number;
  processing: number;
  canContinue: boolean;
  retryAfterMs: number;
  errorCode?: string;
};

type TranslationEnvelope = { translation?: SeriesTranslation };

const endpoint = (seriesId: string) => `/api/v1/admin/series/${encodeURIComponent(seriesId)}/translations`;
const isTranslation = (value: unknown): value is SeriesTranslation =>
  !!value && typeof value === "object" &&
  ["ready", "pending", "retry"].includes(String((value as SeriesTranslation).state)) &&
  typeof (value as SeriesTranslation).seriesId === "string";

/** Editor-owned, awaited and finite; no timer or visitor-driven processing. */
export async function continueSeriesTranslationChunks(seriesId: string, retry: boolean, signal: AbortSignal,
  receive: (value: unknown) => SeriesTranslation | null) {
  let latest: SeriesTranslation | null = null;
  for (let request = 0; request < 6; request += 1) {
    if (signal.aborted) break;
    const response = await fetch(endpoint(seriesId), {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(retry && request === 0 ? { retry: true } : {}), signal,
    });
    const body = await response.json().catch(() => null) as TranslationEnvelope | null;
    if (signal.aborted) break;
    if (!response.ok || !body?.translation) throw new Error("Translation continuation unavailable");
    latest = receive(body.translation);
    if (!latest || latest.state !== "pending" || !latest.canContinue || latest.retryAfterMs > 0) break;
  }
  return latest;
}

export function useSeriesTranslations(seriesId: string | null | undefined, enabled = true) {
  const [translation, setTranslation] = useState<SeriesTranslation | null>(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const liveRef = useRef({ seriesId, enabled });
  liveRef.current = { seriesId, enabled };

  const receive = useCallback((value: unknown, expectedSeriesId = seriesId) => {
    if (expectedSeriesId && isTranslation(value) && value.seriesId === expectedSeriesId) {
      setTranslation(value);
      setError(false);
      return value;
    }
    return null;
  }, [seriesId]);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!seriesId || !enabled) return;
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(endpoint(seriesId), { method: "GET", cache: "no-store", credentials: "include", signal });
      const body = await response.json().catch(() => null) as TranslationEnvelope | null;
      if (!response.ok || !body?.translation) throw new Error("Translation status unavailable");
      if (signal?.aborted) return;
      receive(body.translation);
    } catch {
      if (!signal?.aborted) setError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [seriesId, enabled, receive]);

  useEffect(() => {
    setTranslation(null);
    setError(false);
    if (!seriesId || !enabled) {
      setLoading(false);
      setWorking(false);
      return () => {
        controllerRef.current?.abort();
        controllerRef.current = null;
      };
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    void load(controller.signal);
    return () => {
      controller.abort();
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [seriesId, enabled, load]);

  const continueWork = useCallback(async (retry: boolean, targetSeriesId = seriesId) => {
    if (!targetSeriesId || !liveRef.current.enabled || (targetSeriesId === seriesId && liveRef.current.seriesId !== seriesId)) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setWorking(true);
    setError(false);
    let latest: SeriesTranslation | null = null;
    try {
      latest = await continueSeriesTranslationChunks(targetSeriesId, retry, controller.signal,
        value => receive(value, targetSeriesId));
    } catch {
      if (!controller.signal.aborted) {
        setError(true);
        if (seriesId === targetSeriesId) await load(controller.signal);
      }
    } finally {
      if (!controller.signal.aborted) setWorking(false);
    }
    return latest;
  }, [seriesId, receive, load]);

  const onSave = useCallback(async (payload: unknown, targetSeriesId = seriesId) => {
    const body = payload && typeof payload === "object" ? payload as TranslationEnvelope : null;
    const saved = body?.translation ? receive(body.translation, targetSeriesId) : null;
    if (saved?.state === "pending" && saved.canContinue && saved.retryAfterMs <= 0 && liveRef.current.enabled &&
      (targetSeriesId !== seriesId || liveRef.current.seriesId === seriesId)) {
      return await continueWork(false, targetSeriesId) ?? saved;
    }
    return saved;
  }, [continueWork, receive, seriesId]);

  const refresh = useCallback(() => load(), [load]);
  const resume = useCallback(() => continueWork(false), [continueWork]);
  const retry = useCallback(() => continueWork(true), [continueWork]);

  return { translation, loading, working, error, onSave, refresh, resume, retry };
}
