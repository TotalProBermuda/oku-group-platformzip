import { notFound, redirect } from "next/navigation";

// ─── Restaurant Data ──────────────────────────────────────────────────────────

const RESTAURANTS = {
  oku: {
    name: "OKÜ",
    tagline: "Fine Dining · Gold House",
    heroLine1: "Intimate.",
    heroLine2: "Deliberate.",
    heroLine3: "27 covers.",
    logoHero: "/images/logo-oku-white-mark.png",
    logoLight: "/images/logo-oku-brand.png",
    logoDark: "/images/logo-oku-white-mark.png",
    logoNeedsWhiteBox: false,
    heroPhoto: "/images/oku/dsc08707.jpg",
    gallery: [
      { src: "/images/oku/dsc08708.jpg", alt: "OKÜ dining room — full view with ambient lighting", pos: "center 30%" },
      { src: "/images/oku/dsc08700.jpg", alt: "Intimate table set for two at OKÜ", pos: "center center" },
      { src: "/images/oku/dsc08697.jpg", alt: "Signature pendant lights against iridescent blue fish-scale wall", pos: "center 60%" },
      { src: "/images/oku/optimized/cocktail-floral-06.jpg", alt: "OKÜ Botanica cocktail — white foam coupe with edible violet, dehydrated citrus", pos: "center 25%" },
      { src: "/images/oku/dsc08712.jpg", alt: "Fresh tuna and salmon sashimi in OKÜ sushi display", pos: "center center" },
    ],
    sushiBarFeature: {
      heading: "The Sushi Counter",
      body: "At the heart of OKÜ sits an intimate sushi counter. Each day the chefs prepare fresh cuts from whole fish selected by our suppliers — tuna, salmon, octopus — displayed in the illuminated case for guests to see before they order.",
      photos: [
        { src: "/images/oku/dsc08709.jpg", alt: "OKÜ sushi bar counter with illuminated display case" },
        { src: "/images/oku/dsc08710.jpg", alt: "Octopus, tuna and nigiri in the OKÜ sushi display" },
      ],
    },
    about: [
      "Named after the group it anchors, OKÜ is a study in restraint. Crisp white linen, hand-blown glassware, and a kitchen that believes simplicity is the highest form of sophistication.",
      "The menu changes with the season — drawing from producers across the Mediterranean. Iberian cured meats, Sicilian citrus, Aegean olive oils — composed into tasting menus that feel inevitable rather than constructed.",
      "The dining room holds 27. The lighting is always exactly right.",
    ],
    address: "Gold House, Casco Viejo, Panama City",
    phone: "+507 6000 0001",
    email: "reservations@okugroup.com",
    hours: [
      { day: "Monday – Thursday", time: "5:00 pm – 12:00 am" },
      { day: "Friday – Sunday", time: "2:00 pm – 12:00 am" },
    ],
    accent: "#1a1614",
    accentLight: "#f5f2ef",
    accentMid: "rgba(26,22,20,0.85)",
    tag: "Fine Dining",
    dresscode: "Smart casual to formal",
    menu: [
      {
        category: "To Begin",
        items: [
          { name: "Burrata del Giorno", desc: "Heirloom tomato, basil oil, aged balsamic, grilled sourdough", price: "$18" },
          { name: "Seared Scallops", desc: "Pea purée, crispy pancetta, lemon foam, micro herbs", price: "$24" },
          { name: "Yellowfin Tataki", desc: "Sesame crust, ponzu, pickled daikon, avocado", price: "$22" },
          { name: "Charred Leek Velouté", desc: "Crème fraîche, hazelnut oil, chives", price: "$14" },
        ],
      },
      {
        category: "Mains",
        items: [
          { name: "Slow-Roasted Lamb Shoulder", desc: "Merguez spices, chickpea purée, harissa, preserved lemon yoghurt", price: "$48" },
          { name: "Pan-Seared Sea Bass", desc: "Bouillabaisse broth, fennel confit, saffron aïoli, Niçoise vegetables", price: "$44" },
          { name: "Tagliolini al Limone", desc: "House-made pasta, Amalfi lemon, 24-month Parmigiano, Calabrian chilli", price: "$32" },
          { name: "Duck Breast Rossini", desc: "Foie gras, Périgueux sauce, fig compote, potato gratin", price: "$52" },
        ],
      },
      {
        category: "To Finish",
        items: [
          { name: "Valrhona Chocolate Fondant", desc: "Tahini ice cream, caramelised hazelnut, sea salt", price: "$16" },
          { name: "Cheese Selection", desc: "Three artisan cheeses, membrillo, honeycomb, walnut bread", price: "$22" },
          { name: "Citrus Tart", desc: "Yuzu curd, Italian meringue, bergamot sorbet", price: "$14" },
        ],
      },
    ],
    others: [
      { slug: "catch", name: "CATCH", tag: "Social Dining" },
      { slug: "terrace", name: "TERRACE", tag: "Open-Air Rooftop" },
    ],
  },

  catch: {
    name: "CATCH",
    heroPhoto: "/images/catch/dining-room.jpg",
    tagline: "Caribbean Dining · Gold House",
    heroLine1: "Gather.",
    heroLine2: "Share.",
    heroLine3: "",
    logoHero: "/images/logo-catch.webp",
    logoLight: "/images/logo-catch.webp",
    logoDark: "/images/logo-catch.webp",
    logoNeedsWhiteBox: false,
    about: [
      "CATCH is designed around shared tables, generous plates, and easy conversation.",
      "The room brings food, drinks, and music together without losing sight of the restaurant experience at its centre.",
      "A relaxed and welcoming setting for groups, gatherings, and time together.",
    ],
    address: "Gold House, Casco Viejo, Panama City",
    phone: "+507 6000 0002",
    email: "catch@okugroup.com",
    hours: [
      { day: "Monday – Thursday", time: "5:00 pm – 12:00 am" },
      { day: "Friday – Sunday", time: "2:00 pm – 12:00 am" },
    ],
    accent: "#1e3a5f",
    accentLight: "#f0f4f8",
    accentMid: "rgba(30,58,95,0.88)",
    tag: "Restaurant",
    dresscode: "Smart casual",
    menu: [
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
    ],
    others: [
      { slug: "oku", name: "OKÜ", tag: "Fine Dining" },
      { slug: "terrace", name: "TERRACE", tag: "Open-Air Rooftop" },
    ],
  },

  terrace: {
    name: "TERRACE",
    tagline: "Rooftop Dining · Gold House",
    heroLine1: "The city",
    heroLine2: "at your feet.",
    heroLine3: "",
    logoHero: "/images/logo-terrace-cream.png",
    logoLight: "/images/logo-terrace-cream.png",
    logoDark: "/images/logo-terrace-green.png",
    logoNeedsWhiteBox: false,
    about: [
      "The Terrace sits on the roof of Gold House and opens every evening to the Panama sky. Hand-painted Moroccan tile runs underfoot. Wrought-iron lanterns line the perimeter. Bougainvillea climbs the south wall.",
      "The kitchen sends out Pan-American sharing plates — ceviches, anticuchos, wood-fired flatbreads — designed to be eaten slowly, over conversation, as the city transitions from day to night below.",
      "At 42 covers, it is our largest space, and also our most beloved.",
    ],
    address: "Gold House (Rooftop), Casco Viejo, Panama City",
    phone: "+507 6000 0003",
    email: "terrace@okugroup.com",
    hours: [
      { day: "Monday – Thursday", time: "5:00 pm – 12:00 am" },
      { day: "Friday – Sunday", time: "2:00 pm – 12:00 am" },
    ],
    accent: "#2d4a1e",
    accentLight: "#f2f5f0",
    accentMid: "rgba(45,74,30,0.88)",
    tag: "Rooftop",
    dresscode: "Casual to smart casual",
    menu: [
      {
        category: "Ceviches & Cold",
        items: [
          { name: "Ceviche Clásico", desc: "Fresh corvina, leche de tigre, red onion, sweet potato, choclo", price: "$18" },
          { name: "Aguachile Negro", desc: "Prawn, charred jalapeño, cucumber, black sesame, avocado crema", price: "$20" },
          { name: "Tuna Causa", desc: "Yellow potato cake, yellowfin tuna, avocado, huancaína sauce", price: "$22" },
        ],
      },
      {
        category: "From the Grill",
        items: [
          { name: "Beef Anticuchos", desc: "Heart of palm skewers, chimichurri, roasted corn, huacatay oil", price: "$24" },
          { name: "Churrasco Platter", desc: "200g prime strip, chimichurri rojo, charred onion, patatas bravas", price: "$48" },
          { name: "Roasted Octopus", desc: "Romesco, smoked paprika oil, chickpea, preserved lemon, micro cress", price: "$36" },
          { name: "Flatbread del Terrace", desc: "Wood-fired, mozzarella, chorizo, roasted peppers, honey", price: "$20" },
        ],
      },
      {
        category: "Cocktails",
        items: [
          { name: "Pisco Sour", desc: "Barsol pisco, fresh lime, egg white, Angostura bitters", price: "$14" },
          { name: "Mezcal Negroni", desc: "Vida mezcal, Campari, sweet vermouth, orange", price: "$16" },
          { name: "Terrace Sunset", desc: "Rum, mango, passion fruit, lime, basil, sparkling wine", price: "$15" },
        ],
      },
    ],
    others: [
      { slug: "oku", name: "OKÜ", tag: "Fine Dining" },
      { slug: "catch", name: "CATCH", tag: "Social Dining" },
    ],
  },
} as const;

type Slug = keyof typeof RESTAURANTS;

export async function generateStaticParams() {
  return (Object.keys(RESTAURANTS) as Slug[]).map(slug => ({ slug }));
}

export default async function RestaurantPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!(slug in RESTAURANTS)) notFound();
  redirect(`/en/restaurants/${slug}`);
}
