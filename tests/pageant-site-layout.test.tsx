import { renderToStaticMarkup } from 'react-dom/server';
import { PageantPage } from '@/components/public/pageant/PageantPage';
import { formatCurrency } from '@/lib/chile/tax';
import { buildPageantView } from '@/lib/events/pageant-site';
import { pageantSiteDesignSchema } from '@/lib/events/pageant-site-design';
import type { LayoutItem } from '@/lib/events/pageant-layout';
import { sampleBlock } from '@/lib/web-sites/section-samples';
import { layoutsOf } from '@/lib/web-sites/variants';
import type { PublicPageantSite } from '@/modules/projects/services/public-site.service';
import { baseSite } from '../scripts/responsive/fixtures';

const textBlock = (id: string) => ({ ...sampleBlock('text', layoutsOf('text')[0]!.value), id });

function render(site: PublicPageantSite, editing?: { audience?: 'candidata' | 'sponsor' }) {
  const view = buildPageantView(site, new Date('2026-09-30T12:00:00Z'), 'https://ejemplo.cl', formatCurrency);
  return renderToStaticMarkup(<PageantPage site={site} view={view} editing={editing} />);
}

function withDesign(design: Record<string, unknown>): PublicPageantSite {
  return baseSite({ creative: pageantSiteDesignSchema.parse({ enabled: true, ...design }) });
}

const order = (html: string, ...needles: string[]) => needles.map((needle) => html.indexOf(needle));

describe('micrositio con diseño libre', () => {
  it('dibuja las secciones y los bloques del estudio en el orden guardado', () => {
    const layout: LayoutItem[] = [
      { kind: 'block', id: 'b1' },
      { kind: 'section', id: 'candidatas' },
      { kind: 'section', id: 'inicio' },
      { kind: 'block', id: 'b2' },
      { kind: 'section', id: 'certamen' },
    ];
    const html = render(withDesign({ blocks: [textBlock('b1'), textBlock('b2')], layout }));
    const [b1, candidatas, inicio, b2, certamen] = order(html, 'data-block-id="b1"', 'id="candidatas"', 'id="inicio"', 'data-block-id="b2"', 'id="certamen"');
    expect(b1).toBeGreaterThan(0);
    expect(b1).toBeLessThan(candidatas!);
    expect(candidatas).toBeLessThan(inicio!);
    expect(inicio).toBeLessThan(b2!);
    expect(b2).toBeLessThan(certamen!);
    // No empieza con la portada: deja el alto de la barra fija.
    expect(html).toContain('class="pgs-top-space"');
    // La hoja del estudio va una sola vez aunque haya dos tramos.
    expect(html.match(/\.ws-root\{font-family/g)).toHaveLength(1);
  });

  it('la numeración y el menú siguen el orden y respetan los nombres propios', () => {
    // Orden completo (sin secciones que se sumen solas): la gala primero, luego el certamen.
    const layout: LayoutItem[] = (['inicio', 'gala', 'certamen', 'resultados', 'ganadoras', 'camino', 'postula', 'candidatas', 'votacion', 'auspicios', 'director', 'preguntas'] as const).map((id) => ({ kind: 'section' as const, id }));
    const html = render(withDesign({ blocks: [], layout, sections: { gala: { navLabel: 'Noche final' } } }));
    expect(html.slice(html.indexOf('id="gala"'))).toMatch(/class="pgs-kicker-index">01</);
    expect(html.slice(html.indexOf('id="certamen"'))).toMatch(/class="pgs-kicker-index">02</);
    expect(html).toMatch(/<nav class="pgs-nav"[^>]*>.*Noche final/s);
  });

  it('una sección oculta no se dibuja ni sale en el menú', () => {
    const html = render(withDesign({ blocks: [], sections: { candidatas: { hidden: true }, director: { hidden: true } } }));
    expect(html).not.toContain('id="candidatas"');
    expect(html).not.toContain('href="#candidatas"');
    // El enlace de la portada a la dirección también se va con la sección.
    expect(html).not.toContain('href="#director"');
  });

  it('aplica textos, fondo y espaciado propios (y vacío = sin texto)', () => {
    const html = render(
      withDesign({
        blocks: [],
        sections: {
          candidatas: { kicker: 'Las reinas', title: 'Ellas son', titleAccent: 'nuestras candidatas', tone: 'deep', spacing: 'compact' },
          certamen: { tone: 'soft', spacing: 'airy', kicker: '' },
          gala: { tone: 'night' },
        },
      })
    );
    const candidatas = html.slice(html.indexOf('id="candidatas"'), html.indexOf('id="candidatas"') + 1500);
    expect(html).toMatch(/id="candidatas" class="pgs-section is-night is-deep is-compact"/);
    expect(candidatas).toContain('Las reinas');
    expect(candidatas).toContain('Ellas son <em>nuestras candidatas</em>');
    expect(html).toMatch(/id="certamen" class="pgs-section is-paper is-soft is-airy"/);
    expect(html.slice(html.indexOf('id="certamen"'), html.indexOf('id="certamen"') + 600)).not.toContain('El certamen<');
    // Un fondo oscuro no se le pone a una sección clara: queda la de fábrica.
    expect(html).toMatch(/id="gala" class="pgs-section is-paper"/);
  });

  it('las piezas globales se pueden apagar', () => {
    const html = render(withDesign({ blocks: [], options: { numbers: false, ribbon: false, whatsappFloat: false, countdown: false, pills: false } }));
    expect(html).not.toContain('class="pgs-kicker-index"');
    expect(html).not.toContain('class="pgs-ribbon"');
    expect(html).not.toContain('class="pgs-wa-float');
    expect(html).not.toContain('class="pgs-countdown');
    expect(html).not.toContain('class="pgs-pills');
  });

  it('el sitio público no lleva marcas del editor; el lienzo sí', () => {
    const site = withDesign({ blocks: [textBlock('b1')], layout: [{ kind: 'section', id: 'inicio' }, { kind: 'block', id: 'b1' }] });
    const publicHtml = render(site);
    expect(publicHtml).not.toContain('data-edit-key');
    expect(publicHtml).not.toContain('data-edit-field');
    const editorHtml = render(site, {});
    expect(editorHtml).toContain('data-edit-key="section:inicio"');
    expect(editorHtml).toContain('data-edit-key="section:certamen"');
    expect(editorHtml).toContain('data-edit-key="footer"');
    expect(editorHtml).toContain('data-edit-field="description"');
    expect(editorHtml).toContain('data-edit-field="titleAccent"');
  });

  it('con el estudio apagado no sale ningún bloque, esté donde esté', () => {
    const site = baseSite({ creative: pageantSiteDesignSchema.parse({ enabled: false, blocks: [textBlock('b1')], layout: [{ kind: 'block', id: 'b1' }] }) });
    expect(render(site)).not.toContain('data-block-id="b1"');
  });

  it('un diseño anterior sin orden se ve como siempre (estudio después de la portada)', () => {
    const site = baseSite({ creative: pageantSiteDesignSchema.parse({ enabled: true, placement: 'afterHero', blocks: [textBlock('b1')] }) });
    const html = render(site);
    const [inicio, b1, certamen] = order(html, 'id="inicio"', 'data-block-id="b1"', 'id="certamen"');
    expect(inicio).toBeLessThan(b1!);
    expect(b1).toBeLessThan(certamen!);
    expect(html).not.toContain('class="pgs-top-space"');
  });
});
