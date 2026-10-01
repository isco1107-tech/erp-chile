/**
 * Estilos de diseño del motor de afiches y la tipografía de cada uno. Cada
 * rol de fuente se descarga de Google Fonts recortado al texto real del
 * afiche y se registra en el renderizador con el nombre de su rol.
 */

export const POSTER_STYLES = ['gala', 'editorial', 'impacto'] as const;
export type PosterStyle = (typeof POSTER_STYLES)[number];

export const POSTER_STYLE_INFO: Record<PosterStyle, { label: string; description: string }> = {
  gala: { label: 'Gala', description: 'Noche, dorados y tipografía fina: el tono del micrositio.' },
  editorial: { label: 'Editorial', description: 'Portada de revista: papel claro, serif de alto contraste, la foto manda.' },
  impacto: { label: 'Impacto', description: 'Moderno y llamativo: letras condensadas enormes y bloques de color.' },
};

export function isPosterStyle(value: string | null | undefined): value is PosterStyle {
  return (POSTER_STYLES as readonly string[]).includes(value ?? '');
}

export const FONT_ROLES = ['display', 'accent', 'sans', 'sansBold', 'numeral'] as const;
export type FontRole = (typeof FONT_ROLES)[number];

export interface FontSpec {
  family: string;
  weight: number;
  italic: boolean;
}

/** Nombre con que cada rol se registra en el renderizador (sans y sansBold comparten familia, con distinto peso). */
export const ROLE_FAMILY: Record<FontRole, string> = {
  display: 'PosterDisplay',
  accent: 'PosterAccent',
  sans: 'PosterSans',
  sansBold: 'PosterSans',
  numeral: 'PosterNumeral',
};

export const STYLE_FONTS: Record<PosterStyle, Record<FontRole, FontSpec>> = {
  gala: {
    display: { family: 'Italiana', weight: 400, italic: false },
    accent: { family: 'Cormorant Garamond', weight: 500, italic: true },
    sans: { family: 'Montserrat', weight: 500, italic: false },
    sansBold: { family: 'Montserrat', weight: 700, italic: false },
    // Italiana dibuja el "1" como una "I": las cifras grandes van en Bodoni (cifras alineadas, alto contraste).
    numeral: { family: 'Bodoni Moda', weight: 400, italic: false },
  },
  editorial: {
    display: { family: 'Bodoni Moda', weight: 500, italic: false },
    accent: { family: 'Bodoni Moda', weight: 500, italic: true },
    sans: { family: 'Montserrat', weight: 500, italic: false },
    sansBold: { family: 'Montserrat', weight: 700, italic: false },
    numeral: { family: 'Bodoni Moda', weight: 500, italic: false },
  },
  impacto: {
    display: { family: 'Anton', weight: 400, italic: false },
    accent: { family: 'Montserrat', weight: 800, italic: true },
    sans: { family: 'Montserrat', weight: 500, italic: false },
    sansBold: { family: 'Montserrat', weight: 800, italic: false },
    numeral: { family: 'Anton', weight: 400, italic: false },
  },
};
