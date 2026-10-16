import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import EventsCalendarView from "@/components/ui/EventsCalendarView";

describe("events landing calendar responsive layout", () => {
  it("shows the monthly event list before the calendar in a stacked mobile layout", () => {
    const markup = renderToStaticMarkup(
      <EventsCalendarView locale="en" labels={{}} />,
    );

    expect(markup.indexOf('id="events-month-panel"')).toBeLessThan(
      markup.indexOf('id="events-calendar-panel"'),
    );
    expect(markup).toContain('grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr)');
    expect(markup).toContain('grid-template-areas: "calendar month"');
    expect(markup).toContain('grid-template-areas: "month" "calendar"');
    expect(markup).not.toContain('role="tablist"');
  });
});
