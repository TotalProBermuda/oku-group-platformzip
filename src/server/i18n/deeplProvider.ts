import { formattingSignature } from "./translationHtml";
export class TranslationError extends Error {
  constructor(public readonly code: string, public readonly retryable = true) {
    super(code);
    this.name = "TranslationError";
  }
}

export interface TranslationProvider {
  translate(source: string, target: "es" | "pt", options?: { signal?: AbortSignal }): Promise<string>;
}

export function deeplProvider(): TranslationProvider {
  return {
    async translate(source, target, options) {
      const key = process.env.DEEPL_AUTH_KEY;
      if (!key) throw new TranslationError("PROVIDER_NOT_CONFIGURED");
      const markup = formattingSignature(source);
      const host = key.endsWith(":fx") ? "api-free.deepl.com" : "api.deepl.com";
      let response: Response;
      try {
        response = await fetch(`https://${host}/v2/translate`, {
          method: "POST",
          headers: { Authorization: `DeepL-Auth-Key ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ text: [source], source_lang: "EN", target_lang: target === "es" ? "ES" : "PT-BR", ...(source.includes("<") ? { tag_handling: "html" } : {}) }),
          signal: options?.signal
            ? AbortSignal.any([options.signal, AbortSignal.timeout(4000)])
            : AbortSignal.timeout(4000),
        });
      } catch {
        throw new TranslationError("PROVIDER_UNREACHABLE");
      }
      // Never include response bodies, submitted text, headers, or keys in errors.
      if (!response.ok) throw new TranslationError(`PROVIDER_HTTP_${response.status}`, response.status === 429 || response.status >= 500 || response.status === 456);
      try {
        const body = await response.json() as { translations?: Array<{ text?: unknown }> };
        const text = body.translations?.[0]?.text;
        if (typeof text !== "string" || !text.trim()) throw new Error();
        if (formattingSignature(text) !== markup) throw new TranslationError("UNSAFE_TRANSLATION_FORMAT", false);
        return text;
      } catch (error) {
        if (error instanceof TranslationError) throw error;
        throw new TranslationError("PROVIDER_INVALID_RESPONSE");
      }
    },
  };
}
