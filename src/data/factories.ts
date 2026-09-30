import { ChocolateFactory, CommerceProduct, ProductSpec } from '../types/chocolate';

export const FACTORIES: ChocolateFactory[] = [
  {
    id: 'para-ti',
    name: 'Chocolates Para Ti',
    slogan: 'El orgullo dulce de la Ciudad Blanca',
    foundationYear: 1989,
    founder: 'Gastón Solares Ávila',
    headquarters: 'Calle Arenales #7, Plaza 25 de Mayo, Sucre',
    description: 'Emblema moderno del chocolate boliviano reconocido internacionalmente. Destaca por fusionar el cacao silvestre amazónico con frutas exóticas del valle y licores tradicionales como el Singani San Pedro.',
    historicalContext: 'Nacida a finales del siglo XX como Solur S.R.L., revitalizó el orgullo chuquisaqueño combinando tecnología suiza con granos de cacao del Alto Beni y Baures.',
    islandColor: '#d63031',
    brandColor: '#b01919',
    accentColor: '#f1c40f',
    islandPosition: [0, 0.4, 1.2],
    historyMilestones: [
      {
        year: '1989',
        title: 'El Nacimiento de un Sueño',
        description: 'Gastón Solares emprende en Sucre con la convicción de rescatar la tradición colonial chocolatera, instalando una pequeña fábrica artesanal en la capital.',
        archivalTopic: 'Fundación & Primer Molino',
        quote: '“El chocolate en Sucre no es solo una golosina, es parte de nuestra alma y arquitectura.”',
        accent: '#e74c3c'
      },
      {
        year: '1995',
        title: 'Cacao Silvestre del Beni',
        description: 'Alianza pionera con recolectores indígenas del río Beni para cosechar cacao criollo silvestre, una joya botánica única en la Amazonía boliviana.',
        archivalTopic: 'Botánica Amazónica',
        accent: '#f39c12'
      },
      {
        year: '2004',
        title: 'Fusión de Sabores Chuquisaqueños',
        description: 'Creación de la línea de bombones rellenos con licor de Singani de altura, chirimoya de los valles y ají dulce chuquisaqueño, galardonados en ferias gastronómicas.',
        archivalTopic: 'Alquimia Culinaria',
        quote: '“Innovar respetando el terroir andino-amazónico.”',
        accent: '#e67e22'
      },
      {
        year: 'Actualidad',
        title: 'Embajadores del Chocolate',
        description: 'Presencia en tiendas boutique de toda Bolivia y exportaciones selectas a Europa y Norteamérica, manteniendo su tienda insignia frente a la plaza principal de Sucre.',
        archivalTopic: 'Proyección Mundial',
        accent: '#f1c40f'
      }
    ],
    products: [
      {
        id: 'parati-bolsa-fruta',
        name: 'Bolsa de Chocolates con Fruta',
        subtitle: 'Bombones frutales en bolsa artesanal',
        cacaoPercentage: 55,
        weight: '100-200 g',
        dimensions: '18.0 x 8.5 x 5.0 cm (altura variable por atado)',
        heightCm: 18,
        flavorProfile: ['Frutas confitadas del valle', 'Cacao con leche suave', 'Final fresco frutal'],
        origin: 'Sucre, Bolivia',
        description: 'Bolsa artesanal. La altura es variable dependiendo de dónde se realice el atado superior. Bombones rellenos de fruta seleccionada del valle chuquisaqueño con cacao amazónico. Precio según peso: Bs 34–42.',
        pairing: 'Té de frutos rojos o chicha dulce bien fría',
        colorHex: '#4a2410',
        wrapperPrimaryColor: '#b01919',
        wrapperAccentColor: '#f9d342',
        type: 'box'
      },
      {
        id: 'parati-caja-bombones',
        name: 'Caja de Bombones (Surtido)',
        subtitle: 'Surtido fino en estuche Para Ti',
        cacaoPercentage: 60,
        weight: '150-250 g',
        dimensions: '24.0 x 16.0 x 3.5 cm',
        heightCm: 3.5,
        flavorProfile: ['Ganache de cacao amazónico', 'Relleno de singani y fruta', 'Praliné crocante'],
        origin: 'Sucre, Bolivia',
        description: 'Estuches rectangulares anchos, diseñados para presentación plana de los bombones. Ref. caja 240 g. Precio según peso: Bs 80–162.',
        pairing: 'Café de altura o copa de singani',
        colorHex: '#3a1b0d',
        wrapperPrimaryColor: '#781212',
        wrapperAccentColor: '#f9d342',
        type: 'box'
      },
      {
        id: 'parati-tableta-coco',
        name: 'Tableta de Cacao (con agregados)',
        subtitle: 'Cacao amazónico con agregados',
        cacaoPercentage: 55,
        weight: '50-100 g',
        dimensions: '16.0 x 8.0 x 1.0 cm',
        heightCm: 16,
        flavorProfile: ['Cacao amazónico', 'Agregados (coco, maní u otros)', 'Final cremoso'],
        origin: 'Sucre, Bolivia',
        description: 'Barra plana estándar en caja de cartón o envoltura clásica. Ref. tableta 100 g. Precio según peso: Bs 15–35.',
        pairing: 'Café con leche o jugo de maracuyá bien frío',
        colorHex: '#3a2110',
        wrapperPrimaryColor: '#b01919',
        wrapperAccentColor: '#f9d342',
        type: 'bar'
      }
    ]
  },
  {
    id: 'chocolates-sucre',
    name: 'Chocolates Sucre',
    slogan: 'El sabor conventual de la Capital de los Cuatro Nombres',
    foundationYear: 1975,
    founder: 'Familia Montero & Tradición Clarisas',
    headquarters: 'Calle Bustillos #122, Casco Histórico, Sucre',
    description: 'Guardián de las fórmulas secretas de los conventos virreinales. Sucre fue durante el siglo XVIII y XIX el gran puerto seco del cacao que abastecía a las cortes y arzobispados de la Real Audiencia de Charcas.',
    historicalContext: 'Conserva el proceso de tostado a fuego suave en ollas de cobre batido, perfumando sus tabletas con canela de Ceilán, pimienta dulce y nueces de monte.',
    islandColor: '#2980b9',
    brandColor: '#1a365d',
    accentColor: '#38bdf8',
    islandPosition: [-3.8, 0.4, -1],
    historyMilestones: [
      {
        year: '1780',
        title: 'Herencia Colonial en Charcas',
        description: 'Los archivos del Convento de Santa Clara registran las recetas de chocolate batido con agua de azahar que se servían a prelados y oidores virreinales.',
        archivalTopic: 'Manuscritos Virreinales',
        quote: '“Tres onzas de cacao batidas hasta que la espuma sostenga una sortija de plata.”',
        accent: '#3498db'
      },
      {
        year: '1975',
        title: 'Rescate de Fórmulas Ancestrales',
        description: 'Se formaliza la chocolatería Sucre en el centro histórico, recuperando los moldes de madera de cedro tallados a mano para tabletas de mesa.',
        archivalTopic: 'Patrimonio Familiar',
        accent: '#2980b9'
      },
      {
        year: '2010',
        title: 'Innovación en Bombones de Salar',
        description: 'Incorporación de cristales puros de sal del Salar de Uyuni en tabletas de chocolate negro al 75%, logrando balance umami inigualable.',
        archivalTopic: 'Cristales de Uyuni',
        accent: '#60a5fa'
      }
    ],
    products: [
      {
        id: 'sucre-tableta',
        name: 'Tableta de Chocolate con Leche',
        subtitle: 'Barra clásica de chocolate con leche',
        cacaoPercentage: 55,
        weight: '100 g',
        dimensions: '15.5 x 7.5 x 1.2 cm',
        heightCm: 15.5,
        flavorProfile: ['Cacao con leche suave', 'Canela de Ceilán', 'Final limpio y aromático'],
        origin: 'Sucre, Bolivia',
        description: 'Barra clásica de chocolate con leche en estuche de cartón rectangular. Precio según peso: Bs 15–18.',
        pairing: 'Chocolate caliente con pan de batalla',
        colorHex: '#33190e',
        wrapperPrimaryColor: '#1a365d',
        wrapperAccentColor: '#e0f2fe',
        type: 'bar'
      }
    ]
  },
  {
    id: 'taboada',
    name: 'Chocolates Taboada',
    slogan: 'Pioneros del Chocolate Sucrense desde 1948',
    foundationYear: 1948,
    founder: 'Don Fernando Taboada',
    headquarters: 'Calle Calvo #410, Sucre',
    description: 'La primera industria formal del chocolate en la República de Bolivia. Su empaque amarillo tradicional y sus pastillas de submarino han acompañado los desayunos de cuatro generaciones de familias bolivianas.',
    historicalContext: 'Don Fernando Taboada importó la primera conchadora de granito desde Milán en 1948, marcando el hito de la modernización industrial sin perder el espíritu artesanal.',
    islandColor: '#e67e22',
    brandColor: '#b45309',
    accentColor: '#fbbf24',
    islandPosition: [3.8, 0.4, -1],
    historyMilestones: [
      {
        year: '1948',
        title: 'El Primer Motor Industrial',
        description: 'Llega en ferrocarril a Sucre la histórica refinadora italiana. Se enciende por primera vez la fábrica que definió el aroma de la calle Calvo.',
        archivalTopic: 'Pioneros de la Industria',
        quote: '“El aroma del chocolate caliente saliendo de la chimenea marcaba las seis de la tarde en la ciudad.”',
        accent: '#d97706'
      },
      {
        year: '1965',
        title: 'El Clásico Submarino Sucrense',
        description: 'Lanzamiento de las barras con ranuras profundas diseñadas para derretirse instantáneamente dentro de jarros de leche hirviendo.',
        archivalTopic: 'Tradición Popular',
        accent: '#f59e0b'
      },
      {
        year: '1990',
        title: 'Consolidación Familiar',
        description: 'La segunda generación de maestros chocolateros expande la fábrica y crea las icónicas cajas doradas de surtido fino.',
        archivalTopic: 'Generación Maestra',
        accent: '#fbbf24'
      }
    ],
    products: [
      {
        id: 'taboada-caja-bombones',
        name: 'Grageas de Almendra',
        subtitle: 'Almendras confitadas en chocolate Taboada',
        cacaoPercentage: 60,
        weight: '150 g',
        dimensions: '16.0 x 9.0 x 5.0 cm',
        // Empaque vertical con base ancha: se mantiene de pie (ver ProductSpec.heightCm).
        heightCm: 16,
        flavorProfile: ['Almendra tostada', 'Cobertura de chocolate con leche', 'Final crocante'],
        origin: 'Sucre, Bolivia',
        description: 'Empaque tipo bolsa/caja vertical con base ancha para mantenerse de pie. Grageas de almendra de Chocolates Taboada según la receta original de Don Fernando Taboada.',
        pairing: 'Café de altura o leche caliente',
        colorHex: '#2e1509',
        wrapperPrimaryColor: '#b45309',
        wrapperAccentColor: '#fef08a',
        type: 'box'
      }
    ]
  }
];

