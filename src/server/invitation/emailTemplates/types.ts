export type EmailTemplate = "CLASSIC" | "EDITORIAL" | "DARK_LUXURY";

export interface InviteEmailData {
  // Template
  template: EmailTemplate;

  // Event info (auto-filled from series)
  eventTitle: string;
  eventSubtitle?: string;
  eventDate: string | null;
  eventVenue: string;
  eventDescription?: string;
  eventSlug: string;

  // Recipient
  recipientName: string | null;

  // Media
  flyerImageUrl?: string | null;
  heroImageUrl?: string | null;
  youtubeUrl?: string | null;

  // Custom content
  customSubject?: string;
  customMessage?: string;

  // Audience badge
  audienceLabel?: string;

  // Action URLs
  rsvpUrl: string;
  declineUrl: string;
}

export const TEMPLATES: { id: EmailTemplate; label: string; description: string; accent: string }[] = [
  {
    id: "CLASSIC",
    label: "Classic Editorial",
    description: "Dark header, editorial layout, warm ivory background. The OKÜ signature.",
    accent: "#c41e3a",
  },
  {
    id: "EDITORIAL",
    label: "Full-Bleed",
    description: "Full-width hero image with overlay text. Bold and visual-first.",
    accent: "#c41e3a",
  },
  {
    id: "DARK_LUXURY",
    label: "Dark Luxury",
    description: "All-dark layout with gold accents. For Founder-only events.",
    accent: "#b8973a",
  },
];
