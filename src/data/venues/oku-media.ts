export type OkuMediaItem = {
  id: string;
  src: string;
  alt: string;
  category: "interior" | "food" | "drink" | "detail";
  tags: string[];
  usedIn: string[];
};

export const OKU_MEDIA_LIBRARY: OkuMediaItem[] = [
  // ── Batch 1 — Original interiors + food (DSC-named, 2000px legacy pass) ───
  {
    id: "oku-interior-pendant-01",
    src: "/images/oku/dsc08697.jpg",
    alt: "Pendant lights with rattan shades against iridescent blue fish-scale tile wall",
    category: "detail",
    tags: ["pendant", "lights", "fish-scale", "tile", "blue", "atmosphere"],
    usedIn: ["gallery-cell-3"],
  },
  {
    id: "oku-interior-pendant-02",
    src: "/images/oku/dsc08698.jpg",
    alt: "Straw pendant lights with golden wire frames against blue fish-scale wall",
    category: "detail",
    tags: ["pendant", "lights", "fish-scale", "tile", "blue", "atmosphere"],
    usedIn: [],
  },
  {
    id: "oku-interior-pendant-03",
    src: "/images/oku/dsc08699.jpg",
    alt: "Atmospheric pendant lights and blue tile wall, horizontal framing",
    category: "detail",
    tags: ["pendant", "lights", "fish-scale", "tile", "blue", "atmosphere"],
    usedIn: [],
  },
  {
    id: "oku-interior-table-single",
    src: "/images/oku/dsc08700.jpg",
    alt: "Single intimate table set for two with white napkins and wine glasses against blue fish-scale wall",
    category: "interior",
    tags: ["table", "setting", "intimate", "napkins", "wine", "fish-scale"],
    usedIn: ["gallery-cell-2"],
  },
  {
    id: "oku-interior-table-double",
    src: "/images/oku/dsc08704.jpg",
    alt: "Two dining tables set with pendant lights above and signature blue tile wall",
    category: "interior",
    tags: ["table", "setting", "pendant", "lights", "fish-scale", "dining"],
    usedIn: [],
  },
  {
    id: "oku-interior-full-room-01",
    src: "/images/oku/dsc08707.jpg",
    alt: "Full OKÜ dining room — long banquet table foreground, bar counter background, fish-scale feature wall",
    category: "interior",
    tags: ["full-room", "banquet", "bar", "fish-scale", "ambient", "wide"],
    usedIn: ["hero-background"],
  },
  {
    id: "oku-interior-full-room-02",
    src: "/images/oku/dsc08708.jpg",
    alt: "OKÜ dining room wide shot showing full layout with warm ambient lighting",
    category: "interior",
    tags: ["full-room", "banquet", "bar", "fish-scale", "ambient", "wide"],
    usedIn: ["gallery-cell-1"],
  },
  {
    id: "oku-sushi-bar-counter",
    src: "/images/oku/dsc08709.jpg",
    alt: "OKÜ sushi bar counter with illuminated glass display case, dark wood ceiling, golden accents",
    category: "interior",
    tags: ["sushi-bar", "counter", "display-case", "wood", "gold", "bar-seating"],
    usedIn: ["sushi-bar-feature-left"],
  },
  {
    id: "oku-sushi-display-octopus",
    src: "/images/oku/dsc08710.jpg",
    alt: "Inside OKÜ sushi display case — whole octopus tentacle, tuna, shrimp nigiri, golden serving bowls",
    category: "food",
    tags: ["sushi-bar", "octopus", "tuna", "nigiri", "display", "raw-fish"],
    usedIn: ["sushi-bar-feature-right"],
  },
  {
    id: "oku-sushi-tuna-salmon",
    src: "/images/oku/dsc08712.jpg",
    alt: "Fresh tuna block (magenta) and Atlantic salmon in OKÜ sushi display case",
    category: "food",
    tags: ["sashimi", "tuna", "salmon", "raw-fish", "display", "close-up"],
    usedIn: ["gallery-cell-5"],
  },
  {
    id: "oku-cocktail-floral-foam",
    src: "/images/oku/dsc08749.jpg",
    alt: "OKÜ signature cocktail — white foam coupe with edible flowers, layered deep red below, dark bokeh background",
    category: "drink",
    tags: ["cocktail", "coupe", "foam", "flowers"],
    usedIn: [],
  },

  // ── Batch 2 — Floral coupe series (cocktail-floral-*, 1200×1600 portrait) ──
  {
    id: "oku-cocktail-floral-01",
    src: "/images/oku/optimized/cocktail-floral-01.jpg",
    alt: "OKÜ Botanica cocktail overhead — foam coupe with purple violet, yellow flower, dehydrated citrus on marble",
    category: "drink",
    tags: ["cocktail", "coupe"],
    usedIn: [],
  },
  {
    id: "oku-cocktail-floral-02",
    src: "/images/oku/optimized/cocktail-floral-02.jpg",
    alt: "Botanica cocktail overhead angle — violet and citrus garnish on white foam",
    category: "drink",
    tags: ["cocktail", "coupe"],
    usedIn: [],
  },
  {
    id: "oku-cocktail-floral-03",
    src: "/images/oku/optimized/cocktail-floral-03.jpg",
    alt: "Botanica cocktail top-down — edible violet, foam, dark red spirit layer",
    category: "drink",
    tags: ["cocktail", "coupe"],
    usedIn: [],
  },
  {
    id: "oku-cocktail-floral-04",
    src: "/images/oku/optimized/cocktail-floral-04.jpg",
    alt: "Botanica cocktail portrait — full glass with etched stem, white foam, floral garnish",
    category: "drink",
    tags: ["cocktail", "coupe"],
    usedIn: [],
  },
  {
    id: "oku-cocktail-floral-05",
    src: "/images/oku/optimized/cocktail-floral-05.jpg",
    alt: "Botanica cocktail portrait — slight angle, edible violet prominent, dark background",
    category: "drink",
    tags: ["cocktail", "coupe"],
    usedIn: [],
  },
  {
    id: "oku-cocktail-floral-06",
    src: "/images/oku/optimized/cocktail-floral-06.jpg",
    alt: "OKÜ Botanica — white foam coupe with edible violet and dehydrated citrus, pure black background",
    category: "drink",
    tags: ["cocktail", "coupe"],
    usedIn: ["gallery-cell-4", "cocktail-feature-floral"],
  },

  // ── Batch 2 — Green sesame coupe series (cocktail-green-*, 1200×1600) ──────
  {
    id: "oku-cocktail-green-01",
    src: "/images/oku/optimized/cocktail-green-01.jpg",
    alt: "OKÜ Midori Sésame — pale green coupe, black sesame dusting, mint leaf, wooden base",
    category: "drink",
    tags: ["cocktail", "coupe"],
    usedIn: [],
  },
  {
    id: "oku-cocktail-green-02",
    src: "/images/oku/optimized/cocktail-green-02.jpg",
    alt: "Midori Sésame overhead — white foam surface, black sesame scattered, mint leaf, green yuzu halo",
    category: "drink",
    tags: ["cocktail", "coupe"],
    usedIn: ["cocktail-feature-green"],
  },
  {
    id: "oku-cocktail-green-03",
    src: "/images/oku/optimized/cocktail-green-03.jpg",
    alt: "Midori Sésame — green coupe with sesame foam, close angle",
    category: "drink",
    tags: ["cocktail", "coupe"],
    usedIn: [],
  },
  {
    id: "oku-cocktail-green-04",
    src: "/images/oku/optimized/cocktail-green-04.jpg",
    alt: "Midori Sésame — darker background, mint leaf backlit, sesame foam",
    category: "drink",
    tags: ["cocktail", "coupe"],
    usedIn: [],
  },

  // ── Batch 3 — Rocks cocktail (cocktail-rocks-overhead, 1200×1600) ──────────
  {
    id: "oku-cocktail-rocks-overhead",
    src: "/images/oku/optimized/cocktail-rocks-overhead.jpg",
    alt: "Overhead view of OKÜ signature rocks cocktail — sphere ice cube, citrus peel garnish, amber spirit, pure dark bg",
    category: "drink",
    tags: ["cocktail", "rocks"],
    usedIn: ["cocktail-feature-overhead"],
  },

  // ── Batch 3 — Golden coupe series (cocktail-coupe-*, 1200×1600 portrait) ───
  {
    id: "oku-cocktail-coupe-01",
    src: "/images/oku/optimized/cocktail-coupe-01.jpg",
    alt: "OKÜ golden coupe full portrait — amber spirit, lemon twist, marble coaster, dark background",
    category: "drink",
    tags: ["cocktail", "coupe"],
    usedIn: ["cocktail-feature-coupe"],
  },
  {
    id: "oku-cocktail-coupe-02",
    src: "/images/oku/optimized/cocktail-coupe-02.jpg",
    alt: "Golden coupe closer angle — warm amber light through glass, lemon twist",
    category: "drink",
    tags: ["cocktail", "coupe"],
    usedIn: [],
  },
  {
    id: "oku-cocktail-coupe-03",
    src: "/images/oku/optimized/cocktail-coupe-03.jpg",
    alt: "Golden coupe dramatic close — deep amber, ice globe, lemon garnish, dark moody bg",
    category: "drink",
    tags: ["cocktail", "coupe"],
    usedIn: [],
  },
  {
    id: "oku-cocktail-coupe-04",
    src: "/images/oku/optimized/cocktail-coupe-04.jpg",
    alt: "Golden coupe extreme close — rim level, lemon twist prominent, amber haze below",
    category: "drink",
    tags: ["cocktail", "coupe"],
    usedIn: [],
  },

  // ── Batch 3 — Koi wall series (interior-koi-wall-*, 1600×1067 landscape) ───
  {
    id: "oku-interior-koi-wall-01",
    src: "/images/oku/optimized/interior-koi-wall-01.jpg",
    alt: "OKÜ koi wall — amber glass-block panel with red koi painting, sushi counter beside it, dark moody",
    category: "interior",
    tags: ["ambiance", "koi-wall"],
    usedIn: [],
  },
  {
    id: "oku-interior-koi-wall-02",
    src: "/images/oku/optimized/interior-koi-wall-02.jpg",
    alt: "Koi wall — same vantage, slightly different framing, dining chairs in foreground",
    category: "interior",
    tags: ["ambiance", "koi-wall"],
    usedIn: [],
  },
  {
    id: "oku-interior-koi-wall-03",
    src: "/images/oku/optimized/interior-koi-wall-03.jpg",
    alt: "OKÜ koi wall full — amber illuminated glass blocks, red koi fish, full panel visible, sushi counter left",
    category: "interior",
    tags: ["ambiance", "koi-wall"],
    usedIn: ["space-detail-koi"],
  },
  {
    id: "oku-interior-koi-wall-04",
    src: "/images/oku/optimized/interior-koi-wall-04.jpg",
    alt: "OKÜ sushi bar and koi wall together — counter set with napkins, display case lit, koi panel glowing",
    category: "interior",
    tags: ["ambiance", "koi-wall"],
    usedIn: [],
  },

  // ── Batch 3 — Sushi bar series (interior-sushi-bar-*, 1600×1067 landscape) ─
  {
    id: "oku-interior-sushi-bar-01",
    src: "/images/oku/optimized/interior-sushi-bar-01.jpg",
    alt: "OKÜ sushi counter with fresh catch display, bowls and ingredients visible, koi wall right",
    category: "interior",
    tags: ["ambiance", "sushi-bar"],
    usedIn: ["space-detail-sushi"],
  },
  {
    id: "oku-interior-sushi-bar-02",
    src: "/images/oku/optimized/interior-sushi-bar-02.jpg",
    alt: "OKÜ sushi display case angled — salmon, octopus, greens, golden bowls, koi wall glimpse",
    category: "interior",
    tags: ["ambiance", "sushi-bar"],
    usedIn: [],
  },
  {
    id: "oku-interior-sushi-bar-03",
    src: "/images/oku/optimized/interior-sushi-bar-03.jpg",
    alt: "OKÜ full dining room — sushi bar left, koi wall centre-left, fish-scale wall right, all three features",
    category: "interior",
    tags: ["ambiance", "sushi-bar"],
    usedIn: ["space-detail-wide"],
  },
  {
    id: "oku-interior-sushi-bar-04",
    src: "/images/oku/optimized/interior-sushi-bar-04.jpg",
    alt: "OKÜ full dining room hero — sushi counter seats, koi wall glowing, fish-scale wall, complete atmosphere",
    category: "interior",
    tags: ["ambiance", "sushi-bar"],
    usedIn: ["space-hero-background"],
  },
];

export function getOkuMediaByCategory(category: OkuMediaItem["category"]): OkuMediaItem[] {
  return OKU_MEDIA_LIBRARY.filter(item => item.category === category);
}

export function getOkuMediaByUsage(usedIn: string): OkuMediaItem | undefined {
  return OKU_MEDIA_LIBRARY.find(item => item.usedIn.includes(usedIn));
}
