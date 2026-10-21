import { z } from 'zod';
import { blocksSchema } from './blocks';
import { themeSchema } from './theme';

/** Composición adicional del micrositio; sus flujos nativos siguen funcionando. */
export const creativeSiteSchema = z.object({
  enabled: z.boolean().default(false),
  placement: z.enum(['before', 'after']).default('after'),
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
