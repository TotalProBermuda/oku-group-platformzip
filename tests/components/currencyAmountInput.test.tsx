import React from "react";
import ReactDOMServer from "react-dom/server";
import { describe, expect, it } from "vitest";
import CurrencyAmountInput from "@/components/admin/CurrencyAmountInput";

describe("CurrencyAmountInput", () => {
  it("shows stored minor units as separate, right-aligned dollars and cents fields", () => {
    const markup = ReactDOMServer.renderToStaticMarkup(
      <CurrencyAmountInput
        label="Ticket price"
        dollarsLabel="Dollars"
        centsLabel="Cents"
        value={4550}
        onChange={() => undefined}
      />,
    );

    expect(markup).toContain('aria-label="Dollars"');
    expect(markup).toContain('aria-label="Cents"');
    expect(markup).toContain('value="45"');
    expect(markup).toContain('value="50"');
    expect(markup).toContain("text-align:right");
  });

  it("shows zero cents with two digits", () => {
    const markup = ReactDOMServer.renderToStaticMarkup(
      <CurrencyAmountInput
        label="Ticket price"
        dollarsLabel="Dollars"
        centsLabel="Cents"
        value={500}
        onChange={() => undefined}
      />,
    );

    expect(markup).toContain('value="5"');
    expect(markup).toContain('value="00"');
  });
});
