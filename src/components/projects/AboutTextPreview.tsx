'use client';

import { useMemo } from 'react';
import { PAGEANT_FONT_CLASSES } from '@/components/public/pageant/fonts';
import { AboutHeading, AboutProse } from '@/components/public/pageant/parts';
import { PAGEANT_SITE_STYLES } from '@/components/public/pageant/styles';
import { SITE_FONT_CLASSES } from '@/components/web-sites/site-fonts';
import { splitDescription, splitPageantTitle } from '@/lib/events/pageant-site';
import { PAGEANT_TYPOGRAPHY_CLASS, pageantTypographyCss, type PageantTypography } from '@/lib/events/pageant-typography';
import type { PublicAccentKey } from '@/modules/projects/schema';

/**
 * «Así se ve en el sitio»: la sección «El certamen» con los MISMOS componentes,
 * estilos y tipografía elegida del micrositio, mientras se escribe. Todo el CSS
 * del sitio está acotado a `.pgs`, así no toca el resto del panel.
 */
export function AboutTextPreview({ name, description, typography, accent }: { name: string; description: string; typography: PageantTypography; accent: PublicAccentKey }) {
  const title = useMemo(() => splitPageantTitle(name), [name]);
  const paragraphs = useMemo(() => splitDescription(description), [description]);
  const typographyCss = useMemo(() => pageantTypographyCss(typography), [typography]);

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <p className="border-b border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">Así se ve en el sitio</p>
      <div className={`pgs ${PAGEANT_FONT_CLASSES} ${SITE_FONT_CLASSES} ${PAGEANT_TYPOGRAPHY_CLASS}`} data-accent={accent} style={{ minHeight: 0 }}>
        <style>{PAGEANT_SITE_STYLES}</style>
        {typographyCss && <style>{typographyCss}</style>}
        <div className="pgs-section is-paper" style={{ padding: 'clamp(1.25rem, 3vw, 2.25rem)' }}>
          <AboutHeading title={title} index="01" />
          {paragraphs.length > 0 ? (
            <div style={{ marginTop: '1.75rem' }}>
              <AboutProse paragraphs={paragraphs} />
            </div>
          ) : (
            <p style={{ marginTop: '1.5rem', opacity: 0.6 }}>Escribe el texto arriba para verlo aquí.</p>
          )}
        </div>
      </div>
    </div>
  );
}
