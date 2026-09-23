import { promissoryNoteCreateSchema, promissoryNoteUpdateSchema } from '@/modules/promissory-notes/schema';

/**
 * SEG-04: `documentUrl` no validaba nada — cualquier string pasaba, incluida
 * una URL `javascript:` que `PromissoryNoteForm.tsx` renderiza como
 * `<a href={documentUrl}>`. Se le agregó el mismo allowlist de host que ya
 * usa `documentCreateSchema.fileUrl` de candidatas. La primera pasada de este
 * fix solo tocó `promissoryNoteShape` (create): `promissoryNoteUpdateShape`
 * seguía sin protección porque tenía su propia copia literal del campo — un
 * pagaré se podía crear con `documentUrl` vacío y luego editar con cualquier
 * URL, evitando el allowlist por completo. Detectado en revisión de
 * seguridad antes de cerrar T04; estos tests fijan que ambos schemas queden
 * cubiertos.
 */

const VALID_BASE = {
  contactId: 'contact-1',
  amount: 100000,
  issueDate: '2026-01-01',
  dueDate: '2026-06-01',
};

describe('promissoryNoteCreateSchema — documentUrl', () => {
  it('acepta una URL de storage permitida', () => {
    const result = promissoryNoteCreateSchema.safeParse({
      ...VALID_BASE,
      documentUrl: 'https://abc.public.blob.vercel-storage.com/pagare.pdf',
    });
    expect(result.success).toBe(true);
  });

  it('acepta omitir documentUrl (opcional)', () => {
    const result = promissoryNoteCreateSchema.safeParse(VALID_BASE);
    expect(result.success).toBe(true);
  });

  it('rechaza una URL javascript: (inyección en el <a href> del formulario)', () => {
    const result = promissoryNoteCreateSchema.safeParse({ ...VALID_BASE, documentUrl: 'javascript:alert(1)' });
    expect(result.success).toBe(false);
  });

  it('rechaza un host de storage no permitido', () => {
    const result = promissoryNoteCreateSchema.safeParse({ ...VALID_BASE, documentUrl: 'https://evil.com/pagare.pdf' });
    expect(result.success).toBe(false);
  });
});

describe('promissoryNoteUpdateSchema — documentUrl (regresión: antes solo el create shape estaba protegido)', () => {
  it('acepta una URL de storage permitida', () => {
    const result = promissoryNoteUpdateSchema.safeParse({
      documentUrl: 'https://abc.public.blob.vercel-storage.com/pagare-firmado.pdf',
    });
    expect(result.success).toBe(true);
  });

  it('rechaza una URL javascript: en la edición, no solo en la creación', () => {
    const result = promissoryNoteUpdateSchema.safeParse({ documentUrl: 'javascript:alert(1)' });
    expect(result.success).toBe(false);
  });

  it('rechaza un host de storage no permitido en la edición', () => {
    const result = promissoryNoteUpdateSchema.safeParse({ documentUrl: 'https://evil.com/pagare.pdf' });
    expect(result.success).toBe(false);
  });
});
