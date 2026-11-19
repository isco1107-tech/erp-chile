import { z } from 'zod';
import { blocksSchema } from './blocks';
import { themeSchema } from './theme';

export const CREATIVE_PLACEMENTS = ['before', 'afterHero', 'after'] as const;
export type CreativePlacement = (typeof CREATIVE_PLACEMENTS)[number];
export const CREATIVE_PLACEMENT_LABELS: Record<CreativePlacement, string> = {
  before: 'Antes del sitio principal',
  afterHero: 'Después de la portada',
  after: 'Al final del sitio',
};

/** Composición adicional del micrositio; sus flujos nativos siguen funcionando. */
export const creativeSiteSchema = z.object({
  enabled: z.boolean().default(false),
  /**
   * Dónde va la composición: antes del sitio principal, justo después de su
   * portada (la historia y los auspiciadores quedan arriba, antes de los
   * formularios) o al final, después del pie.
   */
  placement: z.enum(CREATIVE_PLACEMENTS).default('after').catch('after'),
  blocks: blocksSchema.default([]),
  theme: themeSchema.prefault({}),
}).superRefine((value, ctx) => {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 600 * 1024) ctx.addIssue({ code: 'custom', message: 'El diseño es demasiado grande. Reduce las secciones o el contenido de los lienzos.' });
  value.blocks.forEach((block, i) => {
    if (block.type === 'contact' && block.showForm) ctx.addIssue({ code: 'custom', path: ['blocks', i, 'showForm'], message: 'Usa el formulario nativo del sitio; esta sección de contacto solo muestra enlaces.' });
    if (block.type === 'form') ctx.addIssue({ code: 'custom', path: ['blocks', i, 'type'], message: 'Usa el formulario nativo del sitio: los formularios a medida son de los sitios web.' });
  });
});
export type CreativeSite = z.infer<typeof creativeSiteSchema>;
export function parseCreativeSite(value: unknown): CreativeSite | undefined {
  if (value == null) return undefined;
  const parsed = creativeSiteSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
