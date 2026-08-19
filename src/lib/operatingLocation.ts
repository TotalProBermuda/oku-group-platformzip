/**
 * Canonical launch configuration for the one restaurant operating boundary.
 *
 * `gold-house` remains the legacy database slug while historical records use
 * it. It is not a menu concept and it must not make the building a second
 * operating location. The physical spaces below are all inside Local #5.
 */
export const LOCAL5_OPERATING_LOCATION = {
  legacyVenueSlug: "gold-house",
  operatingName: "Local #5",
  buildingName: "Gold House / Casa Oro",
  floorLabel: "Second floor",
  tradingName: "OKU Hospitality Group",
  legalName: "OKU Group S.A.",
} as const;

/**
 * Stable physical-space keys. Do not use the menu concept as a permission or
 * capacity boundary: OKU and CATCH menus may be served in every eligible
 * Local #5 space.
 */
export const LOCAL5_SPACE_SPECS = [
  {
    conceptKey: "OKU",
    name: "OKU Dining Room",
    legacyNames: ["OKU", "OKÜ Dining Room"],
    capacity: 27,
    sortOrder: 0,
    weatherSensitive: false,
    requiresApproval: false,
  },
  {
    conceptKey: "CATCH",
    name: "CATCH Dining Room",
    legacyNames: ["CATCH", "Catch Experience"],
    capacity: 24,
    sortOrder: 1,
    weatherSensitive: false,
    requiresApproval: false,
  },
  {
    conceptKey: "TERRACE",
    name: "Terrace",
    legacyNames: ["THE TERRACE"],
    capacity: 42,
    sortOrder: 2,
    weatherSensitive: true,
    requiresApproval: false,
  },
  {
    conceptKey: "PRIVATE_DINING_ROOM",
    name: "Private Dining Room",
    legacyNames: ["VIP", "Private Dining"],
    capacity: 10,
    sortOrder: 3,
    weatherSensitive: false,
    requiresApproval: true,
  },
] as const;
