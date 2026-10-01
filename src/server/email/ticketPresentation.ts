export function escapeEmailText(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function formatTicketSession(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Panama", weekday: "long", month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  }).format(date) + " · Panama time";
}
