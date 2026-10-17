import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ExpandableText from "@/components/ui/ExpandableText";

describe("ExpandableText Markdown rendering", () => {
  it("renders event descriptions without exposing Markdown markers", () => {
    const markup = renderToStaticMarkup(
      <ExpandableText
        locale="es"
        text={"# A Taste of Provence\n\n**Wine Down Wednesday**\n\n- Featured wines\n- Hand-passed tapas"}
      />,
    );

    expect(markup).toContain("A Taste of Provence");
    expect(markup).toContain("<strong>Wine Down Wednesday</strong>");
    expect(markup).toContain("Featured wines");
    expect(markup).toContain("Hand-passed tapas");
    expect(markup).toContain('aria-hidden="true">• </span>');
    expect(markup).not.toContain("**");
    expect(markup).not.toContain("# A Taste");
  });
});
