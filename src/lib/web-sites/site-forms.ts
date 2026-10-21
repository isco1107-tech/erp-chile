import type { DealTypeKey } from '@/modules/crm/schema';
import type { WebSiteBlock } from './blocks';
import { CONTACT_FORM_FIELDS, PURPOSE_LABELS, type FormConsent, type FormDestination, type FormField, type FormPurpose } from './forms';
import { publishedPages, type SiteDocument } from './site';

/**
 * Los formularios de un sitio, vengan de una sección «Formulario» o del
 * formulario del bloque «Contacto». Lo usan el servidor (para validar un envío
 * contra la versión PUBLICADA), la lista "qué falta" y el panel «Formularios»
 * del editor, que muestra dónde quedan los datos de cada uno.
 */

export interface SiteForm {
  /** Id del bloque: es la llave con la que el visitante envía el formulario. */
  blockId: string;
  source: 'form' | 'contact';
  /** Nombre del formulario para el equipo (el título de la sección o su propósito). */
  title: string;
  purpose: FormPurpose;
  destination: FormDestination;
  dealType: DealTypeKey;
  tag: string;
  consent: FormConsent;
  fields: FormField[];
}

export interface PlacedSiteForm extends SiteForm {
  pageId: string;
  pageTitle: string;
  pageSlug: string;
  /** La sección o su página no se publican. */
  hidden: boolean;
}

/** El formulario de un bloque, o `null` si el bloque no tiene uno activo. */
export function blockForm(block: WebSiteBlock): SiteForm | null {
  if (block.type === 'form') {
    return {
      blockId: block.id,
      source: 'form',
      title: block.heading.trim() || PURPOSE_LABELS[block.purpose],
      purpose: block.purpose,
      destination: block.destination,
      dealType: block.dealType,
      tag: block.inboxTag,
      consent: block.consent,
      fields: block.fields,
    };
  }
  if (block.type === 'contact' && block.showForm) {
    return {
      blockId: block.id,
      source: 'contact',
      title: block.heading.trim() || 'Contacto',
      purpose: 'contact',
      // El formulario de contacto no pide RUT ni fecha de nacimiento: nunca va a la academia.
      destination: block.destination === 'academy' ? 'inbox' : block.destination,
      dealType: block.dealType,
      tag: block.inboxTag,
      consent: 'notice',
      fields: CONTACT_FORM_FIELDS,
    };
  }
  return null;
}

/** Todos los formularios del sitio, página por página (incluidos los ocultos, marcados). */
export function siteForms(doc: SiteDocument): PlacedSiteForm[] {
  const published = new Set(publishedPages(doc).map((page) => page.id));
  return doc.pages.flatMap((page) =>
    page.blocks.flatMap((block) => {
      const form = blockForm(block);
      return form ? [{ ...form, pageId: page.id, pageTitle: page.title, pageSlug: page.slug, hidden: block.hidden || !published.has(page.id) }] : [];
    })
  );
}

/**
 * El formulario publicado y visible con ese id. Sin id (un navegador con la
 * página de antes, que mandaba solo nombre/correo/mensaje) se usa el primer
 * formulario de contacto, como antes.
 */
export function findPublishedForm(doc: SiteDocument, blockId?: string | null): PlacedSiteForm | null {
  const visible = siteForms(doc).filter((form) => !form.hidden);
  if (!blockId) return visible.find((form) => form.source === 'contact') ?? null;
  return visible.find((form) => form.blockId === blockId) ?? null;
}
