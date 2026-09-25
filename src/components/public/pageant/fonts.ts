import { Cormorant_Garamond, Italiana, Karla } from 'next/font/google';

/**
 * Tipografías de la identidad pública de los certámenes (micrositio y página
 * de postulación): Italiana para títulos, Karla para texto y Cormorant
 * Garamond para cursivas y cifras (Italiana solo tiene números antiguos).
 */
const display = Italiana({ subsets: ['latin'], weight: '400', variable: '--pgs-display', display: 'swap' });
const body = Karla({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'], variable: '--pgs-body', display: 'swap' });
const serif = Cormorant_Garamond({ subsets: ['latin'], weight: ['400', '500'], style: ['normal', 'italic'], variable: '--pgs-serif', display: 'swap' });

/** Clases que definen las variables de fuente en el contenedor `.pgs`. */
export const PAGEANT_FONT_CLASSES = `${display.variable} ${body.variable} ${serif.variable}`;
