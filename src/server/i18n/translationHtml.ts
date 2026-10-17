import { TranslationError } from "./deeplProvider";

// Fail closed rather than storing provider-injected HTML. Event editors accept
// plain text and simple formatting, not executable elements/attributes.
export function formattingSignature(text: string): string {
  const tags: string[] = [];
  const stack: string[] = [];
  const allowed = new Set(["p", "br", "strong", "em", "b", "i", "u", "ul", "ol", "li",
    "blockquote", "h1", "h2", "h3", "h4", "h5", "h6", "pre", "code", "span"]);
  for (const match of text.matchAll(/<[a-z/!?][^>]*(?:>|$)/gi)) {
    const parsed = /^<(\/?)([a-z0-9]+)\s*(\/?)>$/i.exec(match[0]);
    if (!parsed || !allowed.has(parsed[2].toLowerCase()))
      throw new TranslationError("UNSAFE_TRANSLATION_FORMAT", false);
    const [, close, name, selfClosing] = parsed;
    const tag = name.toLowerCase();
    if (tag !== "br") {
      if (close) {
        if (stack.pop() !== tag) throw new TranslationError("UNSAFE_TRANSLATION_FORMAT", false);
      } else if (!selfClosing) stack.push(tag);
    }
    tags.push(`${close ? "/" : ""}${tag}`);
  }
  if (stack.length) throw new TranslationError("UNSAFE_TRANSLATION_FORMAT", false);
  return tags.join("|");
}
