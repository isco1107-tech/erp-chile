/**
 * Constelaciones reales del cielo de la landing. Cada estrella lleva su
 * posición en el cielo (ascensión recta en horas, declinación en grados) y su
 * magnitud; las líneas son las de las cartas estelares habituales. Se dibujan
 * con el norte arriba y el este a la izquierda, como se ven al mirar el cielo.
 *
 * `at` es dónde aparece a lo largo de la página (0 al salir del hero, 1 al
 * final) y `side` de qué lado de la pantalla, para que se repartan alternadas.
 */

export interface CatalogStar {
  ra: number;
  dec: number;
  mag: number;
}

export interface Constellation {
  name: string;
  /** Nombre popular en Chile, si lo tiene. */
  note?: string;
  stars: readonly CatalogStar[];
  lines: readonly (readonly [number, number])[];
  at: number;
  side: 'left' | 'right';
}

export const CONSTELLATIONS: readonly Constellation[] = [
  {
    name: 'Cruz del Sur',
    // Acrux, Mimosa, Gacrux, Imai, Ginan.
    stars: [
      { ra: 12.443, dec: -63.10, mag: 0.8 },
      { ra: 12.795, dec: -59.69, mag: 1.25 },
      { ra: 12.519, dec: -57.11, mag: 1.6 },
      { ra: 12.252, dec: -58.75, mag: 2.8 },
      { ra: 12.357, dec: -60.40, mag: 3.6 },
    ],
    lines: [[0, 2], [1, 3]],
    at: 0.02,
    side: 'right',
  },
  {
    name: 'Orión',
    note: 'Las Tres Marías',
    // Betelgeuse, Rigel, Bellatrix, Mintaka, Alnilam, Alnitak, Saiph, Meissa.
    stars: [
      { ra: 5.919, dec: 7.41, mag: 0.5 },
      { ra: 5.242, dec: -8.20, mag: 0.1 },
      { ra: 5.419, dec: 6.35, mag: 1.6 },
      { ra: 5.533, dec: -0.30, mag: 2.2 },
      { ra: 5.604, dec: -1.20, mag: 1.7 },
      { ra: 5.679, dec: -1.94, mag: 1.8 },
      { ra: 5.796, dec: -9.67, mag: 2.1 },
      { ra: 5.585, dec: 9.93, mag: 3.4 },
    ],
    lines: [[7, 0], [7, 2], [0, 2], [0, 5], [2, 3], [3, 4], [4, 5], [5, 6], [3, 1]],
    at: 0.15,
    side: 'left',
  },
  {
    name: 'Escorpión',
    // Graffias, Dschubba, π, σ, Antares, τ, ε, μ, ζ, η, Sargas, ι, κ, Shaula, Lesath.
    stars: [
      { ra: 16.091, dec: -19.81, mag: 2.6 },
      { ra: 16.006, dec: -22.62, mag: 2.3 },
      { ra: 15.981, dec: -26.11, mag: 2.9 },
      { ra: 16.353, dec: -25.59, mag: 2.9 },
      { ra: 16.490, dec: -26.43, mag: 1.0 },
      { ra: 16.598, dec: -28.22, mag: 2.8 },
      { ra: 16.836, dec: -34.29, mag: 2.3 },
      { ra: 16.864, dec: -38.05, mag: 3.0 },
      { ra: 16.910, dec: -42.36, mag: 3.6 },
      { ra: 17.203, dec: -43.24, mag: 3.3 },
      { ra: 17.622, dec: -43.00, mag: 1.9 },
      { ra: 17.793, dec: -40.13, mag: 3.0 },
      { ra: 17.708, dec: -39.03, mag: 2.4 },
      { ra: 17.560, dec: -37.10, mag: 1.6 },
      { ra: 17.513, dec: -37.30, mag: 2.7 },
    ],
    lines: [[0, 1], [1, 2], [1, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 11], [11, 12], [12, 13], [13, 14]],
    at: 0.28,
    side: 'right',
  },
  {
    name: 'Can Mayor',
    // Sirio, Mirzam, Muliphein, ι, ο², Wezen, Adhara, Aludra.
    stars: [
      { ra: 6.752, dec: -16.72, mag: -1.46 },
      { ra: 6.378, dec: -17.96, mag: 2.0 },
      { ra: 7.062, dec: -15.63, mag: 4.1 },
      { ra: 6.936, dec: -17.05, mag: 4.4 },
      { ra: 7.050, dec: -23.83, mag: 3.0 },
      { ra: 7.140, dec: -26.39, mag: 1.8 },
      { ra: 6.977, dec: -28.97, mag: 1.5 },
      { ra: 7.402, dec: -29.30, mag: 2.4 },
    ],
    lines: [[1, 0], [0, 3], [3, 2], [0, 4], [4, 5], [5, 6], [5, 7]],
    at: 0.41,
    side: 'left',
  },
  {
    name: 'Leo',
    // Régulo, η, Algieba, Adhafera, μ, ε, Zosma, Chertan, Denébola.
    stars: [
      { ra: 10.140, dec: 11.97, mag: 1.4 },
      { ra: 10.122, dec: 16.76, mag: 3.5 },
      { ra: 10.333, dec: 19.84, mag: 2.0 },
      { ra: 10.278, dec: 23.42, mag: 3.4 },
      { ra: 9.879, dec: 26.01, mag: 3.9 },
      { ra: 9.764, dec: 23.77, mag: 3.0 },
      { ra: 11.235, dec: 20.52, mag: 2.6 },
      { ra: 11.237, dec: 15.43, mag: 3.3 },
      { ra: 11.818, dec: 14.57, mag: 2.1 },
    ],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [2, 6], [6, 8], [8, 7], [7, 0]],
    at: 0.54,
    side: 'right',
  },
  {
    name: 'Lira',
    // Vega, ε, ζ, δ², Sulafat, Sheliak.
    stars: [
      { ra: 18.616, dec: 38.78, mag: 0.0 },
      { ra: 18.739, dec: 39.61, mag: 4.7 },
      { ra: 18.746, dec: 37.61, mag: 4.4 },
      { ra: 18.908, dec: 36.90, mag: 4.3 },
      { ra: 18.982, dec: 32.69, mag: 3.2 },
      { ra: 18.835, dec: 33.36, mag: 3.5 },
    ],
    lines: [[0, 1], [0, 2], [1, 2], [2, 3], [3, 4], [4, 5], [5, 2]],
    at: 0.66,
    side: 'left',
  },
  {
    name: 'Cisne',
    note: 'Cruz del Norte',
    // Deneb, Sadr, Albireo, δ, Gienah, η.
    stars: [
      { ra: 20.690, dec: 45.28, mag: 1.25 },
      { ra: 20.370, dec: 40.26, mag: 2.2 },
      { ra: 19.512, dec: 27.96, mag: 3.1 },
      { ra: 19.750, dec: 45.13, mag: 2.9 },
      { ra: 20.770, dec: 33.97, mag: 2.5 },
      { ra: 19.938, dec: 35.08, mag: 3.9 },
    ],
    lines: [[0, 1], [1, 5], [5, 2], [3, 1], [1, 4]],
    at: 0.77,
    side: 'right',
  },
  {
    name: 'Osa Mayor',
    // Dubhe, Merak, Phecda, Megrez, Alioth, Mizar, Alkaid.
    stars: [
      { ra: 11.062, dec: 61.75, mag: 1.8 },
      { ra: 11.031, dec: 56.38, mag: 2.4 },
      { ra: 11.897, dec: 53.69, mag: 2.4 },
      { ra: 12.257, dec: 57.03, mag: 3.3 },
      { ra: 12.900, dec: 55.96, mag: 1.8 },
      { ra: 13.399, dec: 54.93, mag: 2.2 },
      { ra: 13.792, dec: 49.31, mag: 1.9 },
    ],
    lines: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]],
    at: 0.88,
    side: 'left',
  },
  {
    name: 'Casiopea',
    // Caph, Schedar, γ, Ruchbah, Segin.
    stars: [
      { ra: 0.153, dec: 59.15, mag: 2.3 },
      { ra: 0.675, dec: 56.54, mag: 2.2 },
      { ra: 0.945, dec: 60.72, mag: 2.2 },
      { ra: 1.430, dec: 60.24, mag: 2.7 },
      { ra: 1.907, dec: 63.67, mag: 3.4 },
    ],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4]],
    at: 0.98,
    side: 'right',
  },
];

