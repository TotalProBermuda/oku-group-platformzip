import { describe, expect, it } from "vitest";
import { resolveSessionMenuLinks } from "@/server/menus/sessionMenuResolution";

describe("session menu resolution", () => {
  it("uses assigned session menus instead of series menus", () => {
    expect(resolveSessionMenuLinks(["session menu"], ["series menu"])).toEqual(["session menu"]);
  });
  it("inherits series menus when a session has no assignments", () => {
    expect(resolveSessionMenuLinks([], ["series food", "series drinks"])).toEqual(["series food", "series drinks"]);
  });
  it("returns no menus when both levels are empty", () => {
    expect(resolveSessionMenuLinks([], [])).toEqual([]);
  });
});
