import { z } from 'zod';
import type { Project } from '@prisma/client';
import { pageantSiteDesignSchema, parsePageantSiteDesign, type PageantSiteDesign } from './pageant-site-design';
import { MAX_FOOTER_LINKS, menuLinkSchema } from '@/lib/web-sites/site';

const copyFields = [
  'publicTagline', 'publicDescription', 'directorName', 'directorRole', 'directorBio', 'sponsorExclusivityNote',
] as const;

export type PageantDraftValues = Record<typeof copyFields[number], string> & { publicSiteDesign: PageantSiteDesign };
export type PageantDraftField = keyof PageantDraftValues;
type Changes = Partial<PageantDraftValues>;

export const PAGEANT_DRAFT_LABELS: Record<PageantDraftField, string> = {
  publicSiteDesign: 'Diseño del sitio', publicTagline: 'Frase principal', publicDescription: 'Sobre el certamen',
  directorName: 'Nombre de dirección', directorRole: 'Cargo', directorBio: 'Presentación', sponsorExclusivityNote: 'Nota para sponsors',
};
export interface PageantDraftRecord {
  time: number;
  before: Changes;
  after: Changes;
}

export function pageantDraftScope(companyId: string, userId: string, projectId: string) {
  return 'aether:pageant-draft:v1:' + [companyId, userId, projectId].map(encodeURIComponent).join(':') + ':';
}

export function pageantDraftBase(project: Pick<Project, typeof copyFields[number] | 'publicSiteDesign'>): PageantDraftValues {
  return {
    publicSiteDesign: parsePageantSiteDesign(project.publicSiteDesign) ?? pageantSiteDesignSchema.parse({}),
    publicTagline: project.publicTagline ?? '', publicDescription: project.publicDescription ?? '',
    directorName: project.directorName ?? '', directorRole: project.directorRole ?? '', directorBio: project.directorBio ?? '',
    sponsorExclusivityNote: project.sponsorExclusivityNote ?? '',
  };
}

// PostgreSQL jsonb puede reordenar las claves de un objeto. El orden de capas y bloques sí importa.
function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, i) => equal(value, b[i]));
  if (!isObject(a) || !isObject(b)) return false;
  const keys = Object.keys(a).filter((key) => a[key] !== undefined);
  return keys.length === Object.keys(b).filter((key) => b[key] !== undefined).length &&
    keys.every((key) => Object.hasOwn(b, key) && equal(a[key], b[key]));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function makePageantDraft(base: PageantDraftValues, current: PageantDraftValues, time: number): PageantDraftRecord | null {
  const before: Changes = {};
  const after: Changes = {};
  for (const key of copyFields) {
    if (base[key] !== current[key]) {
      before[key] = base[key];
      after[key] = current[key];
    }
  }
  if (!equal(base.publicSiteDesign, current.publicSiteDesign)) {
    before.publicSiteDesign = base.publicSiteDesign;
    after.publicSiteDesign = current.publicSiteDesign;
  }
  return Object.keys(after).length ? { time, before, after } : null;
}

function readDesign(value: unknown) {
  const validated = parsePageantSiteDesign(value);
  if (validated || !isObject(value) || !isObject(value.footer)) return validated;
  // En mitad de la edición un enlace puede tener el rótulo escrito y la URL aún vacía.
  const links = z.array(menuLinkSchema).max(MAX_FOOTER_LINKS).safeParse(value.footer.links);
  if (!links.success) return;
  const rest = parsePageantSiteDesign({ ...value, footer: { ...value.footer, links: [] } });
  if (rest) return { ...rest, footer: { ...rest.footer, links: links.data } };
}

export function readPageantDraft(raw: string | null): PageantDraftRecord | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isObject(value) || typeof value.time !== 'number' || !Number.isFinite(value.time) ||
      !isObject(value.before) || !isObject(value.after)) return null;
    const before: Changes = {};
    const after: Changes = {};
    for (const key of copyFields) {
      if (!(key in value.before) && !(key in value.after)) continue;
      const oldText = value.before[key], newText = value.after[key];
      if (typeof oldText !== 'string' || typeof newText !== 'string') return null;
      before[key] = oldText;
      after[key] = newText;
    }
    if ('publicSiteDesign' in value.before || 'publicSiteDesign' in value.after) {
      before.publicSiteDesign = readDesign(value.before.publicSiteDesign);
      after.publicSiteDesign = readDesign(value.after.publicSiteDesign);
      if (!before.publicSiteDesign || !after.publicSiteDesign) return null;
    }
    return Object.keys(after).length ? { time: value.time, before, after } : null;
  } catch {
    return null;
  }
}

/** Compara solo los campos que la persona modificó. Cambios ajenos al borrador se conservan. */
export function pageantDraftFields(draft: PageantDraftRecord, current: PageantDraftValues) {
  const recoverable: PageantDraftField[] = [], conflicts: PageantDraftField[] = [];
  for (const key of ['publicSiteDesign', ...copyFields] as const) {
    if (!(key in draft.after) || equal(draft.after[key], current[key])) continue;
    if (equal(draft.before[key], current[key])) recoverable.push(key);
    else conflicts.push(key);
  }
  return { recoverable, conflicts };
}

export function pageantDraftSaved(draft: PageantDraftRecord, current: PageantDraftValues) {
  const fields = pageantDraftFields(draft, current);
  return !fields.recoverable.length && !fields.conflicts.length;
}
