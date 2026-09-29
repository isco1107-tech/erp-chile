import {
  DM_Serif_Display,
  Inter,
  Josefin_Sans,
  Lora,
  Montserrat,
  Nunito,
  Oswald,
  Playfair_Display,
  Poppins,
  Raleway,
  Space_Grotesk,
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
].join(' ');
