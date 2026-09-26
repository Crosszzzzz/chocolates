import { ChocolateFactory } from '../types/chocolate';

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
    islandPosition: [-6.8, 0.4, -1],
    facade: '/factories/para-ti/facade.jpg',
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
        id: 'parati-70-silvestre',
        name: 'Barra 70% Cacao Silvestre Amazónico',
        subtitle: 'Cosecha salvaje del Alto Beni',
        cacaoPercentage: 70,
        weight: '100 g',
        dimensions: '16.5 x 7.8 x 0.9 cm',
        flavorProfile: ['Notas florales de jazmín', 'Toques de frutos rojos silvestres', 'Final amaderado noble'],
        origin: 'Baures y Alto Beni, Bolivia',
        description: 'Barra de origen puro elaborada exclusivamente con almendras de cacao silvestre no domesticado. Fermentado en cajas de laurel y conchado lento por 72 horas.',
        pairing: 'Café de altura de Caranavi o vino tinto Tannat chuquisaqueño',
        colorHex: '#2b1408',
        wrapperPrimaryColor: '#b01919',
        wrapperAccentColor: '#e5b85a',
        badge: 'Cacao Salvaje de Origen',
        type: 'bar'
      },
      {
        id: 'parati-singani-gran-reserva',
        name: 'Tableta Gourmet con Singani Gran Reserva',
        subtitle: 'Cacao al 60% macerado con uva Moscatel',
        cacaoPercentage: 60,
        weight: '90 g',
        dimensions: '15.8 x 7.5 x 0.8 cm',
        flavorProfile: ['Aroma a uva Moscatel de Alejandría', 'Cacao tostado medio', 'Licor aterciopelado'],
        origin: 'Valles de Cinti & Alto Beni',
        description: 'La alianza cumbre entre el destilado nacional boliviano (Singani) y el cacao selecto. Una textura que se funde en boca liberando destellos cálidos y aromáticos.',
        pairing: 'Copita de Singani San Pedro de Yotala',
        colorHex: '#381c0f',
        wrapperPrimaryColor: '#781212',
        wrapperAccentColor: '#f9d342',
        badge: 'Edición Bicentenario',
        type: 'bar'
      },
      {
        id: 'parati-chirimoya-blanco',
        name: 'Barra Cacao Blanco & Chirimoya Real',
        subtitle: 'Manteca pura de cacao con pulpa de valle',
        cacaoPercentage: 38,
        weight: '85 g',
        dimensions: '15.0 x 7.2 x 0.8 cm',
        flavorProfile: ['Cremosa manteca pura', 'Chirimoya dulce de los valles', 'Vainilla natural'],
        origin: 'Valles Templados de Chuquisaca',
        description: 'Elaborado con manteca desodorizada de primera prensada y liofilizado de chirimoyas seleccionadas de las huertas chuquisaqueñas.',
        pairing: 'Té blanco o infusión de hierbaluisa',
        colorHex: '#522b17',
        wrapperPrimaryColor: '#27ae60',
        wrapperAccentColor: '#f1c40f',
        badge: 'Frutos del Valle',
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
    islandPosition: [0, 0.9, 1.2],
    facade: '/factories/sucre/facade.webp',
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
        id: 'sucre-colonial-canela',
        name: 'Barra Colonial Taza & Canela de Ceilán',
        subtitle: 'Fórmula conventual de 1825',
        cacaoPercentage: 65,
        weight: '120 g',
        dimensions: '17.0 x 8.0 x 1.1 cm',
        flavorProfile: ['Canela dulce en rama', 'Clavo de olor sutil', 'Cacao tostado rústico', 'Textura crocante azucarada'],
        origin: 'Yungas de La Paz y Chuquisaca',
        description: 'La tableta histórica por excelencia de Sucre. Molida a la piedra para conservar una textura cristalina que al fundirse en leche caliente genera la densa y perfumada espuma tradicional.',
        pairing: 'Tradicional chocolate caliente matutino con buñuelo chuquisaqueño',
        colorHex: '#33190e',
        wrapperPrimaryColor: '#1a365d',
        wrapperAccentColor: '#e0f2fe',
        badge: 'Receta Patrimonial',
        type: 'bar'
      },
      {
        id: 'sucre-negro-sal-uyuni',
        name: 'Chocolate Oscuro 75% Flor de Sal de Uyuni',
        subtitle: 'Sal fósil pura del altiplano boliviano',
        cacaoPercentage: 75,
        weight: '100 g',
        dimensions: '16.2 x 7.6 x 0.9 cm',
        flavorProfile: ['Intenso cacao amargo', 'Explosión mineral salina', 'Toques tostados de avellana'],
        origin: 'Salar de Uyuni & Madidi',
        description: 'El choque perfecto entre la selva y el desierto blanco. Cristales de flor de sal milenaria que potencian la dulzura profunda del cacao amazónico.',
        pairing: 'Queso criollo madurado o cerveza negra artesanal',
        colorHex: '#1e0e07',
        wrapperPrimaryColor: '#0f172a',
        wrapperAccentColor: '#93c5fd',
        badge: 'Gourmet de Salar',
        type: 'bar'
      },
      {
        id: 'sucre-nuez-macadamia',
        name: 'Tableta Suprema de Cacao 55% y Macadamias',
        subtitle: 'Frutos secos caramelizados a la leña',
        cacaoPercentage: 55,
        weight: '95 g',
        dimensions: '15.5 x 7.4 x 1.0 cm',
        flavorProfile: ['Macadamias crujientes', 'Caramelo de mantequilla', 'Cacao suave y redondo'],
        origin: 'Valles de Monteagudo',
        description: 'Trozos enteros de nuez de macadamia tostada bañados en una cobertura noble de chocolate con leche alpina y cacao de sombra.',
        pairing: 'Espresso doble o licor de café',
        colorHex: '#412213',
        wrapperPrimaryColor: '#1e3a5f',
        wrapperAccentColor: '#fbbf24',
        badge: 'Crujiente de Valle',
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
    islandPosition: [6.8, -0.3, -1],
    facade: '/factories/taboada/facade.webp',
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
        id: 'taboada-submarino-puro',
        name: 'Barra Submarino Clásica 80% Pasta Pura',
        subtitle: 'La barra legendaria para batir en jarra',
        cacaoPercentage: 80,
        weight: '150 g',
        dimensions: '18.0 x 8.5 x 1.4 cm',
        flavorProfile: ['Cacao tostado profundo', 'Amargor aterciopelado', 'Resina frutal', 'Espesura cremosa'],
        origin: 'Bosques Nativos de Larecaja',
        description: 'El auténtico sabor del invierno chuquisaqueño. Una barra gruesa de molienda tradicional sin grasas añadidas ni conservantes.',
        pairing: 'Leche fresca al vapor y pan de batalla sucrense',
        colorHex: '#1d0c06',
        wrapperPrimaryColor: '#b45309',
        wrapperAccentColor: '#fef08a',
        badge: 'Patrimonio de 1948',
        type: 'bar'
      },
      {
        id: 'taboada-amargo-almendras',
        name: 'Tableta Extra Fina con Castañas Amazónicas',
        subtitle: 'Cacao al 68% con nuez de Brasil tostada',
        cacaoPercentage: 68,
        weight: '100 g',
        dimensions: '16.0 x 7.6 x 0.9 cm',
        flavorProfile: ['Castañas amazónicas crujientes', 'Notas a madera de roble', 'Cacao tostado intenso'],
        origin: 'Pando & Cuenca Amazónica',
        description: 'Castañas seleccionadas a mano procedentes de los bosques de castañeros de Pando, tostadas en manteca de cacao y sumergidas en chocolate oscuro.',
        pairing: 'Oporto o licor dulce de membrillo',
        colorHex: '#2e1509',
        wrapperPrimaryColor: '#92400e',
        wrapperAccentColor: '#fde047',
        badge: 'Castaña Seleccionada',
        type: 'bar'
      },
      {
        id: 'taboada-caja-realeza',
        name: 'Edición de Colección Bombones Taboada',
        subtitle: 'Surtido de trufas con praliné de maní tostado',
        cacaoPercentage: 62,
        weight: '180 g',
        dimensions: '19.0 x 9.5 x 2.2 cm',
        flavorProfile: ['Praliné de maní boliviano', 'Ganache de café Yungas', 'Caramelo salado artesanal'],
        origin: 'Selección Chuquisaca y Yungas',
        description: 'Presentación de homenaje que reúne las nueve recetas más premiadas de Don Fernando Taboada, en estuche litografiado con la arquitectura colonial de Sucre.',
        pairing: 'Champagne o licor de cerezas',
        colorHex: '#3a1b0d',
        wrapperPrimaryColor: '#78350f',
        wrapperAccentColor: '#fef9c3',
        badge: 'Surtido Histórico',
        type: 'box'
      }
    ]
  }
];
