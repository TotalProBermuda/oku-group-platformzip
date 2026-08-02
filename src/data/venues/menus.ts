import type { LocalizedText } from "@/types/i18n";

export type MenuItem = {
  id: string;
  name: string | LocalizedText;
  description?: string | LocalizedText;
  price?: string;
  dietary?: string[];
  tags?: string[];
  order: number;
  isAvailable?: boolean;
};

export type MenuSection = {
  id: string;
  title: string | LocalizedText;
  subtitle?: string | LocalizedText;
  description?: string | LocalizedText;
  order: number;
  items: MenuItem[];
};

export type VenueMenu = {
  venueSlug: "oku" | "catch" | "terrace";
  venueName: string | LocalizedText;
  menuTitle: string | LocalizedText;
  menuType: "food" | "drinks";
  intro?: string | LocalizedText;
  pdfUrl?: string;
  order: number;
  sections: MenuSection[];
};

function clean(s?: string): string | undefined {
  if (!s) return undefined;
  return s.replace(/ Source copy appears truncated in Recafy\./g, "").trim() || undefined;
}

export const venueMenus: VenueMenu[] = [
  {
    venueSlug: "catch",
    venueName: "CATCH",
    menuTitle: { en: "CATCH MENU", es: "MENÚ CATCH", pt: "MENU CATCH" },
    menuType: "food",
    order: 1,
    intro: {
      en: "Our Caribbean menu, inspired by Bermuda's culinary tradition, is made with carefully selected local products, bringing to life fresh, vibrant dishes full of tropical authenticity.",
      es: "Nuestro menú caribeño, inspirado en la tradición culinaria de Bermudas, está elaborado con productos locales cuidadosamente seleccionados, dando vida a platos frescos y vibrantes llenos de autenticidad tropical.",
      pt: "Nosso menu caribenho, inspirado na tradição culinária das Bermudas, é feito com produtos locais cuidadosamente selecionados, dando vida a pratos frescos e vibrantes cheios de autenticidade tropical.",
    },
    sections: [
      {
        id: "catch-starters",
        title: { en: "Starters", es: "Entradas", pt: "Entradas" },
        order: 1,
        items: [
          {
            id: "catch-tropical-ceviche",
            name: { en: "Tropical Ceviche", es: "Ceviche Tropical", pt: "Ceviche Tropical" },
            description: {
              en: clean("Fresh snapper cubes marinated in citrus leche de tigre, accented with tropical fruit."),
              es: "Cubos de pargo fresco marinados en leche de tigre cítrica, acentuados con fruta tropical.",
              pt: "Cubos de vermelho fresco marinados em leche de tigre cítrico, acentuados com fruta tropical.",
            },
            price: "$16.00", order: 1
          },
          {
            id: "catch-garlic-mussel",
            name: { en: "Garlic Mussel", es: "Mejillones al Ajillo", pt: "Mexilhão ao Alho" },
            description: {
              en: "Mussels cooked in a smooth, well-balanced garlic and white wine cream sauce.",
              es: "Mejillones cocinados en una suave y equilibrada salsa cremosa de ajo y vino blanco.",
              pt: "Mexilhões cozidos em um molho cremoso suave e equilibrado de alho e vinho branco.",
            },
            price: "$18.00", order: 2
          },
          {
            id: "catch-fish-chowder",
            name: { en: "Fish Chowder", es: "Sopa de Pescado", pt: "Sopa de Peixe" },
            description: {
              en: clean("Traditional Bermudian fish chowder, slow-simmered with fresh fish and aromatic spices."),
              es: "Sopa de pescado bermudiana tradicional, cocida a fuego lento con pescado fresco y especias aromáticas.",
              pt: "Sopa de peixe bermudiana tradicional, cozida lentamente com peixe fresco e especiarias aromáticas.",
            },
            price: "$12.00", order: 3
          },
        ],
      },
      {
        id: "catch-pastas",
        title: { en: "Pastas", es: "Pastas", pt: "Massas" },
        order: 2,
        items: [
          {
            id: "catch-lobster-mac-cheese",
            name: { en: "Lobster Mac & Cheese", es: "Mac & Cheese de Langosta", pt: "Mac & Cheese de Lagosta" },
            description: {
              en: clean("Prepared with Dijon mustard, butter, and white wine, finished with a Parmesan crust."),
              es: "Preparado con mostaza Dijon, mantequilla y vino blanco, terminado con una corteza de parmesano.",
              pt: "Preparado com mostarda Dijon, manteiga e vinho branco, finalizado com uma crosta de parmesão.",
            },
            price: "$35.00", order: 1
          },
          {
            id: "catch-seafood-pasta",
            name: { en: "Seafood Pasta", es: "Pasta de Mariscos", pt: "Massa de Frutos do Mar" },
            description: {
              en: "Pasta with prawns, octopus, and mussels in a creamy lobster bisque sauce.",
              es: "Pasta con langostinos, pulpo y mejillones en una cremosa salsa bisque de langosta.",
              pt: "Massa com camarões, polvo e mexilhões em um cremoso molho bisque de lagosta.",
            },
            price: "$28.00", order: 2
          },
        ],
      },
      {
        id: "catch-meats",
        title: { en: "Meats", es: "Carnes", pt: "Carnes" },
        order: 3,
        items: [
          {
            id: "catch-surf-turf-tenderloin",
            name: { en: "Surf & Turf Tenderloin", es: "Lomo Mar y Tierra", pt: "Filé Mignon Mar e Terra" },
            description: {
              en: clean("The perfect land-and-sea combination: tender beef tenderloin served over a creamy base."),
              es: "La combinación perfecta de tierra y mar: tierno lomo de res servido sobre una base cremosa.",
              pt: "A combinação perfeita de terra e mar: macio filé mignon servido sobre uma base cremosa.",
            },
            price: "$40.00", order: 1
          },
          {
            id: "catch-new-york-steak",
            name: { en: "New York Steak", es: "Bife New York", pt: "Bife New York" },
            description: {
              en: clean("Grilled New York strip steak served with French fries or sweet potato fries."),
              es: "Bife de lomo NY a la plancha, servido con papas fritas o batatas fritas.",
              pt: "Bife strip NY grelhado, servido com batata frita ou batata doce frita.",
            },
            price: "$32.00", order: 2
          },
        ],
      },
      {
        id: "catch-fish-seafood",
        title: { en: "Fish & Seafood", es: "Pescados y Mariscos", pt: "Peixes e Frutos do Mar" },
        description: {
          en: "Prices are subject to market supply.",
          es: "Los precios están sujetos a la disponibilidad del mercado.",
          pt: "Os preços estão sujeitos à disponibilidade do mercado.",
        },
        order: 4,
        items: [
          { id: "catch-fried-or-grilled-prawns", name: { en: "Fried or Grilled Prawns", es: "Langostinos Fritos o a la Plancha", pt: "Camarões Fritos ou Grelhados" }, description: { en: clean("Fresh prawns marinated Bermudian-style, grilled or breaded, served with tartar sauce."), es: "Langostinos frescos marinados al estilo bermudiano, a la plancha o empanizados, con salsa tártara.", pt: "Camarões frescos marinados ao estilo bermudiano, grelhados ou empanados, com molho tártaro." }, price: "$25.00", order: 1 },
          { id: "catch-grilled-lobster-tail", name: { en: "Grilled Lobster Tail", es: "Cola de Langosta a la Plancha", pt: "Cauda de Lagosta Grelhada" }, description: { en: "Lobster tail glazed with garlic and parsley butter. Per pound.", es: "Cola de langosta glaseada con mantequilla de ajo y perejil. Por libra.", pt: "Cauda de lagosta glaceada com manteiga de alho e salsinha. Por libra." }, price: "$45.00", order: 2 },
          { id: "catch-lobster-thermidor", name: { en: "Lobster Thermidor", es: "Langosta Thermidor", pt: "Lagosta Thermidor" }, description: { en: clean("Lobster tail bathed in a white wine, butter, and Dijon mustard sauce, gratinated."), es: "Cola de langosta bañada en salsa de vino blanco, mantequilla y mostaza Dijon, gratinada.", pt: "Cauda de lagosta banhada em molho de vinho branco, manteiga e mostarda Dijon, gratinada." }, price: "$55.00", order: 3 },
          { id: "catch-fried-whole-fish", name: { en: "Fried Whole Fish", es: "Pescado Entero Frito", pt: "Peixe Inteiro Frito" }, description: { en: clean("Catch of the day seasoned Bermudian-style, carefully fried to a golden crust."), es: "Pescado del día sazonado al estilo bermudiano, frito a la perfección con corteza dorada.", pt: "Peixe do dia temperado ao estilo bermudiano, frito a perfeição com casca dourada." }, price: "$25.00", order: 4 },
          { id: "catch-seafood-platter-for-two", name: { en: "Seafood Platter (For Two)", es: "Plato de Mariscos (Para Dos)", pt: "Prato de Frutos do Mar (Para Dois)" }, description: { en: clean("Caribbean batter fish strips, mussels, fried calamari, and grilled prawns."), es: "Tiras de pescado en tempura caribeña, mejillones, calamares fritos y langostinos a la plancha.", pt: "Tiras de peixe em tempura caribenha, mexilhões, lulas fritas e camarões grelhados." }, price: "$65.00", order: 5 },
          { id: "catch-salmon-grill", name: { en: "Salmon Grill", es: "Salmón a la Plancha", pt: "Salmão Grelhado" }, description: { en: clean("Grilled salmon on velvety cauliflower cream, topped with crunchy pistachios."), es: "Salmón a la plancha sobre crema de coliflor aterciopelada, coronado con pistachos crujientes.", pt: "Salmão grelhado sobre cremoso purê de couve-flor, coroado com pistaches crocantes." }, price: "$25.00", order: 6 },
          { id: "catch-whole-grilled-fish", name: { en: "Whole Grilled Fish", es: "Pescado Entero a la Plancha", pt: "Peixe Inteiro Grelhado" }, description: { en: clean("Grilled fish of the day, seasoned with Caribbean inspiration, cooked to perfection."), es: "Pescado del día a la plancha, sazonado con inspiración caribeña, cocinado a la perfección.", pt: "Peixe do dia grelhado, temperado com inspiração caribenha, cozido à perfeição." }, price: "$25.00", order: 7 },
        ],
      },
      {
        id: "catch-burgers",
        title: { en: "Burgers", es: "Hamburguesas", pt: "Hambúrgueres" },
        order: 5,
        items: [
          { id: "catch-di-wine-burger", name: { en: "Di Wine Burger", es: "Hamburguesa Di Wine", pt: "Hambúrguer Di Wine" }, description: { en: clean("Brioche bun, 6 oz Angus beef patty, Cheddar cheese, bacon mayonnaise, wine-caramelized onion."), es: "Pan brioche, medallón de res Angus 6 oz, queso Cheddar, mayonesa de tocino, cebolla caramelizada al vino.", pt: "Pão brioche, hambúrguer Angus 170g, queijo Cheddar, maionese de bacon, cebola caramelizada ao vinho." }, price: "$18.00", order: 1 },
          { id: "catch-lobster-burger", name: { en: "Lobster Burger", es: "Hamburguesa de Langosta", pt: "Hambúrguer de Lagosta" }, description: { en: clean("Brioche bun, 6 oz Angus beef patty, butter-sautéed lobster meat, arugula, spicy sauce."), es: "Pan brioche, medallón Angus 6 oz, carne de langosta salteada en mantequilla, rúcula, salsa picante.", pt: "Pão brioche, hambúrguer Angus 170g, carne de lagosta salteada na manteiga, rúcula, molho picante." }, price: "$38.00", order: 2 },
        ],
      },
      {
        id: "catch-sides",
        title: { en: "Sides", es: "Acompañamientos", pt: "Acompanhamentos" },
        order: 6,
        items: [
          { id: "catch-coconut-rice", name: { en: "Coconut Rice", es: "Arroz con Coco", pt: "Arroz de Coco" }, description: { en: clean("Fragrant rice cooked in coconut milk, with a mild, slightly sweet flavor."), es: "Arroz aromático cocido en leche de coco, con un sabor suave y ligeramente dulce.", pt: "Arroz aromático cozido em leite de coco, com sabor suave e levemente adocicado." }, price: "$7.00", order: 1 },
          { id: "catch-crispy-plantain-chips", name: { en: "Crispy Plantain Chips", es: "Chips de Plátano Crujientes", pt: "Chips de Banana da Terra Crocantes" }, description: { en: clean("Thin golden slices, crispy with a natural toasted flavor."), es: "Rodajas doradas y finas, crujientes con un sabor natural tostado.", pt: "Fatias finas e douradas, crocantes com sabor natural tostado." }, price: "$7.00", order: 2 },
          { id: "catch-house-salad", name: { en: "House Salad", es: "Ensalada de la Casa", pt: "Salada da Casa" }, description: { en: clean("Tropical salad with lettuce, melon, pineapple, tomato, and onion for contrast."), es: "Ensalada tropical con lechuga, melón, piña, tomate y cebolla para contraste.", pt: "Salada tropical com alface, melão, abacaxi, tomate e cebola para contraste." }, price: "$7.00", order: 3 },
          { id: "catch-golden-french-fries", name: { en: "Golden French Fries", es: "Papas Fritas Doradas", pt: "Batatas Fritas Douradas" }, description: { en: clean("Potato sticks that are crispy on the outside and soft on the inside."), es: "Bastones de papa crujientes por fuera y suaves por dentro.", pt: "Palitos de batata crocantes por fora e macios por dentro." }, price: "$7.00", order: 4 },
        ],
      },
      {
        id: "catch-vegetarians",
        title: { en: "Vegetarians", es: "Vegetarianos", pt: "Vegetarianos" },
        order: 7,
        items: [
          { id: "catch-grilled-watermelon", name: { en: "Grilled Watermelon", es: "Sandía a la Plancha", pt: "Melancia Grelhada" }, description: { en: clean("Soy-cured watermelon grilled with a spice rub, crunchy cashew nuts, and citrusy miso."), es: "Sandía curada en soja a la plancha con especias, cashews crujientes y miso cítrico.", pt: "Melancia curada em soja grelhada com especiarias, castanhas de caju crocantes e missô cítrico." }, price: "$10.00", order: 1 },
          { id: "catch-mushroom-dumplings-soup", name: { en: "Mushroom Dumplings Soup", es: "Sopa de Dumplings de Champiñones", pt: "Sopa de Dumplings de Cogumelos" }, description: { en: clean("Soup dumpling filled with hearts of palm and portobello mushrooms, served in shiitake broth."), es: "Dumpling de sopa relleno de palmito y champiñones portobello, en caldo de shiitake.", pt: "Dumpling de sopa recheado com palmito e cogumelos portobello, servido em caldo de shiitake." }, price: "$13.00", order: 2 },
          { id: "catch-smoke-eggplant-ravioli", name: { en: "Smoke Eggplant Ravioli", es: "Ravioli de Berenjena Ahumada", pt: "Ravioli de Berinjela Defumada" }, description: { en: clean("Rice pasta filled with smoked eggplant and water chestnuts on a creamy caramelized base."), es: "Pasta de arroz rellena de berenjena ahumada y castañas de agua sobre una base cremosa caramelizada.", pt: "Massa de arroz recheada com berinjela defumada e castanhas d'água sobre uma base cremosa caramelizada." }, price: "$20.00", order: 3 },
          { id: "catch-truffle-mushrooms-fried-rice", name: { en: "Truffle Mushrooms Fried Rice", es: "Arroz Frito con Trufas y Champiñones", pt: "Arroz Frito com Trufas e Cogumelos" }, description: { en: clean("Fragrant fried rice infused with truffle, layered with portobello mushrooms."), es: "Arroz frito aromático infusionado con trufa, cubierto de champiñones portobello.", pt: "Arroz frito aromático infundido com trufa, coberto de cogumelos portobello." }, price: "$12.00", order: 4 },
        ],
      },
      {
        id: "catch-desserts",
        title: { en: "Desserts", es: "Postres", pt: "Sobremesas" },
        order: 8,
        items: [
          { id: "catch-panna-cotta", name: { en: "Panna Cotta", es: "Panna Cotta", pt: "Panna Cotta" }, description: { en: clean("Classic panna cotta with a silky texture and delicate flavor, accompanied by passion fruit."), es: "Panna cotta clásica de textura sedosa y sabor delicado, acompañada de maracuyá.", pt: "Panna cotta clássica de textura sedosa e sabor delicado, acompanhada de maracujá." }, price: "$7.00", order: 1 },
          { id: "catch-chocolate-cake", name: { en: "Chocolate Cake", es: "Torta de Chocolate", pt: "Bolo de Chocolate" }, description: { en: clean("Traditional German-style dessert made with fluffy chocolate sponge cake."), es: "Postre tradicional estilo alemán hecho con esponjoso bizcocho de chocolate.", pt: "Sobremesa tradicional estilo alemão feita com fofo bolo de esponja de chocolate." }, price: "$7.00", order: 2 },
          { id: "catch-strawberry-tart", name: { en: "Strawberry Tart", es: "Tarta de Fresa", pt: "Torta de Morango" }, description: { en: clean("A delicate cake with fluffy layers, smooth cream, and fresh strawberries."), es: "Un delicado pastel con capas esponjosas, crema suave y fresas frescas.", pt: "Um delicado bolo com camadas fofas, creme suave e morangos frescos." }, price: "$7.00", order: 3 },
          { id: "catch-tiramisu", name: { en: "Tiramisu", es: "Tiramisú", pt: "Tiramisu" }, description: { en: clean("Italian classic with soft sponge cake soaked in coffee."), es: "Clásico italiano con bizcocho suave empapado en café.", pt: "Clássico italiano com pão de ló suave embebido em café." }, price: "$7.00", order: 4 },
        ],
      },
      {
        id: "catch-kids",
        title: { en: "Kids", es: "Para Niños", pt: "Infantil" },
        order: 9,
        items: [
          { id: "catch-chicken-fingers", name: { en: "Chicken Fingers", es: "Tiras de Pollo", pt: "Tirinhas de Frango" }, description: { en: clean("Crispy golden chicken fingers served with classic French fries and tartar sauce."), es: "Tiras de pollo crujientes y doradas con papas fritas clásicas y salsa tártara.", pt: "Tirinhas de frango crocantes e douradas com batata frita clássica e molho tártaro." }, price: "$10.00", order: 1 },
          { id: "catch-fish-fingers", name: { en: "Fish Fingers", es: "Dedos de Pescado", pt: "Dedos de Peixe" }, description: { en: clean("Crispy golden fish fingers served with French fries and mild tartar sauce."), es: "Dedos de pescado crujientes y dorados con papas fritas y salsa tártara suave.", pt: "Dedos de peixe crocantes e dourados com batata frita e molho tártaro suave." }, price: "$10.00", order: 2 },
        ],
      },
    ],
  },

  {
    venueSlug: "catch",
    venueName: "CATCH",
    menuTitle: { en: "CATCH DRINKS", es: "BEBIDAS CATCH", pt: "BEBIDAS CATCH" },
    menuType: "drinks",
    order: 2,
    intro: {
      en: "A Caribbean and Bermudian-inspired bar with a vibrant cocktail menu that highlights artisanal rum, fresh tropical fruits, warm spices, and reinterpreted classic techniques.",
      es: "Un bar de inspiración caribeña y bermudiana con un vibrante menú de cócteles que destaca el ron artesanal, frutas tropicales frescas, especias cálidas y técnicas clásicas reinterpretadas.",
      pt: "Um bar de inspiração caribenha e bermudiana com um vibrante menu de coquetéis que destaca rum artesanal, frutas tropicais frescas, especiarias quentes e técnicas clássicas reinterpretadas.",
    },
    sections: [
      {
        id: "catch-waters",
        title: { en: "Waters", es: "Aguas", pt: "Águas" },
        order: 1,
        items: [
          { id: "catch-water-acqua-panna", name: "Acqua Panna", price: "$6.00", order: 1 },
          { id: "catch-water-st-peregrine", name: "St. Pellegrino", price: "$8.00", order: 2 },
        ],
      },
      {
        id: "catch-soft-drinks",
        title: { en: "Soft Drinks", es: "Bebidas Suaves", pt: "Refrigerantes" },
        order: 2,
        items: [
          { id: "catch-soft-coke", name: "Coke", price: "$3.50", order: 1 },
          { id: "catch-soft-coke-zero", name: "Coke Zero", price: "$3.50", order: 2 },
          { id: "catch-soft-ginger-ale", name: "Canada Dry Ginger Ale", price: "$3.50", order: 3 },
        ],
      },
      {
        id: "catch-beers",
        title: { en: "Beers", es: "Cervezas", pt: "Cervejas" },
        order: 3,
        items: [
          { id: "catch-beer-panama", name: "Panama Beer", price: "$4.50", order: 1 },
          { id: "catch-beer-balboa", name: "Balboa Beer", price: "$4.50", order: 2 },
          { id: "catch-beer-modelo", name: "Modelo", price: "$8.00", order: 3 },
          { id: "catch-beer-corona", name: "Corona", price: "$7.00", order: 4 },
          { id: "catch-beer-panama-light", name: "Panama Light", price: "$4.50", order: 5 },
          { id: "catch-beer-stella", name: "Stella Artois", price: "$7.00", order: 6 },
          { id: "catch-beer-heineken", name: "Heineken", price: "$7.00", order: 7 },
        ],
      },
      {
        id: "catch-signature-cocktails",
        title: { en: "Signature Cocktails", es: "Cócteles Exclusivos", pt: "Coquetéis Exclusivos" },
        order: 4,
        items: [
          { id: "catch-cocktail-dark-tormy", name: "Dark & Stormy", price: "$15.00", order: 1 },
          { id: "catch-cocktail-marea-alta", name: "Marea Alta", price: "$15.00", order: 2 },
          { id: "catch-cocktail-dragon-spritz", name: "Dragon Spritz", price: "$12.00", order: 3 },
          { id: "catch-cocktail-caribean-mule", name: "Caribbean Mule", price: "$12.00", order: 4 },
          { id: "catch-cocktail-agua-de-bermuda", name: "Agua de Bermuda", price: "$16.00", order: 5 },
          { id: "catch-cocktail-tommys-margarita-maracuya", name: "Tommy's Margarita Maracuyá", price: "$15.00", order: 6 },
          { id: "catch-cocktail-pina-colada", name: "Piña Colada", price: "$15.00", order: 7 },
          { id: "catch-cocktail-amapola", name: "Amapola", price: "$12.00", order: 8, tags: ["Non-Alcoholic"] },
        ],
      },
      {
        id: "catch-classic-cocktails",
        title: { en: "Classic Cocktails", es: "Cócteles Clásicos", pt: "Coquetéis Clássicos" },
        order: 5,
        items: [
          { id: "catch-classic-mojito", name: "Classic Mojito", price: "$12.00", order: 1 },
          { id: "catch-classic-passion-fruit-mojito", name: "Passion Fruit Mojito", price: "$12.00", order: 2 },
          { id: "catch-classic-margarita", name: "Margarita", price: "$11.00", order: 3 },
          { id: "catch-classic-cuba-libre", name: "Cuba Libre", price: "$8.00", order: 4 },
          { id: "catch-classic-negronni", name: "Negroni", price: "$15.00", order: 5 },
          { id: "catch-classic-old-fashion", name: "Old Fashioned", price: "$15.00", order: 6 },
          { id: "catch-classic-martini", name: "Martini", price: "$15.00", order: 7 },
          { id: "catch-classic-cosmopolitan", name: "Cosmopolitan", price: "$15.00", order: 8 },
        ],
      },
    ],
  },

  {
    venueSlug: "oku",
    venueName: "OKÜ",
    menuTitle: { en: "OKÜ MENU", es: "MENÚ OKÜ", pt: "MENU OKÜ" },
    menuType: "food",
    order: 3,
    intro: {
      en: "Our Asian fusion menu combines traditional techniques and contemporary flavors to offer creative, balanced dishes full of character, where the East meets culinary innovation.",
      es: "Nuestro menú de fusión asiática combina técnicas tradicionales y sabores contemporáneos para ofrecer platos creativos y equilibrados llenos de carácter, donde el Oriente se encuentra con la innovación culinaria.",
      pt: "Nosso menu de fusão asiática combina técnicas tradicionais e sabores contemporâneos para oferecer pratos criativos e equilibrados cheios de caráter, onde o Oriente encontra a inovação culinária.",
    },
    sections: [
      {
        id: "oku-starters",
        title: { en: "Starters", es: "Entradas", pt: "Entradas" },
        order: 1,
        items: [
          {
            id: "oku-lobster-bao",
            name: { en: "Lobster Bao", es: "Bao de Langosta", pt: "Bao de Lagosta" },
            description: {
              en: clean("Succulent garlic-butter sautéed morsels nestled in pillowy bao buns."),
              es: "Suculentos bocados salteados en mantequilla de ajo, anidados en esponjosos Bao.",
              pt: "Suculentos pedaços refogados na manteiga de alho, aninhados em fofinhos Bao.",
            },
            price: "$19.00", order: 1
          },
          {
            id: "oku-porkbelly",
            name: { en: "Pork Belly", es: "Panceta de Cerdo", pt: "Barriga de Porco" },
            description: {
              en: clean("Pork with crispy skin, slow cooked and marinated with Asian spices."),
              es: "Cerdo con piel crujiente, cocido lentamente y marinado con especias asiáticas.",
              pt: "Porco com pele crocante, cozido lentamente e marinado com especiarias asiáticas.",
            },
            price: "$16.00", order: 2
          },
          {
            id: "oku-steak-tartare",
            name: { en: "Steak Tartare", es: "Tartare de Res", pt: "Steak Tartare" },
            description: {
              en: clean("Hand-cut tenderloin tartare with soy-cured yolk, caper crisp, and shallot aromatics."),
              es: "Tartare de lomo cortado a mano con yema curada en soja, crujiente de alcaparra y aromáticos de chalota.",
              pt: "Tartare de filé mignon cortado à mão com gema curada em soja, crocante de alcaparra e aromáticos de chalota.",
            },
            price: "$20.00", order: 3
          },
        ],
      },
      {
        id: "oku-main-courses",
        title: { en: "Main Courses", es: "Platos Principales", pt: "Pratos Principais" },
        order: 2,
        items: [
          {
            id: "oku-bonless-prime-short-ribs",
            name: { en: "Prime Short Ribs", es: "Costillas Cortas Premium", pt: "Costela Premium" },
            description: {
              en: clean("Prime short ribs, gently brined and slow-braised, finished with a lustrous glaze."),
              es: "Costillas premium, ligeramente salmueras y estofadas a fuego lento, terminadas con un glaseado brillante.",
              pt: "Costela premium, levemente salgada e cozida lentamente, finalizada com um glacê lustroso.",
            },
            price: "$29.00", order: 1
          },
          {
            id: "oku-grilled-fish-fillet",
            name: { en: "Grilled Fish Fillet", es: "Filete de Pescado a la Plancha", pt: "Filé de Peixe Grelhado" },
            description: {
              en: clean("Grilled mahi mahi fillet, glazed with honey infused with lemongrass root and ginger."),
              es: "Filete de mahi mahi a la plancha, glaseado con miel infusionada con raíz de limoncillo y jengibre.",
              pt: "Filé de mahi mahi grelhado, glaceado com mel infundido com raiz de capim-limão e gengibre.",
            },
            price: "$24.00", order: 2
          },
          {
            id: "oku-farm-chicken",
            name: { en: "Farm Chicken", es: "Pollo de Granja", pt: "Frango Caipira" },
            description: {
              en: clean("Marinated tender chicken breast in garlic achiote oil, glazed with soya and smoke."),
              es: "Pechuga de pollo tierna marinada en aceite de achiote y ajo, glaseada con soya y ahumado.",
              pt: "Peito de frango macio marinado em óleo de urucum e alho, glaceado com shoyu e defumado.",
            },
            price: "$22.00", order: 3
          },
          {
            id: "oku-drunked-grill-octopus",
            name: { en: "Grilled Octopus", es: "Pulpo a la Plancha", pt: "Polvo Grelhado" },
            description: {
              en: clean("Tender octopus grilled to perfection, glazed with rum and panela reduction."),
              es: "Pulpo tierno a la plancha a la perfección, glaseado con reducción de ron y panela.",
              pt: "Polvo macio grelhado à perfeição, glaceado com redução de rum e rapadura.",
            },
            price: "$26.00", order: 4
          },
        ],
      },
      {
        id: "oku-starters-sushi",
        title: { en: "Starters — Sushi Bar", es: "Entradas — Barra de Sushi", pt: "Entradas — Balcão de Sushi" },
        order: 3,
        items: [
          {
            id: "oku-asian-salad",
            name: { en: "Asian Salad", es: "Ensalada Asiática", pt: "Salada Asiática" },
            description: {
              en: clean("Fresh Asian salad with wakame, vermicelli, tropical fruits, strawberries, and cucumber."),
              es: "Ensalada asiática fresca con wakame, vermicelli, frutas tropicales, fresas y pepino.",
              pt: "Salada asiática fresca com wakame, vermicelli, frutas tropicais, morangos e pepino.",
            },
            price: "$16.00", order: 1
          },
          {
            id: "oku-crispy-rice-with-steak",
            name: { en: "Crispy Rice with Steak", es: "Arroz Crujiente con Res", pt: "Arroz Crocante com Bife" },
            description: {
              en: clean("Beef fillet sushi roll, crispy rice, caramelized onions, and spicy finish."),
              es: "Roll de sushi de lomo de res, arroz crujiente, cebollas caramelizadas y toque picante.",
              pt: "Roll de sushi de filé de res, arroz crocante, cebolas caramelizadas e toque picante.",
            },
            price: "$16.00", order: 2
          },
        ],
      },
      {
        id: "oku-sashimi",
        title: "Sashimi",
        order: 4,
        items: [
          {
            id: "oku-sashimi-salmon",
            name: { en: "Salmon Sashimi", es: "Sashimi de Salmón", pt: "Sashimi de Salmão" },
            description: {
              en: clean("Delicate Japanese-style slices of fresh fish, served with bright citrus ponzu."),
              es: "Delicadas lonchas de pescado fresco estilo japonés, servidas con ponzu cítrico.",
              pt: "Delicadas fatias de peixe fresco estilo japonês, servidas com ponzu cítrico.",
            },
            price: "$14.00", order: 1
          },
          {
            id: "oku-tuna-sashimi",
            name: { en: "Tuna Sashimi", es: "Sashimi de Atún", pt: "Sashimi de Atum" },
            description: {
              en: clean("Premium tuna slices, precisely cut and silky in texture."),
              es: "Lonchas de atún premium, cortadas con precisión y de textura sedosa.",
              pt: "Fatias de atum premium, cortadas com precisão e de textura sedosa.",
            },
            price: "$14.00", order: 2
          },
        ],
      },
      {
        id: "oku-nigiris",
        title: "Nigiris",
        order: 5,
        items: [
          { id: "oku-shrimp-nigiri", name: { en: "Shrimp Nigiri", es: "Nigiri de Camarón", pt: "Nigiri de Camarão" }, price: "$9.00", order: 1 },
          { id: "oku-octopus-nigiri", name: { en: "Octopus Nigiri", es: "Nigiri de Pulpo", pt: "Nigiri de Polvo" }, price: "$11.00", order: 2 },
          { id: "oku-eel-nigiri", name: { en: "Eel Nigiri", es: "Nigiri de Anguila", pt: "Nigiri de Enguia" }, price: "$12.00", order: 3 },
          { id: "oku-salmon-nigiri", name: { en: "Salmon Nigiri", es: "Nigiri de Salmón", pt: "Nigiri de Salmão" }, price: "$9.00", order: 4 },
          { id: "oku-tuna-nigiri", name: { en: "Tuna Nigiri", es: "Nigiri de Atún", pt: "Nigiri de Atum" }, price: "$9.00", order: 5 },
        ],
      },
      {
        id: "oku-sushi-rolls",
        title: { en: "Sushi Rolls", es: "Rolls de Sushi", pt: "Rolls de Sushi" },
        order: 6,
        items: [
          { id: "oku-acevichado-roll", name: "Acevichado Roll", price: "$18.00", order: 1 },
          { id: "oku-spicy-tuna-roll", name: { en: "Spicy Tuna Roll", es: "Roll de Atún Picante", pt: "Roll de Atum Picante" }, price: "$18.00", order: 2 },
          { id: "oku-crunchi-roll", name: { en: "Crunchy Roll", es: "Roll Crujiente", pt: "Roll Crocante" }, price: "$18.00", order: 3 },
          { id: "oku-spicy-salmon-roll", name: { en: "Spicy Salmon Roll", es: "Roll de Salmón Picante", pt: "Roll de Salmão Picante" }, price: "$18.00", order: 4 },
          { id: "oku-vegan-roll", name: { en: "Vegan Roll", es: "Roll Vegano", pt: "Roll Vegano" }, price: "$18.00", order: 5, dietary: ["Vegan"] },
          { id: "oku-eel-roll", name: { en: "Eel Roll", es: "Roll de Anguila", pt: "Roll de Enguia" }, price: "$20.00", order: 6 },
        ],
      },
      {
        id: "oku-sides",
        title: { en: "Sides", es: "Acompañamientos", pt: "Acompanhamentos" },
        order: 7,
        items: [
          { id: "oku-coconut-rice", name: { en: "Coconut Rice", es: "Arroz con Coco", pt: "Arroz de Coco" }, price: "$7.00", order: 1 },
          { id: "oku-crispy-plantain-chips", name: { en: "Crispy Plantain Chips", es: "Chips de Plátano Crujientes", pt: "Chips de Banana da Terra Crocantes" }, price: "$7.00", order: 2 },
          { id: "oku-house-salad", name: { en: "House Salad", es: "Ensalada de la Casa", pt: "Salada da Casa" }, price: "$7.00", order: 3 },
          { id: "oku-golden-french-fries", name: { en: "Golden French Fries", es: "Papas Fritas Doradas", pt: "Batatas Fritas Douradas" }, price: "$7.00", order: 4 },
        ],
      },
      {
        id: "oku-vegetarians",
        title: { en: "Vegetarians", es: "Vegetarianos", pt: "Vegetarianos" },
        order: 8,
        items: [
          { id: "oku-grilled-watermelon", name: { en: "Grilled Watermelon", es: "Sandía a la Plancha", pt: "Melancia Grelhada" }, price: "$10.00", order: 1 },
          { id: "oku-mushroom-dumplings-soup", name: { en: "Mushroom Dumplings Soup", es: "Sopa de Dumplings de Champiñones", pt: "Sopa de Dumplings de Cogumelos" }, price: "$13.00", order: 2 },
          { id: "oku-smoke-eggplant-ravioli", name: { en: "Smoke Eggplant Ravioli", es: "Ravioli de Berenjena Ahumada", pt: "Ravioli de Berinjela Defumada" }, price: "$20.00", order: 3 },
          { id: "oku-truffle-mushrooms-fried-rice", name: { en: "Truffle Mushrooms Fried Rice", es: "Arroz Frito con Trufas y Champiñones", pt: "Arroz Frito com Trufas e Cogumelos" }, price: "$12.00", order: 4 },
        ],
      },
      {
        id: "oku-kids",
        title: { en: "Kids", es: "Para Niños", pt: "Infantil" },
        order: 9,
        items: [
          { id: "oku-chicken-fingers", name: { en: "Chicken Fingers", es: "Tiras de Pollo", pt: "Tirinhas de Frango" }, price: "$10.00", order: 1 },
          { id: "oku-fish-fingers", name: { en: "Fish Fingers", es: "Dedos de Pescado", pt: "Dedos de Peixe" }, price: "$10.00", order: 2 },
        ],
      },
    ],
  },

  {
    venueSlug: "oku",
    venueName: "OKÜ",
    menuTitle: { en: "OKÜ DRINKS", es: "BEBIDAS OKÜ", pt: "BEBIDAS OKÜ" },
    menuType: "drinks",
    order: 4,
    intro: {
      en: "Cocktail bar focused on a farm-to-table concept, where each drink is made with fresh, organic, and locally sourced ingredients.",
      es: "Bar de cócteles enfocado en el concepto de la huerta a la mesa, donde cada bebida se elabora con ingredientes frescos, orgánicos y de origen local.",
      pt: "Bar de coquetéis focado no conceito da horta para a mesa, onde cada drinque é feito com ingredientes frescos, orgânicos e de origem local.",
    },
    sections: [
      {
        id: "oku-waters",
        title: { en: "Waters", es: "Aguas", pt: "Águas" },
        order: 1,
        items: [
          { id: "oku-water-acqua-panna", name: "Acqua Panna", price: "$6.00", order: 1 },
          { id: "oku-water-st-peregrine", name: "St. Pellegrino", price: "$8.00", order: 2 },
        ],
      },
      {
        id: "oku-soft-drinks",
        title: { en: "Soft Drinks", es: "Bebidas Suaves", pt: "Refrigerantes" },
        order: 2,
        items: [
          { id: "oku-soft-coke", name: "Coke", price: "$3.50", order: 1 },
          { id: "oku-soft-coke-zero", name: "Coke Zero", price: "$3.50", order: 2 },
          { id: "oku-soft-ginger-ale", name: "Canada Dry Ginger Ale", price: "$3.50", order: 3 },
        ],
      },
      {
        id: "oku-beers",
        title: { en: "Beers", es: "Cervezas", pt: "Cervejas" },
        order: 3,
        items: [
          { id: "oku-beer-panama", name: "Panama Beer", price: "$4.50", order: 1 },
          { id: "oku-beer-balboa", name: "Balboa Beer", price: "$4.50", order: 2 },
          { id: "oku-beer-modelo", name: "Modelo", price: "$8.00", order: 3 },
          { id: "oku-beer-corona", name: "Corona", price: "$7.00", order: 4 },
          { id: "oku-beer-panama-light", name: "Panama Light", price: "$4.50", order: 5 },
          { id: "oku-beer-stella", name: "Stella Artois", price: "$7.00", order: 6 },
          { id: "oku-beer-heineken", name: "Heineken", price: "$7.00", order: 7 },
        ],
      },
      {
        id: "oku-signature-cocktails",
        title: { en: "Signature Cocktails", es: "Cócteles Exclusivos", pt: "Coquetéis Exclusivos" },
        order: 4,
        items: [
          { id: "oku-cocktail-agua-de-bermuda", name: "Agua de Bermuda", price: "$16.00", order: 1 },
          { id: "oku-cocktail-gold-lotus", name: "Gold Lotus", price: "$15.00", order: 2 },
          { id: "oku-cocktail-qipao", name: "Qipao", price: "$16.00", order: 3 },
          { id: "oku-cocktail-loto-del-pacifico", name: "Loto del Pacífico", price: "$12.00", order: 4 },
          { id: "oku-cocktail-kaizen", name: "Kaizen", price: "$15.00", order: 5 },
          { id: "oku-cocktail-violette", name: "Violette", price: "$12.00", order: 6 },
          { id: "oku-cocktail-lienzo", name: "Lienzo", price: "$15.00", order: 7 },
          { id: "oku-cocktail-la-noria", name: "La Noria", price: "$15.00", order: 8 },
          { id: "oku-cocktail-oku", name: "OKÜ", price: "$12.00", order: 9 },
          { id: "oku-cocktail-ny-sour-2", name: "NY Sour 2.0", price: "$13.00", order: 10 },
          { id: "oku-cocktail-expresso-martini", name: "Espresso Martini", price: "$18.00", order: 11 },
        ],
      },
      {
        id: "oku-classic-cocktails",
        title: { en: "Classic Cocktails", es: "Cócteles Clásicos", pt: "Coquetéis Clássicos" },
        order: 5,
        items: [
          { id: "oku-classic-mojito", name: "Classic Mojito", price: "$12.00", order: 1 },
          { id: "oku-classic-passion-fruit-mojito", name: "Passion Fruit Mojito", price: "$12.00", order: 2 },
          { id: "oku-classic-margarita", name: "Margarita", price: "$11.00", order: 3 },
          { id: "oku-classic-cuba-libre", name: "Cuba Libre", price: "$8.00", order: 4 },
          { id: "oku-classic-negronni", name: "Negroni", price: "$15.00", order: 5 },
          { id: "oku-classic-old-fashion", name: "Old Fashioned", price: "$15.00", order: 6 },
          { id: "oku-classic-martini", name: "Martini", price: "$15.00", order: 7 },
          { id: "oku-classic-cosmopolitan", name: "Cosmopolitan", price: "$15.00", order: 8 },
        ],
      },
    ],
  },
];

export const getMenusByVenue = (venueSlug: "oku" | "catch" | "terrace") =>
  venueMenus.filter((m) => m.venueSlug === venueSlug);

export const getFoodMenuByVenue = (venueSlug: "oku" | "catch" | "terrace") =>
  venueMenus.find((m) => m.venueSlug === venueSlug && m.menuType === "food");

export const getDrinksMenuByVenue = (venueSlug: "oku" | "catch" | "terrace") =>
  venueMenus.find((m) => m.venueSlug === venueSlug && m.menuType === "drinks");