// --- Commerce catalog (PR3, mvp-completo): DB-first with static fallback. ---
// Prices/stock mirror supabase seed.
const FALLBACK_PRICE: Record<string, { priceBOB: number; stock: number; imageUrl?: string }> = {
  'parati-bolsa-fruta': { priceBOB: 38, stock: 20, imageUrl: '/images/parati-bolsa-fruta.png' }, 'parati-caja-bombones': { priceBOB: 120, stock: 20, imageUrl: '/images/parati-caja-bombones.png' },
  'parati-tableta-coco': { priceBOB: 25, stock: 20, imageUrl: '/images/parati-tableta-coco.png' },
  'sucre-tableta': { priceBOB: 16.50, stock: 20, imageUrl: '/images/sucre-tableta.png' },
  'taboada-caja-bombones': { priceBOB: 21, stock: 15, imageUrl: '/images/taboada-caja-bombones.png' },
};
export function toCommerce(p: ProductSpec): CommerceProduct {
  const f = FALLBACK_PRICE[p.id] ?? { priceBOB: 0, stock: 0 };
  return { ...p, sku: p.id, priceBOB: f.priceBOB, stock: f.stock, ...(f.imageUrl ? { imageUrl: f.imageUrl } : {}) };
}
export interface CatalogEntry { sku: string; nameEs: string; priceBOB: number; stock: number }
// Bound every catalog fetch: a hung /api/* must never stall the UI.
const CATALOG_TIMEOUT_MS = 4000;
export async function fetchCatalog(): Promise<{ entries: CatalogEntry[]; fromDb: boolean }> {
  const fallback = FACTORIES.flatMap((f) => f.products.map((p) => {
    const c = toCommerce(p);
    return { sku: c.sku, nameEs: p.name, priceBOB: c.priceBOB, stock: c.stock } as CatalogEntry;
  }));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CATALOG_TIMEOUT_MS);
  try {
    const res = await fetch('/api/products', { signal: controller.signal });
    if (!res.ok) throw new Error('db-down');
    const data = (await res.json()) as { products?: CatalogEntry[] };
    if (!Array.isArray(data.products)) throw new Error('bad-shape');
    return { entries: data.products, fromDb: true };
  } catch {
    console.error('No se pudo cargar el catálogo, usando datos locales');
    return { entries: fallback, fromDb: false };
  } finally {
    clearTimeout(timer);
  }
}
