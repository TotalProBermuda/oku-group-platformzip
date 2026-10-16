import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import EventsCalendarView from "@/components/ui/EventsCalendarView";

describe("events landing calendar responsive layout", () => {
  it("shows the monthly event list before the calendar in a stacked mobile layout", () => {
    const markup = renderToStaticMarkup(
      <EventsCalendarView locale="en" labels={{}} />,
    );

    const normalizedMarkup = markup.replaceAll("&quot;", "\"");
    expect(normalizedMarkup.indexOf('id="events-month-panel"')).toBeLessThan(
      normalizedMarkup.indexOf('id="events-calendar-panel"'),
    );
    expect(normalizedMarkup).toContain('grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr)');
    expect(normalizedMarkup).toContain('grid-template-areas: "calendar month"');
    expect(normalizedMarkup).toContain('grid-template-areas: "month" "calendar"');
    expect(normalizedMarkup).toContain('role="tablist"');
    expect(normalizedMarkup).toContain('role="tab" aria-selected="true"');
    expect(normalizedMarkup).toContain('id="events-month-panel" class="events-month-column" data-mobile-hidden="false"');
    expect(normalizedMarkup).toContain('id="events-calendar-panel" class="events-calendar-column" data-mobile-hidden="true"');
  });
});
