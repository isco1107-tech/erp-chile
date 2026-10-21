import type { PublicAccentKey } from '@/modules/projects/schema';

/**
 * Colores del afiche por acento del micrositio. `light` es el acento sobre
 * fondo oscuro, `main` el color pleno, `mid` el acento sobre fondo claro,
 * `deep` un fondo oscuro teñido del acento y `paper` un fondo claro teñido.
 */
export interface PosterPalette {
  light: string;
  main: string;
  mid: string;
  deep: string;
  paper: string;
  /** Tinta oscura para texto sobre `main`/`light`. */
  ink: string;
}

export const POSTER_PALETTES: Record<PublicAccentKey, PosterPalette> = {
  gold: { light: '#f0dca8', main: '#d6b061', mid: '#9c7634', deep: '#16110a', paper: '#f5eee0', ink: '#14110b' },
  rose: { light: '#f8ccd6', main: '#e3607f', mid: '#a8203d', deep: '#1c0811', paper: '#f8ecef', ink: '#1c0811' },
  violet: { light: '#ddd2fb', main: '#9a7ee8', mid: '#6a4bbd', deep: '#110c24', paper: '#f0ecf9', ink: '#120d24' },
  cyan: { light: '#c6eef5', main: '#46b6cb', mid: '#21788b', deep: '#06171c', paper: '#e9f4f6', ink: '#06171c' },
  emerald: { light: '#cbead7', main: '#4cad80', mid: '#277052', deep: '#07160f', paper: '#eaf3ed', ink: '#07160f' },
};

/** Azul noche del micrositio: fondo base de los estilos oscuros. */
export const NIGHT = { top: '#121a45', mid: '#0c1130', bottom: '#060818' } as const;

/** `#rrggbb` + opacidad → `rgba(...)`. */
export function alpha(hex: string, opacity: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}
