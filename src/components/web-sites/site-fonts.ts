import {
  Abril_Fatface,
  Anton,
  Bebas_Neue,
  Caveat,
  Cinzel,
  Cormorant_Garamond,
  DM_Sans,
  DM_Serif_Display,
  Dancing_Script,
  EB_Garamond,
  Figtree,
  Fraunces,
  Instrument_Serif,
  Inter,
  Josefin_Sans,
  Libre_Baskerville,
  Lora,
  Manrope,
  Merriweather,
  Montserrat,
  Nunito,
  Oswald,
  Outfit,
  Playfair_Display,
  Plus_Jakarta_Sans,
  Poppins,
  Quicksand,
  Raleway,
  Rubik,
  Space_Grotesk,
  Syne,
  Unbounded,
  Work_Sans,
} from 'next/font/google';

/**
 * Tipografías de Google que puede elegir un sitio web (ver `FONT_STACKS` en
 * `src/lib/web-sites/theme.ts`, que las referencia con `var(--wsf-<id>)`).
 *
 * Next las descarga al compilar y las sirve desde nuestro dominio: el navegador
 * del visitante no le pide nada a Google. Con `preload: false` no se agrega un
 * `<link rel="preload">` por fuente y el navegador baja el archivo solo si la
 * página usa esa tipografía; declararlas todas en el contenedor raíz solo define
 * las variables CSS (no cuesta ancho de banda de las que no se usan).
 *
 * Las de un solo grosor (Bebas Neue, Anton, Abril Fatface, Instrument Serif,
 * DM Serif Display) exigen `weight`; el resto son variables. Los nombres y los
 * grosores están verificados contra el catálogo de `next/font` (un error acá
 * rompe el build de producción).
 */
// Los cargadores de fuentes de Next se evalúan al compilar: las opciones tienen
// que ser literales escritos aquí mismo (nada de variables ni `...spread`).
const inter = Inter({ subsets: ['latin'], display: 'swap', preload: false, variable: '--wsf-inter' });
const poppins = Poppins({ subsets: ['latin'], display: 'swap', preload: false, weight: ['400', '500', '600', '700'], variable: '--wsf-poppins' });
const montserrat = Montserrat({ subsets: ['latin'], display: 'swap', preload: false, variable: '--wsf-montserrat' });
const nunito = Nunito({ subsets: ['latin'], display: 'swap', preload: false, variable: '--wsf-nunito' });
const raleway = Raleway({ subsets: ['latin'], display: 'swap', preload: false, variable: '--wsf-raleway' });
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], display: 'swap', preload: false, variable: '--wsf-space-grotesk' });
const josefin = Josefin_Sans({ subsets: ['latin'], display: 'swap', preload: false, variable: '--wsf-josefin' });
const oswald = Oswald({ subsets: ['latin'], display: 'swap', preload: false, variable: '--wsf-oswald' });
const playfair = Playfair_Display({ subsets: ['latin'], display: 'swap', preload: false, variable: '--wsf-playfair' });
const lora = Lora({ subsets: ['latin'], display: 'swap', preload: false, variable: '--wsf-lora' });
const dmSerif = DM_Serif_Display({ subsets: ['latin'], display: 'swap', preload: false, weight: '400', variable: '--wsf-dm-serif' });
const dmSans = DM_Sans({ subsets: ['latin'], display: 'swap', preload: false, variable: '--wsf-dm-sans' });
const manrope = Manrope({ subsets: ['latin'], display: 'swap', preload: false, variable: '--wsf-manrope' });
const outfit = Outfit({ subsets: ['latin'], display: 'swap', preload: false, variable: '--wsf-outfit' });
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], display: 'swap', preload: false, variable: '--wsf-jakarta' });
const workSans = Work_Sans({ subsets: ['latin'], display: 'swap', preload: false, variable: '--wsf-work-sans' });
const rubik = Rubik({ subsets: ['latin'], display: 'swap', preload: false, variable: '--wsf-rubik' });
const figtree = Figtree({ subsets: ['latin'], display: 'swap', preload: false, variable: '--wsf-figtree' });
const quicksand = Quicksand({ subsets: ['latin'], display: 'swap', preload: false, variable: '--wsf-quicksand' });
const merriweather = Merriweather({ subsets: ['latin'], display: 'swap', preload: false, variable: '--wsf-merriweather' });
const libreBaskerville = Libre_Baskerville({ subsets: ['latin'], display: 'swap', preload: false, variable: '--wsf-libre-baskerville' });
const ebGaramond = EB_Garamond({ subsets: ['latin'], display: 'swap', preload: false, variable: '--wsf-eb-garamond' });
const fraunces = Fraunces({ subsets: ['latin'], display: 'swap', preload: false, variable: '--wsf-fraunces' });
const cormorant = Cormorant_Garamond({ subsets: ['latin'], display: 'swap', preload: false, variable: '--wsf-cormorant' });
const bebas = Bebas_Neue({ subsets: ['latin'], display: 'swap', preload: false, weight: '400', variable: '--wsf-bebas' });
const syne = Syne({ subsets: ['latin'], display: 'swap', preload: false, variable: '--wsf-syne' });
const unbounded = Unbounded({ subsets: ['latin'], display: 'swap', preload: false, variable: '--wsf-unbounded' });
const instrumentSerif = Instrument_Serif({ subsets: ['latin'], display: 'swap', preload: false, weight: '400', variable: '--wsf-instrument-serif' });
const anton = Anton({ subsets: ['latin'], display: 'swap', preload: false, weight: '400', variable: '--wsf-anton' });
const cinzel = Cinzel({ subsets: ['latin'], display: 'swap', preload: false, variable: '--wsf-cinzel' });
const abril = Abril_Fatface({ subsets: ['latin'], display: 'swap', preload: false, weight: '400', variable: '--wsf-abril' });
const caveat = Caveat({ subsets: ['latin'], display: 'swap', preload: false, variable: '--wsf-caveat' });
const dancing = Dancing_Script({ subsets: ['latin'], display: 'swap', preload: false, variable: '--wsf-dancing' });

/** Clases que definen las variables `--wsf-*`: van en el contenedor raíz del sitio. */
export const SITE_FONT_CLASSES = [
  inter.variable,
  poppins.variable,
  montserrat.variable,
  nunito.variable,
  raleway.variable,
  spaceGrotesk.variable,
  josefin.variable,
  oswald.variable,
  playfair.variable,
  lora.variable,
  dmSerif.variable,
  dmSans.variable,
  manrope.variable,
  outfit.variable,
  jakarta.variable,
  workSans.variable,
  rubik.variable,
  figtree.variable,
  quicksand.variable,
  merriweather.variable,
  libreBaskerville.variable,
  ebGaramond.variable,
  fraunces.variable,
  cormorant.variable,
  bebas.variable,
  syne.variable,
  unbounded.variable,
  instrumentSerif.variable,
  anton.variable,
  cinzel.variable,
  abril.variable,
  caveat.variable,
  dancing.variable,
].join(' ');
