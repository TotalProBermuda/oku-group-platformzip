#!/usr/bin/env tsx
/**
 * scripts/seed-demo-translations.ts
 *
 * Seeds pre-translated demo content for the 5 seeded Series records.
 * Marks all records as COMPLETED with provider: "seeded" so they are
 * immediately visible in the UI without needing an external translation provider.
 *
 * Run: npx tsx scripts/seed-demo-translations.ts
 */

import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

const prisma = new PrismaClient();

function hash(text: string) {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

async function upsert(params: {
  entityId: string;
  fieldName: string;
  sourceText: string;
  targetLocale: string;
  translatedText: string;
}) {
  const { entityId, fieldName, sourceText, targetLocale, translatedText } = params;
  await prisma.contentTranslation.upsert({
    where: {
      entityType_entityId_fieldName_targetLocale: {
        entityType: "Series",
        entityId,
        fieldName,
        targetLocale,
      },
    },
    create: {
      entityType: "Series",
      entityId,
      fieldName,
      sourceLocale: "en",
      targetLocale,
      sourceText,
      sourceTextHash: hash(sourceText),
      translatedText,
      status: "COMPLETED",
      provider: "seeded",
    },
    update: {
      translatedText,
      sourceTextHash: hash(sourceText),
      status: "COMPLETED",
      provider: "seeded",
    },
  });
}

const TRANSLATIONS: Array<{
  slug: string;
  fields: Record<string, { en: string; es: string; pt: string }>;
}> = [
  {
    slug: "sophia-design-masterclass",
    fields: {
      title: {
        en: "Sophia's Design Masterclass",
        es: "Clase Magistral de Diseño de Sophia",
        pt: "Masterclass de Design de Sophia",
      },
      subtitle: {
        en: "A 3-session deep-dive into luxury interior design",
        es: "Una inmersión profunda de 3 sesiones en el diseño de interiores de lujo",
        pt: "Uma imersão profunda de 3 sessões no design de interiores de luxo",
      },
      description: {
        en: "Join renowned designer Sophia Laurent for an exclusive 3-session masterclass on modern interior design. Learn the principles of luxury minimalism, colour theory for hospitality spaces, and hands-on styling with curated materials.",
        es: "Únete a la reconocida diseñadora Sophia Laurent en una clase magistral exclusiva de 3 sesiones sobre diseño interior moderno. Aprende los principios del minimalismo de lujo, la teoría del color para espacios de hospitalidad y el estilismo práctico con materiales curados.",
        pt: "Junte-se à renomada designer Sophia Laurent para uma masterclass exclusiva de 3 sessões sobre design de interiores moderno. Aprenda os princípios do minimalismo de luxo, teoria das cores para espaços de hospitalidade e styling com materiais curados.",
      },
    },
  },
  {
    slug: "catch-cocktail-experience",
    fields: {
      title: {
        en: "CATCH Cocktail Experience",
        es: "Experiencia Cocktail CATCH",
        pt: "Experiência Cocktail CATCH",
      },
      subtitle: {
        en: "Master the art of mixology with our award-winning bar team",
        es: "Domina el arte de la mixología con nuestro premiado equipo de barra",
        pt: "Domine a arte da mixologia com a nossa premiada equipa de bar",
      },
      description: {
        en: "An immersive cocktail crafting series at CATCH. Each session covers a different spirit category — gin & botanicals, whiskey expressions, and zero-proof cocktails — with tasting flights and take-home recipe cards.",
        es: "Una serie inmersiva de creación de cócteles en CATCH. Cada sesión cubre una categoría diferente de destilados — ginebra y botánicos, expresiones de whiskey y cócteles sin alcohol — con degustaciones y tarjetas de recetas para llevar a casa.",
        pt: "Uma série imersiva de criação de cocktails no CATCH. Cada sessão cobre uma categoria de bebida diferente — gin e botânicos, expressões de whiskey e cocktails sem álcool — com provas e cartões de receitas para levar para casa.",
      },
    },
  },
  {
    slug: "rossi-wine-dinner",
    fields: {
      title: {
        en: "Rossi Wine & Dinner Pairing",
        es: "Maridaje de Vinos y Cena Rossi",
        pt: "Harmonização de Vinhos e Jantar Rossi",
      },
      subtitle: {
        en: "Five-course Tuscan dinner with rare vintages from Rossi Family Estate",
        es: "Cena toscana de cinco platos con vinos raros de la Bodega Familia Rossi",
        pt: "Jantar toscano de cinco pratos com safras raras da Quinta Família Rossi",
      },
      description: {
        en: "Partner Marco Rossi presents an elegant wine dinner series featuring curated pairings from his family vineyard in Tuscany. A five-course menu by our Executive Chef is complemented by hand-selected vintages and a guided tasting from Marco himself.",
        es: "El socio Marco Rossi presenta una elegante serie de cenas maridadas con selecciones curadas de su viñedo familiar en la Toscana. Un menú de cinco platos de nuestro Chef Ejecutivo se complementa con añadas seleccionadas a mano y una degustación guiada por el propio Marco.",
        pt: "O parceiro Marco Rossi apresenta uma elegante série de jantares com harmonizações curadas da sua quinta familiar na Toscana. Um menu de cinco pratos do nosso Chef Executivo é complementado por safras selecionadas à mão e uma prova guiada pelo próprio Marco.",
      },
    },
  },
  {
    slug: "oku-wellness-retreat",
    fields: {
      title: {
        en: "OKU Wellness Retreat",
        es: "Retiro de Bienestar OKU",
        pt: "Retiro de Bem-Estar OKU",
      },
      subtitle: {
        en: "Mind, body, and nourishment in our garden terrace",
        es: "Mente, cuerpo y nutrición en nuestra terraza jardín",
        pt: "Mente, corpo e nutrição na nossa esplanada jardim",
      },
      description: {
        en: "A holistic wellness series blending mindfulness, nutrition, and movement. Sessions include guided meditation by candlelight, plant-based cooking demonstrations, and energising yoga flows on our garden terrace.",
        es: "Una serie de bienestar holístico que combina mindfulness, nutrición y movimiento. Las sesiones incluyen meditación guiada a la luz de las velas, demostraciones de cocina plant-based y flujos de yoga energizantes en nuestra terraza jardín.",
        pt: "Uma série de bem-estar holístico que combina mindfulness, nutrição e movimento. As sessões incluem meditação guiada à luz de velas, demonstrações de culinária plant-based e fluxos de yoga revigorantes na nossa esplanada jardim.",
      },
    },
  },
  {
    slug: "sarah-ibiza-supper-club",
    fields: {
      title: {
        en: "Sarah Jenkins: Ibiza Supper Club",
        es: "Sarah Jenkins: Club de Cenas de Ibiza",
        pt: "Sarah Jenkins: Supper Club de Ibiza",
      },
      subtitle: {
        en: "A taste of the Mediterranean, brought to New York",
        es: "Un sabor del Mediterráneo, traído a Nueva York",
        pt: "Um sabor do Mediterrâneo trazido a Nova Iorque",
      },
      description: {
        en: "Travel & food creator Sarah Jenkins curates a night inspired by Ibiza's legendary dining scene — shared plates, natural wines, and music from a rotating DJ residency. Limited to 40 guests per session.",
        es: "La creadora de viajes y gastronomía Sarah Jenkins cura una noche inspirada en la legendaria escena gastronómica de Ibiza — platos para compartir, vinos naturales y música de una residencia de DJ rotativa. Limitado a 40 invitados por sesión.",
        pt: "A criadora de viagens e gastronomia Sarah Jenkins cura uma noite inspirada na lendária cena gastronómica de Ibiza — pratos partilhados, vinhos naturais e música de uma residência de DJ rotativa. Limitado a 40 convidados por sessão.",
      },
    },
  },
];

async function main() {
  console.log("\n🌐 Seeding demo translations for Series content...\n");

  for (const { slug, fields } of TRANSLATIONS) {
    const series = await prisma.series.findUnique({ where: { slug } });
    if (!series) {
      console.warn(`  ⚠ Series not found: ${slug} — run the main seed first`);
      continue;
    }

    for (const [fieldName, texts] of Object.entries(fields)) {
      for (const locale of ["es", "pt"] as const) {
        await upsert({
          entityId: series.id,
          fieldName,
          sourceText: texts.en,
          targetLocale: locale,
          translatedText: texts[locale],
        });
      }
    }

    console.log(`  ✔ ${slug} — ES + PT translations seeded`);
  }

  const total = await prisma.contentTranslation.count({ where: { entityType: "Series", status: "COMPLETED" } });
  console.log(`\n✔ Done — ${total} total COMPLETED Series translations in database.\n`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
