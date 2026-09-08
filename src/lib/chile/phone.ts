/**
 * Normalización de teléfonos chilenos a formato internacional para WhatsApp
 * (`https://wa.me/<dígitos>`). A diferencia de `User.phone` (validado estricto
 * como E.164 en `src/lib/phone.ts`), el teléfono de una candidata se guarda
 * como texto libre (`Candidate.phone`, ver `src/modules/candidates/schema.ts`)
 * — puede venir con espacios, guiones, con o sin `+56`. Este helper intenta
 * salvar los casos razonables antes de rendirse.
 */
export type WhatsappPhoneResult = { ok: true; digits: string } | { ok: false; reason: string };

export function normalizeToWhatsappFormat(phone: string): WhatsappPhoneResult {
  const trimmed = phone.trim();
  if (!trimmed) return { ok: false, reason: 'No hay teléfono registrado' };

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return { ok: false, reason: 'El teléfono no contiene dígitos válidos' };

  // Ya viene con código de país chileno: 56 + 9 dígitos (celular) u 8 (fijo).
  if (digits.startsWith('56') && (digits.length === 11 || digits.length === 10)) {
    return { ok: true, digits };
  }

  // Celular chileno sin código de país: 9 dígitos empezando en 9 (ej. 912345678).
  if (digits.length === 9 && digits.startsWith('9')) {
    return { ok: true, digits: `56${digits}` };
  }

  // Celular escrito sin el 9 inicial (ej. 12345678, 8 dígitos) — se asume celular chileno.
  if (digits.length === 8) {
    return { ok: true, digits: `569${digits}` };
  }

  // Otro largo con código de país plausible (10-15 dígitos, no chileno): se deja tal cual.
  if (digits.length >= 10 && digits.length <= 15) {
    return { ok: true, digits };
  }

  return { ok: false, reason: 'Falta el código de país (+56) y el número no es reconocible' };
}

export function buildWhatsappLink(phone: string, message?: string): WhatsappPhoneResult & { url?: string } {
  const result = normalizeToWhatsappFormat(phone);
  if (!result.ok) return result;
  const url = message
    ? `https://wa.me/${result.digits}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${result.digits}`;
  return { ...result, url };
}
