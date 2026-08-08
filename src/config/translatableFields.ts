/**
 * Central registry of all translatable user-generated content fields.
 * Every new content type with user-visible text MUST be added here.
 * This is the source of truth for the translation pipeline.
 */

export type TranslatableEntityType = keyof typeof TRANSLATABLE_FIELDS;

export const TRANSLATABLE_FIELDS = {
  Series: [
    "title",
    "subtitle",
    "shortDescription",
    "description",
    "agenda",
    "faq",
    "hostNotes",
  ],
  EventSession: [
    "title",
    "notes",
  ],
  Venue: [
    "name",
    "shortDescription",
    "description",
  ],
  UserProfile: [
    "bio",
    "headline",
  ],
  InvitationTemplate: [
    "subject",
    "headline",
    "body",
    "ctaLabel",
  ],
  FounderMembershipApplication: [
    "reason",
    "backgroundNote",
  ],
  Opportunity: [
    "title",
    "description",
    "requirements",
    "benefits",
  ],
  ReservationNote: [
    "message",
  ],
  AnnouncementBanner: [
    "message",
    "ctaLabel",
  ],
} as const;

export type TranslatableField<T extends TranslatableEntityType> =
  (typeof TRANSLATABLE_FIELDS)[T][number];

/**
 * Returns true if the given entity type and field are registered as translatable.
 */
export function isTranslatableField(
  entityType: string,
  fieldName: string
): boolean {
  const fields = TRANSLATABLE_FIELDS[entityType as TranslatableEntityType];
  if (!fields) return false;
  return (fields as readonly string[]).includes(fieldName);
}
