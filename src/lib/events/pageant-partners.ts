import { z } from 'zod';

/**
 * Logos del pie de página del micrositio del certamen: organizadores e
 * instituciones que apoyan (una municipalidad, una universidad…), cada uno con
 * un enlace opcional que se abre al tocar el logo. Todo lo escribe el equipo
 * del certamen en el panel: nunca un logo ni una cuenta fijos en código.
 *
 * Reglas: los logos solo pueden venir de nuestro almacenamiento y de la carpeta
 * `pageant-partners/{companyId}/` (lo revisa la acción al guardar); el enlace
 * es siempre `https://` (una cuenta escrita como `@cuenta` se lleva a su
 * Instagram) y se valida igual al guardar y al leer.
 */

export const MAX_FOOTER_PARTNERS = 6;
export const FOOTER_PARTNERS_FOLDER = 'pageant-partners';

const INSTAGRAM_HANDLE = /^@?([A-Za-z0-9._]{1,30})$/;

/**
 * Enlace de un logo tal como se publica, o `null` si queda vacío. Acepta
 * `@cuenta` (Instagram), `instagram.com/cuenta`, `www.sitio.cl` o una URL
 * completa; rechaza (`undefined`) lo que no es una dirección `https` válida.
 */
export function normalizePartnerLink(input: string | null | undefined): string | null | undefined {
  const raw = (input ?? '').trim();
  if (!raw) return null;
  // Una cuenta suelta: con @, o una palabra sin punto de dominio.
  const handle = INSTAGRAM_HANDLE.exec(raw);
  if (handle && (raw.startsWith('@') || !raw.includes('.'))) {
    const name = handle[1];
    if (/^\.|\.$|\.\./.test(name)) return undefined;
    return `https://www.instagram.com/${name}/`;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return undefined;
  }
  if (url.protocol === 'http:') url.protocol = 'https:';
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.') || /\s/.test(raw)) return undefined;
  return url.toString();
}

/** Texto corto para mostrar el enlace en el panel («@cuenta» o el dominio). */
export function partnerLinkLabel(href: string | null): string | null {
  if (!href) return null;
  try {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'instagram.com') {
      const name = url.pathname.split('/').filter(Boolean)[0];
      return name ? `@${name}` : host;
    }
    return host;
  } catch {
    return null;
  }
}

const partnerSchema = z.object({
  id: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1, 'Cada logo necesita el nombre de la institución (se lee en voz alta y si la imagen no carga)').max(80, 'El nombre tiene un máximo de 80 caracteres'),
  logoUrl: z.string().trim().url('El logo no es una URL válida').max(1000),
  href: z
    .string()
    .trim()
    .max(300, 'El enlace tiene un máximo de 300 caracteres')
    .nullish()
    .transform((value, ctx) => {
      const link = normalizePartnerLink(value);
      if (link === undefined) {
        ctx.addIssue({ code: 'custom', message: 'El enlace de un logo debe ser una cuenta de Instagram (@cuenta) o una dirección web' });
        return z.NEVER;
      }
      return link;
    }),
});

/** Validación al guardar. */
export const footerPartnersSchema = z.object({
  title: z
    .string()
    .trim()
    .max(60, 'El título de los logos tiene un máximo de 60 caracteres')
    .nullish()
    .transform((value) => value || null),
  items: z.array(partnerSchema).max(MAX_FOOTER_PARTNERS, `Máximo ${MAX_FOOTER_PARTNERS} logos en el pie de página`).default([]),
});

export type FooterPartnersInput = z.input<typeof footerPartnersSchema>;
export type FooterPartners = z.output<typeof footerPartnersSchema>;
export type FooterPartner = FooterPartners['items'][number];

export const EMPTY_FOOTER_PARTNERS: FooterPartners = { title: null, items: [] };

/** Título por defecto sobre los logos cuando el equipo no escribe uno. */
export const DEFAULT_FOOTER_PARTNERS_TITLE = 'Con el apoyo de';

/**
 * Lectura tolerante de lo guardado (JSON de la base): un logo que ya no es
 * válido se descarta sin perder los demás ni romper la página pública.
 */
export function parseFooterPartners(value: unknown): FooterPartners {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return EMPTY_FOOTER_PARTNERS;
  const record = value as { title?: unknown; items?: unknown };
  const title = typeof record.title === 'string' && record.title.trim() ? record.title.trim().slice(0, 60) : null;
  const items: FooterPartner[] = [];
  for (const raw of Array.isArray(record.items) ? record.items : []) {
    const parsed = partnerSchema.safeParse(raw);
    if (parsed.success && items.length < MAX_FOOTER_PARTNERS) items.push(parsed.data);
  }
  return { title, items };
}
