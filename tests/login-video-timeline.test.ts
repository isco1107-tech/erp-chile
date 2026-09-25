import { coverRect, loadOrder, positionAt, strideIndices, videoFrames } from '@/components/auth/login-video-timeline';

describe('video de fondo del login', () => {
  it('reproduce v1 y después v2, y termina en el último fotograma de v2 (la imagen final)', () => {
    const frames = videoFrames([144, 144], 1);
    expect(frames).toHaveLength(288);
    expect(frames[0]).toEqual({ clip: 0, index: 0 });
    expect(frames[143]).toEqual({ clip: 0, index: 143 });
    expect(frames[144]).toEqual({ clip: 1, index: 0 });
    expect(frames[frames.length - 1]).toEqual({ clip: 1, index: 143 });
  });

  it('en modo liviano salta fotogramas pero conserva el último de cada clip', () => {
    expect(strideIndices(10, 3)).toEqual([0, 3, 6, 9]);
    expect(strideIndices(11, 3)).toEqual([0, 3, 6, 9, 10]);
    const light = videoFrames([144, 144], 3);
    expect(light[light.length - 1]).toEqual({ clip: 1, index: 143 });
  });

  it('avanza un fotograma por cuadro del set original y se detiene en el último', () => {
    expect(positionAt(0, 18, 1, 288)).toBe(0);
    expect(positionAt(1000, 18, 1, 288)).toBe(18);
    expect(positionAt(1000, 18, 3, 96)).toBe(6);
    expect(positionAt(10 * 60_000, 18, 1, 288)).toBe(287);
  });

  it('descarga primero el primer fotograma y la imagen final, después el resto en orden', () => {
    expect(loadOrder(5)).toEqual([0, 4, 1, 2, 3]);
    expect(loadOrder(1)).toEqual([0]);
    expect(loadOrder(0)).toEqual([]);
  });

  it('cubre el panel sin deformar y centrado', () => {
    // Panel izquierdo de escritorio (940×900) con fotogramas de 1920×1080.
    const rect = coverRect(1920, 1080, 940, 900);
    expect(rect.height).toBeCloseTo(900);
    expect(rect.width).toBeCloseTo(1600);
    expect(rect.x).toBeCloseTo(-330);
    expect(rect.y).toBeCloseTo(0);
  });
});
