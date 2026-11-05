import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
import RestaurantPage, { generateStaticParams } from "@/app/restaurants/[slug]/page";
import { venueMenus } from "@/data/venues/menus";
it.each(["oku", "catch", "terrace"])("preserves the localized %s profile redirect", async slug => {
  await expect(RestaurantPage({ params: Promise.resolve({ slug }) })).rejects.toThrow(`REDIRECT:/en/restaurants/${slug}`);
});
it("preserves unknown restaurant handling and static routes", async () => {
  await expect(RestaurantPage({ params: Promise.resolve({ slug: "not-a-venue" }) })).rejects.toThrow("NOT_FOUND");
  expect(await generateStaticParams()).toEqual([{ slug: "oku" }, { slug: "catch" }, { slug: "terrace" }]);
});
it("retains nonempty multilingual menu descriptions after source cleanup", () => {
  let checked = 0;
  for (const menu of venueMenus) for (const section of menu.sections) for (const item of section.items) {
    if (item.description && typeof item.description !== "string") {
      for (const language of ["en", "es", "pt"] as const) {
        expect(item.description[language].trim().length).toBeGreaterThan(0);
      }
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(0);
});