export interface Point {
  x: number;
  y: number;
}

/**
 * Proyecta las estrellas a un plano (proyección local alrededor del centro):
 * el este queda a la izquierda y el norte arriba. Devuelve puntos centrados en
 * 0 cuyo lado más largo mide 1.
 */
export function projectStars(stars: readonly CatalogStar[]): Point[] {
  if (stars.length === 0) return [];
  const ra0 = stars.reduce((sum, star) => sum + star.ra, 0) / stars.length;
  const dec0 = stars.reduce((sum, star) => sum + star.dec, 0) / stars.length;
  const squeeze = Math.cos((dec0 * Math.PI) / 180);
  const raw = stars.map(star => ({ x: -(star.ra - ra0) * 15 * squeeze, y: -(star.dec - dec0) }));
  const xs = raw.map(point => point.x);
  const ys = raw.map(point => point.y);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
  return raw.map(point => ({ x: (point.x - cx) / span, y: (point.y - cy) / span }));
}

/** Radio del punto según la magnitud: las más brillantes (magnitud baja) son más grandes. */
export function starRadius(mag: number): number {
  return Math.max(0.7, Math.min(3.2, 2.6 - mag * 0.5));
}

/**
 * Posición vertical en pantalla del centro de una constelación. Se mueven más
 * lento que el contenido (`parallax`), como el cielo de fondo, y cada una pasa
 * por el centro de la pantalla cuando el scroll llega a su punto `at`.
 */
export function constellationY(at: number, scroll: number, start: number, end: number, viewport: number, parallax: number): number {
  const anchor = start + at * Math.max(0, end - start);
  return viewport / 2 + (anchor - scroll) * parallax;
}

/**
 * Cuánto se enciende sola al pasar por la pantalla: entera cerca del centro,
 * nada al llegar a los bordes.
 */
export function centerFocus(y: number, viewport: number): number {
  const distance = Math.abs(y - viewport / 2) / (viewport / 2);
  if (distance >= 0.75) return 0;
  if (distance <= 0.3) return 1;
  const t = (0.75 - distance) / 0.45;
  return t * t * (3 - 2 * t);
}
