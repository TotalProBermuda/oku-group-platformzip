import type { InviteEmailData, EmailTemplate } from "./types";
import { classicTemplate } from "./classic";
import { editorialTemplate } from "./editorial";
import { darkLuxuryTemplate } from "./darkLuxury";

export { TEMPLATES } from "./types";
export type { InviteEmailData, EmailTemplate };

export function renderInvitationEmail(data: InviteEmailData): string {
  switch (data.template) {
    case "EDITORIAL":    return editorialTemplate(data);
    case "DARK_LUXURY":  return darkLuxuryTemplate(data);
    case "CLASSIC":
    default:             return classicTemplate(data);
  }
}

export function formatEventDate(d: Date | string | null | undefined): string {
  if (!d) return "Date TBD";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long", year: "numeric", month: "long",
    day: "numeric", hour: "numeric", minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(d));
}
