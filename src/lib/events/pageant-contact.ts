import { z } from 'zod';
import { normalizeToWhatsappFormat } from '@/lib/chile/phone';

/**
 * Contacto público de un certamen: el correo, WhatsApp e Instagram que ven
 * las postulantes (formulario de postulación, política de privacidad) y el
 * público (micrositio). Son de cada certamen — nunca valores fijos de la
 * plataforma — y se guardan en `Project` (`publicContactEmail`,
 * `publicWhatsapp`, `instagramHandle`). Un dato vacío se omite en pantalla.
 */

/** "@miss.temuco", "https://www.instagram.com/miss.temuco/" o "miss.temuco" → "miss.temuco". `null` si no es un usuario válido. */
export function normalizeInstagramHandle(input: string): string | null {
  let value = input.trim();
  const fromUrl = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#]+)/i.exec(value);
  if (fromUrl) value = fromUrl[1];
  value = value.replace(/^@+/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(value) ? value : null;
}

/** "+56 9 1234 5678" → "56912345678" (formato de wa.me). `null` si no es un número reconocible. */
export function normalizeWhatsappNumber(input: string): string | null {
  const result = normalizeToWhatsappFormat(input);
  return result.ok ? result.digits : null;
}

/** "56912345678" → "+56 9 1234 5678" para mostrar; otros largos se muestran con "+" y los dígitos. */
export function formatWhatsappNumber(digits: string): string {
  if (/^569\d{8}$/.test(digits)) return `+56 9 ${digits.slice(3, 7)} ${digits.slice(7)}`;
  if (/^56\d{9}$/.test(digits)) return `+56 ${digits.slice(2, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`;
  return `+${digits}`;
}

export interface PageantContact {
  email: string | null;
  whatsapp: { href: string; label: string } | null;
  instagram: { href: string; handle: string } | null;
}

/** Contacto listo para enlazar a partir de los campos guardados del proyecto. */
export function pageantContact(project: { publicContactEmail: string | null; publicWhatsapp: string | null; instagramHandle: string | null }): PageantContact {
  const digits = project.publicWhatsapp ? normalizeWhatsappNumber(project.publicWhatsapp) : null;
  const handle = project.instagramHandle ? normalizeInstagramHandle(project.instagramHandle) : null;
  return {
    email: project.publicContactEmail?.trim() || null,
    whatsapp: digits ? { href: `https://wa.me/${digits}`, label: formatWhatsappNumber(digits) } : null,
    instagram: handle ? { href: `https://instagram.com/${handle}`, handle } : null,
  };
}

/** Campos de formulario (Zod), compartidos por la convocatoria y el micrositio. Vacío → `null`.
 * Aceptan también `null`: un formulario que ya validó en el cliente reenvía su
 * resultado al servidor, y ahí un campo vacío llega como `null`. */
export const contactEmailField = z
  .string()
  .trim()
  .max(160)
  .nullish()
  .transform((value) => (value ? value.toLowerCase() : null))
  .refine((value) => value === null || z.email().safeParse(value).success, 'El correo de contacto no es válido');

export const contactWhatsappField = z
  .string()
  .trim()
  .max(30)
  .nullish()
  .transform((value, ctx) => {
    if (!value) return null;
    const digits = normalizeWhatsappNumber(value);
    if (!digits) {
      ctx.addIssue({ code: 'custom', message: 'El WhatsApp no es un número válido (ej. +56 9 1234 5678)' });
      return z.NEVER;
    }
    return digits;
  });

export const instagramHandleField = z
  .string()
  .trim()
  .max(120)
  .nullish()
  .transform((value, ctx) => {
    if (!value) return null;
    const handle = normalizeInstagramHandle(value);
    if (!handle) {
      ctx.addIssue({ code: 'custom', message: 'El Instagram no es un usuario válido (ej. @missuniversotemuco)' });
      return z.NEVER;
    }
    return handle;
  });
