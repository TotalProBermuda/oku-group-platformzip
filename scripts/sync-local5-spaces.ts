import { PrismaClient } from "@prisma/client";
import { LOCAL5_OPERATING_LOCATION, LOCAL5_SPACE_SPECS } from "../src/lib/operatingLocation";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const venueSlugIndex = process.argv.indexOf("--venue-slug");
const venueSlug = venueSlugIndex >= 0
  ? process.argv[venueSlugIndex + 1]
  : LOCAL5_OPERATING_LOCATION.legacyVenueSlug;

if (!venueSlug) {
  throw new Error("Provide --venue-slug <slug> when the operating-location slug is not known.");
}

function normaliseName(value: string): string {
  return value.trim().toLocaleUpperCase("en-US");
}

async function main() {
  const venue = await prisma.venue.findUnique({
    where: { slug: venueSlug },
    include: { spaces: { orderBy: { sortOrder: "asc" } } },
  });
  if (!venue) throw new Error(`No venue record exists for slug ${JSON.stringify(venueSlug)}.`);

  console.log(`${apply ? "APPLY" : "DRY RUN"}: ${LOCAL5_OPERATING_LOCATION.operatingName} uses existing database venue ${venue.name} (${venue.id}).`);
  console.log(`Building metadata remains ${LOCAL5_OPERATING_LOCATION.buildingName}; it is not a second operating location.`);

  const plan = LOCAL5_SPACE_SPECS.map((spec) => {
    const validNames = new Set([spec.name, ...spec.legacyNames].map(normaliseName));
    const matches = venue.spaces.filter((space) =>
      space.conceptKey === spec.conceptKey || validNames.has(normaliseName(space.name))
    );
    return { spec, matches };
  });

  const conflicts = plan.filter(({ matches }) => matches.length > 1);
  if (conflicts.length) {
    for (const { spec, matches } of conflicts) {
      console.error(`Ambiguous ${spec.conceptKey}: ${matches.map((space) => `${space.id}/${space.name}`).join(", ")}`);
    }
    throw new Error("Refusing to merge multiple existing spaces. Resolve the aliases manually before applying.");
  }

  for (const { spec, matches } of plan) {
    const current = matches[0];
    const action = current ? "update" : "create";
    console.log(`${action}: ${spec.conceptKey} → ${spec.name}${current ? ` (preserve ${current.id})` : ""}`);
  }

  if (!apply) {
    console.log("No data changed. Re-run with --apply only after reviewing this plan.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const { spec, matches } of plan) {
      const current = matches[0];
      const data = {
        conceptKey: spec.conceptKey,
        name: spec.name,
        capacity: spec.capacity,
        sortOrder: spec.sortOrder,
        weatherSensitive: spec.weatherSensitive,
        requiresApproval: spec.requiresApproval,
        reservable: true,
        isActive: true,
      };
      if (current) {
        await tx.restaurantSpace.update({ where: { id: current.id }, data });
      } else {
        await tx.restaurantSpace.create({ data: { venueId: venue.id, ...data } });
      }
    }
  });

  console.log("Local #5 space synchronization completed. Re-run without --apply to verify the resulting inventory.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
