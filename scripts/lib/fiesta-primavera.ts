import { creativeSiteSchema, type CreativeSite } from '../../src/lib/web-sites/creative';
import { kitTheme, THEME_KITS } from '../../src/lib/web-sites/theme';

/**
 * Contenido del certamen «Fiesta de la Primavera de Temuco» de CR Producciones
 * (lo crea `scripts/crear-certamen-fiesta-primavera.ts`). Puro: sin base de
 * datos ni almacenamiento, así la prueba lo valida contra el mismo esquema que
 * usa el panel (`creativeSiteSchema`).
 *
 * La historia solo cuenta hechos con fuente pública (nunca un dato inventado):
 * - Memoria Chilena (Biblioteca Nacional): origen en 1913, FECh, reina,
 *   carros alegóricos, comparsas, Juegos Florales de 1914 ganados por
 *   Gabriela Mistral, concursos de afiches (Isaías Cabezón, 1917–1919).
 * - Memorias del Siglo XX (Archivo Nacional): fiesta juvenil realizada entre
 *   1915 y 1972; época dorada en los años 50.
 * - Cinechile: «Fiesta de la primavera» (1928), cortometraje documental mudo
 *   rodado en Temuco por Hans Frey y Cía., conservado por la Cineteca de la
 *   Universidad de Chile: desfiles con personas disfrazadas, carruajes
 *   ornamentados y un baile.
 * - Araucanía Noticias (22-08-2012): la Municipalidad y El Diario Austral la
 *   retomaron en 2011 y 2012 con show artístico, carros alegóricos y elección
 *   de la Reina de la Primavera, tras muchos años sin hacerse.
 *
 * Lo que no se sabe (fecha de la próxima gala, lugar, precios, auspiciadores)
 * NO se escribe: se completa en el panel.
 */

export const FIESTA = {
  code: 'FIESTA-PRIMAVERA-TEMUCO',
  name: 'Fiesta de la Primavera Temuco',
  slug: 'fiesta-de-la-primavera-temuco',
  tagline: 'Temuco vuelve a florecer: la Reina de la Primavera, los carros alegóricos y la fiesta de toda la ciudad.',
  description:
    'La Fiesta de la Primavera fue durante décadas la gran celebración de Chile: reinas, carros alegóricos, comparsas, poesía y afiches llenaban las calles para recibir la estación de las flores. Temuco también la vivió, y en 1928 quedó registrada en un cortometraje que hoy conserva la Cineteca de la Universidad de Chile. CR Producciones la trae de vuelta para que una nueva generación de familias, candidatas y vecinos vuelva a celebrarla.',
  accent: 'primavera' as const,
} as const;

export interface FiestaLogo {
  /** URL ya subida a nuestro almacenamiento (`pageant-site/{companyId}/…`). */
  url: string;
  /** Nombre de la marca (sale del nombre del archivo). */
  name: string;
}

const spring = THEME_KITS.find((kit) => kit.id === 'spring-fest');

