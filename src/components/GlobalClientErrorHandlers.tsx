"use client";

import { useEffect } from "react";
import { isKnownInjectedExtensionError } from "@/lib/clientErrorFilters";

// React error boundaries don't catch async or event-handler errors.
// Hook window.onerror + unhandledrejection so those still land in the
// /api/v1/error-capture sink alongside boundary-caught errors.
export function GlobalClientErrorHandlers() {
  useEffect(() => {
    function post(payload: Record<string, unknown>) {
      void fetch("/api/v1/error-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }

    function onError(event: ErrorEvent) {
      if (isKnownInjectedExtensionError({
        message: event.message,
        filename: event.filename,
        stack: event.error instanceof Error ? event.error.stack : undefined,
      })) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      post({
        message: event.message || "window.onerror",
        stack: event.error instanceof Error ? event.error.stack : undefined,
        url: typeof window !== "undefined" ? window.location.href : undefined,
        boundary: "window.onerror",
        extras: { filename: event.filename, lineno: event.lineno, colno: event.colno },
      });
    }

    function onRejection(event: PromiseRejectionEvent) {
      const reason = event.reason as unknown;
      const message =
        reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "unhandledrejection";
      if (isKnownInjectedExtensionError({
        message,
        stack: reason instanceof Error ? reason.stack : undefined,
      })) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      post({
        message,
        stack: reason instanceof Error ? reason.stack : undefined,
        url: typeof window !== "undefined" ? window.location.href : undefined,
        boundary: "window.unhandledrejection",
      });
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
