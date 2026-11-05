# Responsive session artwork

Session flyers may have an optional portrait/mobile alternative for each supported locale (EN, ES, PT). The existing session flyer remains the desktop source; series artwork and event types are unchanged.

On screens up to 640px, event cards choose the localized mobile flyer. Fallback order preserves language first: matching-locale mobile art, matching-locale regular flyer, English mobile art, English regular flyer, legacy session image, then localized series artwork. On larger screens, the current regular session artwork path is preserved.

Superadmins can upload or clear the mobile variants from the same session create/edit workflow. The existing secure media endpoint, file type/size restrictions, role gate, URL validation and audit event remain in force. Missing mobile files are not an error and do not block publishing.

The migration adds only nullable columns to Session; it does not rewrite existing artwork. Prisma client generation and migration deployment are required before this code is deployed. No production schema or data has been changed by this change set.
