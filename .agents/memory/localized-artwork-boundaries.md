---
name: Localized artwork boundaries
description: Why event artwork is independent of automated text translation and why removal does not delete assets.
---

Keep locale-specific event artwork independent of the automated text-translation system; do not ask translation workers to generate or approve image URLs.

**Why:** Artwork is an explicit editorial asset, not translated text. Translation jobs and translation approval statuses are not evidence that an uploaded flyer matches its language.

**How to apply:** Extend the shared Series/Session artwork editing flow for future locales or media variants rather than storing URLs as ContentTranslation records or special-casing event types.

Removing an artwork reference must not automatically delete the storage object.

**Why:** Other locales, copied series or sessions can reference the same asset. Reference removal is not proof that an object is unused.

**How to apply:** Any later storage cleanup must check references across all image fields and records before deletion.
