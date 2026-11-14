import dotenv from 'dotenv';
dotenv.config({ path: new URL('../.env', import.meta.url).pathname });
import { connectDB, disconnectDB } from '../src/config/database.js';
import { Category } from '../src/modules/categories/category.model.js';
import { Product } from '../src/modules/products/product.model.js';
import { Collection } from '../src/modules/collections/collection.model.js';
import { Project } from '../src/modules/projects/project.model.js';
import { StorefrontSection } from '../src/modules/sections/section.model.js';
import { slugify } from '../src/utils/slugify.js';

async function seed() {
  console.log('🌱 Starting DripRack Estudio Niksen-inspired Content Seed...');
  await connectDB();

  // 1. Categories
  const categoriesData = [
    {
      name: 'Outerwear',
      slug: 'outerwear',
      description: 'Down puffers, wool topcoats, technical shells, and reversible thermal layers.',
      bannerImageUrl: 'https://images.unsplash.com/photo-1544022613-e87ca75a784a?auto=format&fit=crop&w=1600&q=85',
      bannerVideoUrl: 'https://estudioniksen.com/cdn/shop/videos/c/vp/8646ef9c189740bf93c0a2c8d9b42e80/8646ef9c189740bf93c0a2c8d9b42e80.HD-1080p-7.2Mbps-101245130.mp4?v=0',
      isActive: true
    },
    {
      name: 'Sweaters & Knitwear',
      slug: 'sweaters-knitwear',
      description: 'Heavyweight organic wool knits, brushed alpaca cardigans, and loopback fleece.',
      bannerImageUrl: 'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&w=1600&q=85',
      bannerVideoUrl: null,
      isActive: true
    },
    {
      name: 'Tops & Shirts',
      slug: 'tops-shirts',
      description: 'Boxy heavyweight cotton t-shirts, relaxed overshirts, and washed poplin button-downs.',
      bannerImageUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=1600&q=85',
      bannerVideoUrl: null,
      isActive: true
    },
    {
      name: 'Bottoms & Trousers',
      slug: 'bottoms-trousers',
      description: 'Wide-leg pleated trousers, Japanese raw selvedge denim, and relaxed cargo pants.',
      bannerImageUrl: 'https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=1600&q=85',
      bannerVideoUrl: null,
      isActive: true
    },
    {
      name: 'Accessories & Objects',
      slug: 'accessories-objects',
      description: 'Ribbed beanies, minimalist leather accessories, home ceramic objects, and fragrance.',
      bannerImageUrl: 'https://images.unsplash.com/photo-1576871337632-b9aef4c17ab9?auto=format&fit=crop&w=1600&q=85',
      bannerVideoUrl: null,
      isActive: true
    }
  ];

  const categoryMap = {};
  for (const cat of categoriesData) {
    const doc = await Category.findOneAndUpdate(
      { slug: cat.slug },
      { $set: cat },
      { upsert: true, new: true }
    );
    categoryMap[cat.slug] = doc._id;
    console.log(`  ✓ Category: ${doc.name} (${doc.slug})`);
  }

  // 2. High-Fashion Editorial Products (Estudio Niksen aesthetic)
  const productsData = [
    {
      sku: 'DRIP-PUFF-BRN-01',
      name: 'Reversible Heavy Down Puffer',
      slug: 'reversible-heavy-down-puffer-brown',
      subtitle: 'Brown Checkered / Matte Black',
      badge: 'BESTSELLER',
      category: categoryMap['outerwear'],
      priceCents: 43500, // $435.00
      compareAtPriceCents: 52000,
      description: 'Engineered for sub-zero urban climate, featuring Japanese high-density water-resistant nylon shell filled with 600g ethically sourced Korean down. Fully reversible from vintage brown checkered weave to pure architectural matte black.',
      images: [
        'https://images.unsplash.com/photo-1544022613-e87ca75a784a?auto=format&fit=crop&w=1200&q=85',
        'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=1200&q=85',
        'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=1200&q=85'
      ],
      secondaryHoverImage: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=1200&q=85',
      attributes: {
        size: 'SIZE 2',
        color: 'BROWN CHECKERED'
      },
      modelSpecs: [
        'Ray is 6ft 0" and wears SIZE 2',
        'Christina is 5ft 7" and wears SIZE 1 for an oversized drop-shoulder drape'
      ],
      measurementTable: {
        columns: ['Size', 'Chest Width', 'Body Length', 'Shoulder Width', 'Sleeve Length'],
        rows: [
          ['SIZE 1 (S-M)', '68 cm', '72 cm', '56 cm', '88 cm'],
          ['SIZE 2 (L-XL)', '73 cm', '76 cm', '60 cm', '92 cm']
        ]
      },
      details: {
        temperatureRating: 'VERY COLD (Down to -30°C)',
        insulation: '600g Korean 90/10 White Goose Down (800 Fill Power)',
        composition: '100% Japanese High-Density Nylon Shell / Japanese YKK Excella 2-Way Zipper',
        careInstructions: 'Specialist down clean only. Store uncompressed.',
        origin: 'Engineered in Montreal, Crafted in Seoul',
        features: [
          'Fully reversible two-tone construction',
          'Concealed storm placket with dual magnetic snaps',
          'Interior fleece-lined handwarmer pockets',
          'Cinchable hem bungee system'
        ]
      },
      status: 'published',
      stock: { physical: 45, reserved: 0, available: 45 },
      lowStockThreshold: 5
    },
    {
      sku: 'DRIP-KNIT-ALP-01',
      name: 'Brushed Alpaca Oversized Cardigan',
      slug: 'brushed-alpaca-oversized-cardigan-slate',
      subtitle: 'Slate Gray Mélange',
      badge: 'NEW_ARRIVAL',
      category: categoryMap['sweaters-knitwear'],
      priceCents: 26500, // $265.00
      compareAtPriceCents: null,
      description: 'Spun from plush Peruvian baby alpaca and wool blend with a hand-brushed finish for soft cloud-like tactile depth. Features a dropped shoulder boxy cut and custom natural horn buttons.',
      images: [
        'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&w=1200&q=85',
        'https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=1200&q=85'
      ],
      secondaryHoverImage: 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=1200&q=85',
      attributes: {
        size: 'SIZE 1',
        color: 'SLATE GRAY'
      },
      modelSpecs: [
        'Uma is 5ft 5" and wears SIZE 1',
        'Ray is 6ft 0" and wears SIZE 2'
      ],
      measurementTable: {
        columns: ['Size', 'Chest Width', 'Body Length', 'Sleeve Length'],
        rows: [
          ['SIZE 1', '64 cm', '68 cm', '85 cm'],
          ['SIZE 2', '69 cm', '73 cm', '90 cm']
        ]
      },
      details: {
        temperatureRating: 'MILD TO COLD (Layering essential)',
        insulation: 'Thermal air-trapping hand-brushed fiber',
        composition: '65% Peruvian Baby Alpaca, 25% Fine Merino Wool, 10% Polyamide',
        careInstructions: 'Hand wash cold with wool detergent. Dry flat in shade.',
        origin: 'Knit in Lima, Peru',
        features: [
          'Natural sustainably harvested buffalo horn buttons',
          'Ribbed cuffs and hem line',
          'Seamless fully-fashioned armhole linking'
        ]
      },
      status: 'published',
      stock: { physical: 30, reserved: 0, available: 30 },
      lowStockThreshold: 5
    },
    {
      sku: 'DRIP-PANT-SEL-01',
      name: 'Wide-Leg 14oz Japanese Raw Selvedge Denim',
      slug: 'wide-leg-14oz-japanese-raw-selvedge-denim',
      subtitle: 'Rigid Indigo / Pink Selvedge ID',
      badge: 'JUST_RESTOCKED',
      category: categoryMap['bottoms-trousers'],
      priceCents: 28500, // $285.00
      compareAtPriceCents: 32000,
      description: 'Loomed on vintage Toyoda shuttle looms in Kojima, Okayama. Cut in an architectural wide-leg straight silhouette with subtle front single pleats, raw chainstitched hem, and unwashed rigid character.',
      images: [
        'https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=1200&q=85',
        'https://images.unsplash.com/photo-1582552938357-32b906df40cb?auto=format&fit=crop&w=1200&q=85'
      ],
      secondaryHoverImage: 'https://images.unsplash.com/photo-1582552938357-32b906df40cb?auto=format&fit=crop&w=1200&q=85',
      attributes: {
        size: '32',
        color: 'RAW INDIGO'
      },
      modelSpecs: [
        'Ray is 6ft 0" with a 31" waist and wears size 32 with clean single break cuff'
      ],
      measurementTable: {
        columns: ['Size', 'Waist', 'Inseam', 'Front Rise', 'Leg Opening'],
        rows: [
          ['30', '78 cm', '81 cm', '33 cm', '25 cm'],
          ['32', '83 cm', '82 cm', '34 cm', '26 cm'],
          ['34', '88 cm', '83 cm', '35 cm', '27 cm']
        ]
      },
      details: {
        temperatureRating: 'ALL SEASON HEAVYWEIGHT',
        composition: '100% Zimbabwe Long-Staple Cotton, 14.5oz Selvedge',
        careInstructions: 'Wear raw for 6+ months before first cold soak. Air dry only.',
        origin: 'Loomed in Okayama, Hand-tailored in Seoul',
        features: [
          'Signature custom pink selvedge ticker',
          'Hidden back pocket copper rivets',
          'Custom debossed vegetable-tanned leather patch'
        ]
      },
      status: 'published',
      stock: { physical: 40, reserved: 0, available: 40 },
      lowStockThreshold: 5
    },
    {
      sku: 'DRIP-TEE-BOX-01',
      name: 'Heavyweight Boxy Mineral Wash Tee',
      slug: 'heavyweight-boxy-mineral-wash-tee-charcoal',
      subtitle: 'Vintage Washed Charcoal',
      badge: 'BESTSELLER',
      category: categoryMap['tops-shirts'],
      priceCents: 9500, // $95.00
      compareAtPriceCents: null,
      description: 'Crafted from 320 GSM combed organic cotton with hand-processed mineral acid wash. Features a substantial 3cm mock-neck ribbing and an intentional wide boxy drape.',
      images: [
        'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=1200&q=85',
        'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=1200&q=85'
      ],
      secondaryHoverImage: 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=1200&q=85',
      attributes: {
        size: 'L',
        color: 'VINTAGE CHARCOAL'
      },
      modelSpecs: [
        'Ray is 6ft 0" and wears SIZE L',
        'Uma is 5ft 5" and wears SIZE S'
      ],
      measurementTable: {
        columns: ['Size', 'Chest Width', 'Length', 'Shoulder'],
        rows: [
          ['S', '58 cm', '68 cm', '52 cm'],
          ['M', '61 cm', '71 cm', '55 cm'],
          ['L', '64 cm', '74 cm', '58 cm'],
          ['XL', '67 cm', '77 cm', '61 cm']
        ]
      },
      details: {
        temperatureRating: 'WARM TO TRANSEASONAL',
        composition: '100% GOTS-Certified Heavyweight Organic Cotton (320 GSM)',
        careInstructions: 'Cold machine wash inside out. Hang dry to preserve wash depth.',
        origin: 'Crafted in Seoul, South Korea',
        features: [
          'Pre-shrunk heavyweight jersey',
          '3cm tight-weave ribbed collar',
          'Blind-stitched sleeves and hem'
        ]
      },
      status: 'published',
      stock: { physical: 65, reserved: 0, available: 65 },
      lowStockThreshold: 5
    },
    {
      sku: 'DRIP-HOOD-500-01',
      name: 'Double-Layered 520 GSM Boxy Hoodie',
      slug: 'double-layered-520-gsm-boxy-hoodie-washed-black',
      subtitle: 'Washed Black Mineral',
      badge: 'BESTSELLER',
      category: categoryMap['sweaters-knitwear'],
      priceCents: 18500, // $185.00
      compareAtPriceCents: 22000,
      description: 'Ultra-dense 520 GSM French terry hoodie engineered with a double-layered structured hood without drawstrings. Drop shoulder seams, deep kangaroo pocket, and minimal architectural silhouette.',
      images: [
        'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=1200&q=85',
        'https://images.unsplash.com/photo-1509967419530-da38b4704bc6?auto=format&fit=crop&w=1200&q=85'
      ],
      secondaryHoverImage: 'https://images.unsplash.com/photo-1509967419530-da38b4704bc6?auto=format&fit=crop&w=1200&q=85',
      attributes: {
        size: 'SIZE 2',
        color: 'WASHED BLACK'
      },
      modelSpecs: [
        'Ray is 6ft 0" and wears SIZE 2',
        'Christina is 5ft 7" and wears SIZE 1'
      ],
      measurementTable: {
        columns: ['Size', 'Chest Width', 'Length', 'Sleeve Length'],
        rows: [
          ['SIZE 1 (S-M)', '66 cm', '68 cm', '88 cm'],
          ['SIZE 2 (L-XL)', '71 cm', '72 cm', '92 cm']
        ]
      },
      details: {
        temperatureRating: 'COLD WEATHER HEAVYWEIGHT',
        composition: '100% Organic Loopback Cotton French Terry (520 GSM)',
        careInstructions: 'Machine wash cold on gentle cycle. Lay flat to dry.',
        origin: 'Custom knit and sewn in Seoul',
        features: [
          'Double-layer heavy hood that stands upright',
          'No drawstrings for clean minimalist aesthetic',
          'Heavyweight 2x2 ribbed side expansion gussets'
        ]
      },
      status: 'published',
      stock: { physical: 50, reserved: 0, available: 50 },
      lowStockThreshold: 5
    },
    {
      sku: 'DRIP-ACC-BEAN-01',
      name: 'Architectural Ribbed Cashmere Beanie',
      slug: 'architectural-ribbed-cashmere-beanie-charcoal',
      subtitle: 'Charcoal Black',
      badge: null,
      category: categoryMap['accessories-objects'],
      priceCents: 7500, // $75.00
      compareAtPriceCents: null,
      description: 'Knit from 4-ply Mongolian cashmere in a dense 1x1 fisherman rib with clean fold-over cuff. Featherweight yet deeply insulating.',
      images: [
        'https://images.unsplash.com/photo-1576871337632-b9aef4c17ab9?auto=format&fit=crop&w=1200&q=85',
        'https://images.unsplash.com/photo-1608256246200-53e635b5b65f?auto=format&fit=crop&w=1200&q=85'
      ],
      secondaryHoverImage: 'https://images.unsplash.com/photo-1608256246200-53e635b5b65f?auto=format&fit=crop&w=1200&q=85',
      attributes: {
        size: 'ONE SIZE',
        color: 'CHARCOAL'
      },
      modelSpecs: [
        'Unisex One Size fits all'
      ],
      measurementTable: {
        columns: ['Dimension', 'Measurement'],
        rows: [
          ['Width (Folded)', '22 cm'],
          ['Height (Cuffed)', '20 cm']
        ]
      },
      details: {
        temperatureRating: 'COLD WEATHER INSULATOR',
        composition: '100% Grade-A Mongolian Cashmere',
        careInstructions: 'Dry clean or cold hand wash with cashmere shampoo.',
        origin: 'Knit in Ulaanbaatar, Mongolia',
        features: [
          'Ultra-dense 4-ply cashmere yarn',
          'Fold-over cuff with seamless crown shaping'
        ]
      },
      status: 'published',
      stock: { physical: 70, reserved: 0, available: 70 },
      lowStockThreshold: 5
    }
  ];

  const productMap = {};
  for (const prod of productsData) {
    const doc = await Product.findOneAndUpdate(
      { sku: prod.sku },
      { $set: prod },
      { upsert: true, new: true }
    );
    productMap[prod.sku] = doc._id;
    console.log(`  ✓ Product: ${doc.name} [${doc.sku}]`);
  }

  // 3. Connect Outfitting ("Styled With" cross-sells)
  // Puffer is styled with Knit Cardigan, Selvedge Denim, and Beanie
  await Product.findByIdAndUpdate(productMap['DRIP-PUFF-BRN-01'], {
    $set: {
      styledWith: [productMap['DRIP-KNIT-ALP-01'], productMap['DRIP-PANT-SEL-01'], productMap['DRIP-ACC-BEAN-01']],
      relatedProducts: [productMap['DRIP-HOOD-500-01'], productMap['DRIP-TEE-BOX-01']]
    }
  });

  // Cardigan is styled with Boxy Tee and Selvedge Denim
  await Product.findByIdAndUpdate(productMap['DRIP-KNIT-ALP-01'], {
    $set: {
      styledWith: [productMap['DRIP-TEE-BOX-01'], productMap['DRIP-PANT-SEL-01']],
      relatedProducts: [productMap['DRIP-HOOD-500-01'], productMap['DRIP-PUFF-BRN-01']]
    }
  });

  // Hoodie is styled with Selvedge Denim and Beanie
  await Product.findByIdAndUpdate(productMap['DRIP-HOOD-500-01'], {
    $set: {
      styledWith: [productMap['DRIP-PANT-SEL-01'], productMap['DRIP-ACC-BEAN-01']],
      relatedProducts: [productMap['DRIP-PUFF-BRN-01'], productMap['DRIP-TEE-BOX-01']]
    }
  });

  console.log('  ✓ Cross-sell "Styled With" outfit links populated.');

  // 4. Collections (Curated Drops & Capsules)
  const allProductIds = Object.values(productMap);

  const collectionsData = [
    {
      title: "Fall Winter '26 - Drop 2",
      slug: 'fw26-drop-2',
      type: 'DROP',
      heroHeading: "Fall Winter '26",
      heroSubheading: 'Drop 2 is now available worldwide.',
      bannerImageUrl: 'https://images.unsplash.com/photo-1544022613-e87ca75a784a?auto=format&fit=crop&w=1600&q=85',
      description: 'Engineered for cold northern climates. Reversible technical puffers, heavy loopback fleeces, and brushed alpaca outerwear designed with architectural precision.',
      season: 'FW26',
      isFeaturedOnHome: true,
      sortOrder: 1,
      products: allProductIds
    },
    {
      title: 'Niksen Walking Collection',
      slug: 'walking-collection',
      type: 'CURATION',
      heroHeading: 'The Walking Collection',
      heroSubheading: 'Garments cut for unhurried movement through the city.',
      bannerImageUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=1600&q=85',
      description: 'Wide trousers, relaxed French terry cottons, and wind-resistant outer layers for solitary strolls.',
      season: 'CORE',
      isFeaturedOnHome: true,
      sortOrder: 2,
      products: [productMap['DRIP-PANT-SEL-01'], productMap['DRIP-TEE-BOX-01'], productMap['DRIP-HOOD-500-01']]
    },
    {
      title: 'Okayama Raw Selvedge Capsule',
      slug: 'raw-selvedge-capsule',
      type: 'CURATION',
      heroHeading: 'Raw Selvedge Denim',
      heroSubheading: 'Shuttle-loomed in Kojima. Unwashed rigid character.',
      bannerImageUrl: 'https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=1600&q=85',
      description: 'Loomed on heritage Toyoda G9 shuttle looms in Okayama Prefecture from 100% Zimbabwe long-staple cotton.',
      season: 'CORE',
      isFeaturedOnHome: false,
      sortOrder: 3,
      products: [productMap['DRIP-PANT-SEL-01']]
    }
  ];

  for (const col of collectionsData) {
    const doc = await Collection.findOneAndUpdate(
      { slug: col.slug },
      { $set: col },
      { upsert: true, new: true }
    );
    console.log(`  ✓ Collection: ${doc.title} (${doc.slug})`);
  }

  // 5. Editorial Projects & Lookbooks
  const projectsData = [
    {
      title: "Fall Winter '26 Lookbook: Northern Stasis",
      slug: 'fw26-northern-stasis',
      season: 'FW26',
      year: 2026,
      statement: 'Photographed across the brutalist architectural landscapes of Old Montreal and the industrial waterfront. An exploration of stillness, heavy draping, and monochrome living against harsh winter skies.',
      heroMediaUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1600&q=85',
      gallery: [
        {
          url: 'https://images.unsplash.com/photo-1544022613-e87ca75a784a?auto=format&fit=crop&w=1200&q=85',
          layout: 'FULL_BLEED',
          caption: 'Ray wearing Reversible Heavy Puffer in Brown Checkered (SIZE 2)'
        },
        {
          url: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=1000&q=85',
          layout: 'TWO_UP_LEFT',
          caption: 'Tactile contrast: brushed baby alpaca against raw selvedge denim'
        },
        {
          url: 'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&w=1000&q=85',
          layout: 'TWO_UP_RIGHT',
          caption: 'Uma wearing Brushed Alpaca Cardigan (SIZE 1)'
        },
        {
          url: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=1400&q=85',
          layout: 'FULL_BLEED',
          caption: 'Double-Layered 520 GSM French Terry Hoodie in Washed Black'
        }
      ],
      taggedProducts: allProductIds,
      isPublished: true,
      publishedAt: new Date(),
      sortOrder: 1
    },
    {
      title: 'The Art of Doing Nothing',
      slug: 'the-art-of-doing-nothing',
      season: 'PERMANENT',
      year: 2026,
      statement: 'Niksen (Dutch): The deliberate practice of doing nothing without purpose or guilt. Garments designed to encourage unhurried living and quiet observation in spaces of calm.',
      heroMediaUrl: 'https://images.unsplash.com/photo-1509967419530-da38b4704bc6?auto=format&fit=crop&w=1600&q=85',
      gallery: [
        {
          url: 'https://images.unsplash.com/photo-1509967419530-da38b4704bc6?auto=format&fit=crop&w=1200&q=85',
          layout: 'FULL_BLEED',
          caption: 'Morning light in the Montreal atelier'
        },
        {
          url: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=1000&q=85',
          layout: 'TWO_UP_LEFT',
          caption: 'Heavyweight organic cotton mock-neck silhouette'
        },
        {
          url: 'https://images.unsplash.com/photo-1576871337632-b9aef4c17ab9?auto=format&fit=crop&w=1000&q=85',
          layout: 'TWO_UP_RIGHT',
          caption: 'Fisherman rib cashmere beanie'
        }
      ],
      taggedProducts: [productMap['DRIP-TEE-BOX-01'], productMap['DRIP-ACC-BEAN-01'], productMap['DRIP-HOOD-500-01']],
      isPublished: true,
      publishedAt: new Date(Date.now() - 7 * 86400000),
      sortOrder: 2
    }
  ];

  for (const proj of projectsData) {
    const doc = await Project.findOneAndUpdate(
      { slug: proj.slug },
      { $set: proj },
      { upsert: true, new: true }
    );
    console.log(`  ✓ Project / Lookbook: ${doc.title} (${doc.slug})`);
  }

  // 6. Storefront Sections CMS
  const sectionsData = [
    {
      sectionKey: 'home_hero_video',
      sectionName: 'Hero Ambient Video Loop',
      sectionType: 'HERO_VIDEO',
      page: 'home',
      sortOrder: 1,
      placementNotice: 'Top of Storefront (Above Fold, full bleed ambient video banner with logo & navigation overlay)',
      media: {
        videoUrl: 'https://estudioniksen.com/cdn/shop/videos/c/vp/8646ef9c189740bf93c0a2c8d9b42e80/8646ef9c189740bf93c0a2c8d9b42e80.HD-1080p-7.2Mbps-101245130.mp4?v=0',
        posterUrl: 'https://estudioniksen.com/cdn/shop/files/preview_images/8646ef9c189740bf93c0a2c8d9b42e80.thumbnail.0000000000_small.jpg?v=1794590101'
      },
      content: {
        heading: 'FALL / WINTER 2026',
        subheading: 'Architectural drapery and raw Japanese denim engineered between Montreal and Seoul.'
      },
      cta: {
        text: 'EXPLORE COLLECTION',
        link: '/shop',
        style: 'white'
      },
      isActive: true
    },
    {
      sectionKey: 'home_new_arrivals',
      sectionName: 'New Arrivals 8-Column Grid',
      sectionType: 'PRODUCT_FEED',
      page: 'home',
      sortOrder: 2,
      placementNotice: 'Directly below Hero Video (Horizontal 8-item catalog grid with secondary hover images and quick-add)',
      content: {
        heading: 'NEW ARRIVALS',
        caption: 'Latest drops from Montreal & Seoul'
      },
      curation: {
        products: allProductIds
      },
      isActive: true
    },
    {
      sectionKey: 'home_shop_look_uma',
      sectionName: 'Shop the Look 1 - Uma',
      sectionType: 'SHOP_THE_LOOK',
      page: 'home',
      sortOrder: 3,
      placementNotice: 'Middle Section (50/50 split: 2x2 product outfit grid on left, tall portrait on right)',
      media: {
        imageUrl: 'https://images.unsplash.com/photo-1544022613-e87ca75a784a?auto=format&fit=crop&w=1200&q=85'
      },
      content: {
        heading: 'SHOP THE LOOK',
        subheading: 'Worn by Uma in Montreal',
        badge: 'LOOK 01'
      },
      curation: {
        category: categoryMap['outerwear'],
        products: [productMap['DRIP-PUFF-BRN-01'], productMap['DRIP-KNIT-ALP-01'], productMap['DRIP-PANT-SEL-01'], productMap['DRIP-ACC-BEAN-01']],
        modelSpecs: "Uma is 5'5\" wearing Size 1"
      },
      isActive: true
    },
    {
      sectionKey: 'home_projects_video',
      sectionName: 'Projects Ambient Video Banner',
      sectionType: 'VIDEO_BANNER',
      page: 'home',
      sortOrder: 4,
      placementNotice: 'Mid-Page Visual Break (Ambient looping video banner linked to Projects / Lookbook)',
      media: {
        videoUrl: 'https://estudioniksen.com/cdn/shop/videos/c/vp/b2d6fe38e4dc417da783732b53b81bc9/b2d6fe38e4dc417da783732b53b81bc9.HD-720p-4.5Mbps-98935417.mp4?v=0',
        posterUrl: 'https://estudioniksen.com/cdn/shop/files/preview_images/b2d6fe38e4dc417da783732b53b81bc9.thumbnail.0000000000_small.jpg?v=1793027093'
      },
      content: {
        heading: 'PROJECTS & EDITORIAL',
        subheading: 'Visual diaries and architectural studies'
      },
      cta: {
        text: 'VIEW LOOKBOOK',
        link: '/projects',
        style: 'white'
      },
      isActive: true
    },
    {
      sectionKey: 'home_back_in_stock',
      sectionName: 'Back in Stock Carousel',
      sectionType: 'CAROUSEL',
      page: 'home',
      sortOrder: 5,
      placementNotice: 'Mid-Lower Track (Horizontal scroll carousel of restocked essentials)',
      content: {
        heading: 'BACK IN STOCK',
        caption: 'Limited quantities restocked from Kojima and Lima'
      },
      curation: {
        products: [productMap['DRIP-PANT-SEL-01'], productMap['DRIP-HOOD-500-01'], productMap['DRIP-TEE-BOX-01']]
      },
      isActive: true
    },
    {
      sectionKey: 'home_shop_look_leana',
      sectionName: 'Shop the Look 2 - Léana',
      sectionType: 'SHOP_THE_LOOK',
      page: 'home',
      sortOrder: 6,
      placementNotice: 'Lower Section (Inverted 50/50 split: tall editorial portrait on left, 2x2 product outfit grid on right)',
      media: {
        imageUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85'
      },
      content: {
        heading: 'SHOP THE LOOK',
        subheading: 'Worn by Léana in Seoul',
        badge: 'LOOK 02'
      },
      curation: {
        category: categoryMap['sweaters-knitwear'],
        products: [productMap['DRIP-KNIT-ALP-01'], productMap['DRIP-TEE-BOX-01'], productMap['DRIP-PANT-SEL-01']],
        modelSpecs: "Léana is 5'7\" wearing Size 1"
      },
      isActive: true
    },
    {
      sectionKey: 'home_category_grid_3col',
      sectionName: 'Category Showcase (3-Column)',
      sectionType: 'CATEGORY_GRID',
      page: 'home',
      sortOrder: 7,
      placementNotice: 'Bottom Feature (3-column visual cards for Outerwear, Knitwear, and Trousers)',
      content: {
        heading: 'DISCOVER BY CATEGORY'
      },
      isActive: true
    },
    {
      sectionKey: 'home_selvedge_denim',
      sectionName: 'Japanese Selvedge Craft Banner',
      sectionType: 'IMAGE_BANNER',
      page: 'home',
      sortOrder: 8,
      placementNotice: 'Pre-Footer Feature Banner (Okayama vintage shuttle loomed craftsmanship showcase)',
      media: {
        imageUrl: 'https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=1600&q=85'
      },
      content: {
        heading: '14OZ RAW JAPANESE SELVEDGE',
        subheading: 'Woven in Kojima on vintage Toyoda shuttle looms with signature pink selvedge ticker.'
      },
      cta: {
        text: 'DISCOVER DENIM',
        link: '/category/bottoms-trousers',
        style: 'white'
      },
      isActive: true
    },
    {
      sectionKey: 'home_sounds_video',
      sectionName: 'Sounds Ambient Video Banner',
      sectionType: 'VIDEO_BANNER',
      page: 'home',
      sortOrder: 9,
      placementNotice: 'Atmospheric Video Break (Full-width atelier soundtrack video with Spotify link)',
      media: {
        videoUrl: 'https://estudioniksen.com/cdn/shop/videos/c/vp/6fb1bc7d8cac42769e7ec5852b4028f7/6fb1bc7d8cac42769e7ec5852b4028f7.HD-1080p-7.2Mbps-87401521.mp4?v=0'
      },
      content: {
        heading: 'ESTÚDIO NIKSEN SOUNDS',
        subheading: 'Curated ambient and jazz selections from the Montreal studio'
      },
      cta: {
        text: 'LISTEN ON SPOTIFY',
        link: 'https://open.spotify.com',
        style: 'white'
      },
      isActive: true
    },
    {
      sectionKey: 'home_newsletter',
      sectionName: 'Newsletter & Atelier Footprint',
      sectionType: 'NEWSLETTER',
      page: 'home',
      sortOrder: 10,
      placementNotice: 'Above Footer (Minimalist email capture with walking character illustration)',
      content: {
        heading: 'JOIN THE NIKSEN COMMUNITY',
        subheading: 'Receive private access to drops, editorial lookbooks, and studio playlists.'
      },
      isActive: true
    }
  ];

  for (const sec of sectionsData) {
    const doc = await StorefrontSection.findOneAndUpdate(
      { sectionKey: sec.sectionKey },
      { $set: sec },
      { upsert: true, new: true }
    );
    console.log(`  ✓ Storefront Section: [${doc.sortOrder}] ${doc.sectionName} (${doc.sectionKey})`);
  }

  console.log('\n✨ DripRack Estudio Niksen content seeded successfully!');
  await disconnectDB();
  process.exit(0);
}

seed().catch(async (err) => {
  console.error('❌ Seeding failed:', err);
  await disconnectDB();
  process.exit(1);
});
