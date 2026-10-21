import { heroCrowdMin, seededRandom, solveGrid, solveStack } from '@/lib/posters/layout';

describe('solveStack', () => {
  const blocks = [
    { key: 'title', height: 200, gap: 0, drop: 0 },
    { key: 'hero', height: 0, gap: 20, drop: 0 },
    { key: 'facts', height: 100, gap: 20, drop: 3 },
    { key: 'list', height: 300, gap: 20, drop: 6 },
    { key: 'contact', height: 30, gap: 20, drop: 8 },
  ];

  it('si todo cabe, no descarta nada y el resto va a la pieza central', () => {
    const solution = solveStack(blocks, 2000, 300);
    expect(solution.kept.size).toBe(5);
    expect(solution.flex).toBe(2000 - 200 - 20 - 120 - 320 - 50);
  });

  it('descarta primero lo más prescindible, nunca lo imprescindible', () => {
    const solution = solveStack(blocks, 700, 300);
    expect(solution.kept.has('title')).toBe(true);
    expect(solution.kept.has('hero')).toBe(true);
    expect(solution.kept.has('list')).toBe(false);
    expect(solution.flex).toBeGreaterThanOrEqual(300);
  });

  it('un bloque chico descartado vuelve si al sacar uno grande sobró espacio', () => {
    // Sin la lista (300) caben el contacto (30) y los datos: el contacto no debe perderse.
    const solution = solveStack(blocks, 760, 300);
    expect(solution.kept.has('list')).toBe(false);
    expect(solution.kept.has('contact')).toBe(true);
    expect(solution.kept.has('facts')).toBe(true);
  });

  it('el orden de los bloques conservados es el original', () => {
    expect(Array.from(solveStack(blocks, 760, 300).kept)).toEqual(['title', 'hero', 'facts', 'contact']);
  });

  it('si ni sacando todo cabe, la pieza central queda en cero (nunca negativa)', () => {
    expect(solveStack(blocks, 100, 300).flex).toBe(0);
  });
});

describe('solveGrid', () => {
  it('elige la grilla con las fichas más grandes', () => {
    expect(solveGrid(4, 1000, 1000, { aspect: 1, gap: 0, captionHeight: 0 })).toMatchObject({ cols: 2, rows: 2, tileWidth: 500 });
    expect(solveGrid(3, 1200, 400, { aspect: 1, gap: 0, captionHeight: 0 })).toMatchObject({ cols: 3, rows: 1, tileWidth: 400 });
  });

  it('cuenta los espacios y la franja de texto de cada fila', () => {
    const grid = solveGrid(6, 960, 800, { aspect: 1.25, gap: 20, captionHeight: 40 });
    expect(grid.cols * grid.tileWidth + (grid.cols - 1) * 20).toBeLessThanOrEqual(960);
    expect(grid.rows * (grid.tileHeight + 40) + (grid.rows - 1) * 20).toBeLessThanOrEqual(800 + grid.rows);
  });
});

describe('heroCrowdMin', () => {
  it('más nombres o fichas piden más alto, con tope', () => {
    const few = heroCrowdMin({ kind: 'names', groups: [{ items: ['A'] }] }, 1);
    const many = heroCrowdMin({ kind: 'names', groups: [{ items: Array(10).fill('A') }] }, 1);
    expect(many).toBeGreaterThan(few);
    expect(heroCrowdMin({ kind: 'names', groups: [{ items: Array(100).fill('A') }] }, 1)).toBe(720);
    expect(heroCrowdMin({ kind: 'mosaic', tiles: Array(30).fill(0) }, 1)).toBe(700);
    expect(heroCrowdMin({ kind: 'date' }, 1)).toBe(0);
  });
});

describe('seededRandom', () => {
  it('misma semilla, misma secuencia (el afiche se dibuja siempre igual)', () => {
    const a = seededRandom('Miss Sur');
    const b = seededRandom('Miss Sur');
    const c = seededRandom('Otro');
    const seqA = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(seqA);
    expect([c(), c(), c()]).not.toEqual(seqA);
    for (const value of seqA) expect(value).toBeGreaterThanOrEqual(0);
  });
});
