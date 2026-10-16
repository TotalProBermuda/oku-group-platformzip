export class TranslationError extends Error {
  constructor(public readonly code: string, public readonly retryable = true) {
    super(code);
    this.name = "TranslationError";
  }
}

export interface TranslationProvider {
  translate(source: string, target: "es" | "pt"): Promise<string>;
}

export function deeplProvider(): TranslationProvider {
  return {
    async translate(source, target) {
      const key = process.env.DEEPL_AUTH_KEY;
      if (!key) throw new TranslationError("PROVIDER_NOT_CONFIGURED");
      const host = key.endsWith(":fx") ? "api-free.deepl.com" : "api.deepl.com";
      let response: Response;
      try {
        response = await fetch(`https://${host}/v2/translate`, {
          method: "POST",
          headers: { Authorization: `DeepL-Auth-Key ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ text: [source], source_lang: "EN", target_lang: target === "es" ? "ES" : "PT-BR", ...(source.includes("<") ? { tag_handling: "html" } : {}) }),
          signal: AbortSignal.timeout(20_000),
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
        return text;
      } catch {
        throw new TranslationError("PROVIDER_INVALID_RESPONSE");
      }
    },
  };
}
