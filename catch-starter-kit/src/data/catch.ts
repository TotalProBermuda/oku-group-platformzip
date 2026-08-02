// ───────────────────────────────────────────────────────────────────────────
// CATCH — all venue content lives here as plain static data.
// Edit this file to change copy, contact details, menu, gallery, or events.
// No database, no CMS — it is intentionally simple and self-contained.
// ───────────────────────────────────────────────────────────────────────────

export const brand = {
  // Near-black for hero / reserve / footer sections (CATCH dark identity).
  dark: "#16110f",
  // Soft warm light used behind the gallery + page background.
  light: "#f0ece6",
  pageBg: "#faf8f6",
  // CATCH crimson — buttons + highlights.
  crimson: "#c41e3a",
  crimsonDark: "#9e1730",
  // Gold for small eyebrow labels (matches the old CATCH look).
  gold: "#c9a24a",
  ink: "#1f1a17",
  inkSoft: "#7d7269",
};

export const info = {
  name: "CATCH",
  tagline: "Mariscos frescos y cócteles únicos",
  taglineEn: "Fresh seafood & singular cocktails",
  heroLine1: "The night",
  heroLine2: "starts here.",
  // Pulled from the live CATCH site.
  phone: "+507 270-9783",
  email: "reservations@catchpanama.com",
  address: "Gold House, Casco Viejo, Panama City",
  cuisine: "Caribbean-inspired sharing plates",
  setting: "Indoor / outdoor hybrid",
  dresscode: "Smart casual",
  covers: 24,
  hours: [
    { day: "Thursday", time: "8:00 pm – 1:00 am" },
    { day: "Friday – Saturday", time: "8:00 pm – 2:00 am" },
  ],
  social: {
    instagram: "https://www.instagram.com/catchpanama",
  },
};

export const about: string[] = [
  "CATCH was built for the hours after 9. For tables that linger, for rounds that become three, for the moment a dinner becomes a night.",
  "The menu is designed for sharing — Caribbean-inspired plates that arrive in waves, each one an excuse to stay a little longer. The DJ booth rotates every Thursday through Saturday with local and international talent.",
  "Rattan fixtures, exposed concrete, warm lighting. A space that's simultaneously casual and magnetic.",
];

export type GalleryPhoto = { src: string; alt: string; pos?: string };

export const heroPhoto: GalleryPhoto = {
  src: "/images/catch/grill.jpg",
  alt: "Caribbean grill plate at CATCH Panamá",
  pos: "center 45%",
};

export const gallery: GalleryPhoto[] = [
  { src: "/images/catch/carrusel-1.jpg", alt: "CATCH dining atmosphere", pos: "center center" },
  { src: "/images/catch/cocktail.jpg", alt: "Signature CATCH cocktail", pos: "center 30%" },
  { src: "/images/catch/sushi-burger.jpg", alt: "Seafood sharing plate", pos: "center center" },
  { src: "/images/catch/carrusel-2.jpg", alt: "Caribbean sharing plates", pos: "center center" },
  { src: "/images/catch/ambience.jpg", alt: "CATCH interior at night", pos: "center 40%" },
];

export type MenuCategory = {
  category: string;
  items: { name: string; desc: string; price: string }[];
};

export const menu: MenuCategory[] = [
  {
    category: "Sharing Plates",
    items: [
      { name: "Jerk Chicken Skewers", desc: "Scotch bonnet glaze, mango chutney, lime crema, toasted sesame", price: "$18" },
      { name: "Coconut Shrimp", desc: "Spiced coconut batter, tamarind dip, pickled pineapple", price: "$20" },
      { name: "Tostones & Guacamole", desc: "Twice-fried plantain, chunky guacamole, chipotle mayo, pico de gallo", price: "$12" },
      { name: "Salt Fish Fritters", desc: "Cornmeal crust, scotch bonnet aioli, escabeche slaw", price: "$16" },
    ],
  },
  {
    category: "Main Plates",
    items: [
      { name: "Lobster Rice", desc: "Whole Caribbean lobster, saffron bomba rice, sofrito, crispy capers", price: "$54" },
      { name: "Oxtail Croquettes", desc: "Slow-braised oxtail, panko crust, aji amarillo emulsion, micro coriander", price: "$26" },
      { name: "Whole Mahi Mahi", desc: "Wood-fired, coconut broth, fried plantain, sofrito negro, lime", price: "$46" },
      { name: "Ropa Vieja Tacos", desc: "Hand-pulled beef, pickled red onion, queso fresco, salsa verde (3 pcs)", price: "$24" },
    ],
  },
  {
    category: "Cocktails",
    items: [
      { name: "CATCH Rum Punch", desc: "House blend rum, passion fruit, lime, Angostura, ginger beer", price: "$14" },
      { name: "Spiced Old Fashioned", desc: "Aged rum, cinnamon syrup, orange bitters, smoked cherry", price: "$16" },
      { name: "Coconut Paloma", desc: "Tequila, coconut water, fresh grapefruit, chilli salt rim", price: "$15" },
    ],
  },
];

// Events shown on this site. Ticket checkout happens on the group engine.
// `slug` is just a local id (React key). To deep-link "Get Tickets" to a
// specific event, set `seriesSlug` to the REAL group "Series" slug; otherwise
// the button sends guests to the group events browse page (no 404).
export type CatchEvent = {
  slug: string;
  seriesSlug?: string;
  title: string;
  date: string;
  time: string;
  blurb: string;
  image: string;
};

export const events: CatchEvent[] = [
  {
    slug: "caribbean-nights",
    title: "Caribbean Nights",
    date: "Every Thursday",
    time: "9:00 pm – 1:00 am",
    blurb: "Resident DJs, rum cocktails, and sharing plates until late. The signature CATCH evening.",
    image: "/images/catch/carrusel-1.jpg",
  },
  {
    slug: "sunset-sessions",
    title: "Sunset Sessions",
    date: "Friday – Saturday",
    time: "8:00 pm – 2:00 am",
    blurb: "Live sets from rotating local and international talent, paired with the full late-night menu.",
    image: "/images/catch/cocktail.jpg",
  },
  {
    slug: "lobster-rum-supper",
    title: "Lobster & Rum Supper",
    date: "Last Saturday monthly",
    time: "8:00 pm",
    blurb: "A four-course Caribbean tasting with paired rum flights. Limited seats — ticketed.",
    image: "/images/catch/carrusel-2.jpg",
  },
];
