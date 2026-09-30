import { PAGEANT_SITE_STYLES } from '@/components/public/pageant/styles';

/**
 * Guardia de rendimiento del micrositio: la portada llegó a ir a 6 cuadros por segundo (y a hacer "tiritar"
 * las letras y la barra de scroll) por efectos que obligan a repintar capas enormes en cada cuadro. Estos
 * tests fallan si alguien los reintroduce. La medición real de fluidez está en `npm run verify:perf`.
 */

/** Última declaración de una propiedad para un selector exacto (la que gana por orden en la hoja). */
function lastValue(selector: string, property: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = new RegExp(`(?:^|[}\\n])\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g');
  let value: string | null = null;
  for (const match of PAGEANT_SITE_STYLES.matchAll(rule)) {
    const decl = new RegExp(`(?:^|;|\\s)${property}\\s*:\\s*([^;]+)`).exec(match[1]!);
    if (decl) value = decl[1]!.trim();
  }
  return value;
}

describe('rendimiento del micrositio', () => {
  it('las capas grandes de la portada no llevan blur ni mezcla', () => {
    for (const selector of ['.pgs-aurora', '.pgs-beam', '.pgs-stage', '.pgs-dust']) {
      expect(lastValue(selector, 'filter')).toBe('none');
    }
    for (const selector of ['.pgs-aurora', '.pgs-beam', '.pgs-grain']) {
      expect(lastValue(selector, 'mix-blend-mode')).toBe('normal');
    }
  });

  it('los rayos no usan clip-path ni máscara mientras giran', () => {
    expect(lastValue('.pgs-beam', 'clip-path')).toBe('none');
    expect(lastValue('.pgs-beam', '-webkit-mask-image')).toBe('none');
  });

  it('el texto metálico es estático: animar background-position de un texto gigante lo repinta en cada cuadro', () => {
    const foil = /\.pgs-foil\s*\{[^}]*\}/.exec(PAGEANT_SITE_STYLES)?.[0] ?? '';
    expect(foil).toContain('background-clip: text');
    expect(foil).not.toContain('animation');
    expect(PAGEANT_SITE_STYLES).not.toContain('@keyframes pgs-foil');
  });

  it('el título grande no lleva filter (el resplandor es un degradado fijo)', () => {
    const title = /\.pgs-title-main\s*\{[^}]*\}/g;
    for (const rule of PAGEANT_SITE_STYLES.matchAll(title)) expect(rule[0]).not.toMatch(/filter\s*:/);
  });

  it('lo que sale de la pantalla se pausa', () => {
    expect(PAGEANT_SITE_STYLES).toMatch(/\.is-offscreen[^{]*\{\s*animation-play-state:\s*paused\s*!important/);
  });
});