/** Diseño del estudio visual: va justo después de la portada del micrositio. */
export function buildFiestaDesign(logos: FiestaLogo[]): CreativeSite {
  return creativeSiteSchema.parse({
    enabled: true,
    placement: 'afterHero',
    theme: spring ? kitTheme(spring) : {},
    blocks: [
      {
        id: 'cinta-primavera',
        type: 'marquee',
        speed: 'slow',
        variant: 'scroll',
        style: { background: 'primary', spacing: 'sm' },
        items: [
          { text: 'Reina de la Primavera' },
          { text: 'Carros alegóricos' },
          { text: 'Comparsas y disfraces' },
          { text: 'Juegos florales' },
          { text: 'Temuco florece' },
          { text: 'Una tradición que vuelve' },
        ],
      },
      {
        id: 'la-fiesta-vuelve',
        type: 'text',
        variant: 'lead',
        heading: 'La fiesta que Temuco extrañaba',
        body:
          'Hubo un tiempo en que la llegada de la primavera se celebraba en la calle. Las reinas desfilaban sobre carros adornados con flores y cintas, las comparsas y los disfraces llenaban las avenidas y la poesía tenía su propio concurso.\n\nTemuco vivió esa fiesta. **CR Producciones** la recupera hoy con el mismo espíritu: una celebración para toda la ciudad, con su Reina de la Primavera, sus carros alegóricos y el encuentro de las familias.',
        style: { background: 'soft', pattern: 'petals', spacing: 'md', shape: 'wave' },
      },
      {
        id: 'cifras',
        type: 'stats',
        variant: 'cards',
        heading: 'Una tradición con historia',
        style: { background: 'default', spacing: 'md' },
        items: [
          { value: '1913', label: 'Nace la idea de celebrar la primavera' },
          { value: '1914', label: 'Primeros Juegos Florales' },
          { value: '1928', label: 'La fiesta de Temuco queda en el cine' },
          { value: '+100', label: 'Años de historia' },
        ],
      },
      {
        id: 'historia',
        type: 'timeline',
        variant: 'alternating',
        heading: 'Más de un siglo de primaveras',
        intro: 'Así nació y así se vivió la Fiesta de la Primavera, en Chile y en Temuco.',
        style: { background: 'default', spacing: 'lg' },
        items: [
          {
            date: '1913',
            title: 'Nace una idea',
            text: 'En el Congreso de Estudiantes de Lima se acordó reconocer la primavera como símbolo de la renovación estudiantil. La Federación de Estudiantes de Chile la convirtió en una fiesta que se organizaba cada año.',
          },
          {
            date: '1914',
            title: 'Poesía en la fiesta',
            text: 'Los Juegos Florales premiaban la poesía y la prosa. Su primera edición la ganó Gabriela Mistral con «Los sonetos de la muerte».',
          },
          {
            date: '1917 – 1919',
            title: 'Los afiches de la primavera',
            text: 'Los concursos de afiches fueron parte de la tradición. Isaías Cabezón los ganó tres años seguidos con sus colores planos y motivos de carnaval.',
          },
          {
            date: '1928',
            title: 'Temuco queda en el cine',
            text: 'Un cortometraje documental mudo, rodado en Temuco por Hans Frey y Cía., registró la fiesta de la primavera de la ciudad: desfiles con personas disfrazadas, carruajes ornamentados y un baile. Hoy lo conserva la Cineteca de la Universidad de Chile.',
          },
          {
            date: 'Años 50',
            title: 'La época dorada',
            text: 'La Fiesta de la Primavera vivió su apogeo como gran fiesta nacional: la elección de la reina, los carros alegóricos, las comparsas y las murgas convocaban a ciudades enteras.',
          },
          {
            date: '2011 – 2012',
            title: 'Temuco la retoma',
            text: 'Después de muchos años sin realizarse, la ciudad volvió a celebrarla con un gran show artístico, el desfile de carros alegóricos y la elección de la Reina de la Primavera.',
          },
          {
            date: 'Hoy',
            title: 'CR Producciones la trae de vuelta',
            text: 'Recuperamos la fiesta para una nueva generación: la Reina de la Primavera, los carros alegóricos y una celebración para toda la familia.',
          },
        ],
      },
      {
        id: 'tradicion',
        type: 'features',
        variant: 'cards',
        columns: '4',
        heading: 'Lo que hacía grande a la fiesta',
        intro: 'Las tradiciones que queremos recuperar.',
        style: { background: 'primary', pattern: 'petals', spacing: 'lg', shape: 'curve' },
        items: [
          { icon: 'award', title: 'La Reina de la Primavera', text: 'La elección y coronación de la reina fue el corazón de la fiesta en todo Chile.' },
          { icon: 'car', title: 'Carros alegóricos', text: 'Barrios, instituciones y estudiantes adornaban carros con flores y cintas para desfilar por la ciudad.' },
          { icon: 'music', title: 'Comparsas y disfraces', text: 'Comparsas, murgas y disfraces convertían las calles en un carnaval para recibir la primavera.' },
          { icon: 'palette', title: 'Poesía y afiches', text: 'Los Juegos Florales y los concursos de afiches hicieron de la fiesta también una celebración del arte.' },
        ],
      },
      {
        id: 'galeria',
        type: 'gallery',
        variant: 'carousel',
        heading: 'La fiesta en imágenes',
        // Sin fotos la sección no se publica (el sitio público omite las secciones vacías); se suben en el estudio.
        images: [],
        style: { background: 'default', spacing: 'lg' },
      },
      {
        id: 'auspiciadores',
        type: 'logos',
        variant: 'carousel',
        heading: 'Auspiciadores de la Fiesta de la Primavera',
        // Visible en el editor desde el inicio: sin logos el sitio público la omite (nunca un logo inventado).
        style: { background: 'soft', pattern: 'petals', spacing: 'lg' },
        items: logos.slice(0, 16).map((logo) => ({ imageUrl: logo.url, alt: logo.name, href: '' })),
      },
      {
        id: 'se-parte',
        type: 'cta',
        variant: 'gradient',
        title: 'Sé parte de la Fiesta de la Primavera',
        text: 'Postula a Reina de la Primavera o suma a tu marca a la fiesta que vuelve a Temuco.',
        buttonLabel: 'Quiero ser candidata',
        buttonHref: '#postula',
        secondaryLabel: 'Quiero auspiciar',
        secondaryHref: '#auspicios',
        style: { background: 'soft', pattern: 'petals', spacing: 'lg' },
      },
    ],
  });
}

/** Nombre de una marca a partir del nombre de su archivo («Café_del-Sur.png» → «Café del Sur»). */
export function logoNameFromFile(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '');
  return base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
}
