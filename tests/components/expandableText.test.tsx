import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ExpandableText from "@/components/ui/ExpandableText";

describe("ExpandableText", () => {
  it("renders a compact localized-content preview with a configurable line clamp", () => {
    const markup = renderToStaticMarkup(
      <ExpandableText
        text="A detailed event description that should be shortened in the initial view."
        locale="en"
        maxLines={2}
      />,
    );

    expect(markup).toContain("A detailed event description");
    expect(markup).toContain("-webkit-line-clamp:2");
  });
});
