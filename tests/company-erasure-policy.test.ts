const delMock = jest.fn(async (_urls: string | string[]) => undefined);
jest.mock('@/lib/storage/blob', () => ({ del: (urls: string | string[]) => delMock(urls) }));

import {
  DELETE_CONFIRM_DAYS,
  DELETE_WAIT_DAYS,
  RESET_CODE_MINUTES,
  RUNNING_STALE_MS,
  checkConfirmation,
  erasureWindow,
  hashErasureCode,
  newErasureCode,
  normalizeErasureCode,
  whenLabel,
  type ErasureRequestState,
} from '@/lib/company-erasure/policy';
import { belongsToCompany, deleteStoredFiles, isStoredFileRef, splitRefs, storedFilePath, storedFilePattern } from '@/lib/company-erasure/files';

/**
 * Reglas de las órdenes `empresa.reiniciar.*` y `empresa.eliminar.*`: el código de un solo uso, cuándo se
 * puede confirmar y qué archivos son inequívocamente de la empresa. El flujo contra Postgres está en
 * `company-erasure-db.test.ts`.
 */

const NOW = new Date('2026-11-02T15:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

describe('código de un solo uso', () => {
  it('tiene 10 símbolos sin los que se confunden, en dos grupos', () => {
    for (let i = 0; i < 200; i += 1) expect(newErasureCode()).toMatch(/^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/);
  });

  it('no se repite', () => {
    expect(new Set(Array.from({ length: 500 }, () => newErasureCode())).size).toBe(500);
  });

  it('se compara sin importar mayúsculas, espacios ni guiones', () => {
    expect(normalizeErasureCode(' abcde-fghjk ')).toBe('ABCDEFGHJK');
    expect(hashErasureCode('abcde fghjk')).toBe(hashErasureCode('ABCDE-FGHJK'));
    expect(hashErasureCode('ABCDE-FGHJK')).not.toBe(hashErasureCode('ABCDE-FGHJL'));
  });

  it('en la base solo vive el SHA-256, nunca el código', () => {
    const hash = hashErasureCode('ABCDE-FGHJK');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('ABCDE');
  });
});

describe('ventanas de tiempo', () => {
  it('reiniciar: se puede confirmar de inmediato y el código vale 30 minutos', () => {
    const { notBefore, expiresAt } = erasureWindow('RESET', NOW);
    expect(notBefore).toEqual(NOW);
    expect(expiresAt.getTime() - NOW.getTime()).toBe(RESET_CODE_MINUTES * 60_000);
  });

  it('eliminar: hay que esperar 7 días y después hay otros 7 para confirmar', () => {
    const { notBefore, expiresAt } = erasureWindow('DELETE', NOW);
    expect(notBefore.getTime() - NOW.getTime()).toBe(DELETE_WAIT_DAYS * DAY);
    expect(expiresAt.getTime() - notBefore.getTime()).toBe(DELETE_CONFIRM_DAYS * DAY);
    expect(DELETE_WAIT_DAYS).toBe(7);
  });
});

describe('cuándo se puede confirmar', () => {
  const pending = (kind: 'RESET' | 'DELETE'): ErasureRequestState => ({ status: 'PENDING', startedAt: null, ...erasureWindow(kind, NOW) });

  it('reiniciar: vale ahora, y deja de valer pasados 30 minutos', () => {
    expect(checkConfirmation(pending('RESET'), NOW)).toEqual({ ok: true });
    expect(checkConfirmation(pending('RESET'), new Date(NOW.getTime() + 29 * 60_000))).toEqual({ ok: true });
    expect(checkConfirmation(pending('RESET'), new Date(NOW.getTime() + 31 * 60_000))).toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it('eliminar: no antes de los 7 días, sí en la ventana, no después', () => {
    const request = pending('DELETE');
    expect(checkConfirmation(request, NOW)).toEqual({ ok: false, reason: 'NOT_YET' });
    expect(checkConfirmation(request, new Date(NOW.getTime() + 6 * DAY + 23 * 3_600_000))).toEqual({ ok: false, reason: 'NOT_YET' });
    expect(checkConfirmation(request, new Date(NOW.getTime() + 7 * DAY))).toEqual({ ok: true });
    expect(checkConfirmation(request, new Date(NOW.getTime() + 13 * DAY))).toEqual({ ok: true });
    expect(checkConfirmation(request, new Date(NOW.getTime() + 15 * DAY))).toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it('una solicitud hecha o cancelada no se vuelve a ejecutar', () => {
    expect(checkConfirmation({ ...pending('RESET'), status: 'DONE' }, NOW)).toEqual({ ok: false, reason: 'DONE' });
    expect(checkConfirmation({ ...pending('RESET'), status: 'CANCELLED' }, NOW)).toEqual({ ok: false, reason: 'CANCELLED' });
  });

  it('«DONE» manda sobre todo: una orden reentregada después de vencer responde que ya estaba hecha', () => {
    const done: ErasureRequestState = { ...pending('DELETE'), status: 'DONE' };
    expect(checkConfirmation(done, new Date(NOW.getTime() + 60 * DAY))).toEqual({ ok: false, reason: 'DONE' });
  });

  it('una ejecución en curso bloquea, salvo que lleve más de 15 minutos (la función murió)', () => {
    const running = (ago: number): ErasureRequestState => ({ ...pending('RESET'), status: 'RUNNING', startedAt: new Date(NOW.getTime() - ago) });
    expect(checkConfirmation(running(60_000), NOW)).toEqual({ ok: false, reason: 'RUNNING' });
    expect(checkConfirmation(running(RUNNING_STALE_MS - 1), NOW)).toEqual({ ok: false, reason: 'RUNNING' });
    expect(checkConfirmation({ ...running(RUNNING_STALE_MS + 1), expiresAt: new Date(NOW.getTime() + 60_000) }, NOW)).toEqual({ ok: true });
  });

  it('la fecha de los mensajes es la de Chile', () => {
    expect(whenLabel(new Date('2026-11-02T15:00:00.000Z'))).toMatch(/lunes, 2 de noviembre de 2026,? 12:00/);
  });
});

describe('archivos de la empresa', () => {
  const COMPANY = 'cmvo1234companyaaaa';
  const OTHER = 'cmvo9999companybbbb';
  const blob = (path: string) => `https://abc123.public.blob.vercel-storage.com/${path}`;

  beforeEach(() => {
    delete process.env.R2_PUBLIC_URL;
    delMock.mockClear();
    delMock.mockResolvedValue(undefined);
  });

  it('reconoce el almacenamiento antiguo, el de R2 y las referencias privadas; nada más', () => {
    process.env.R2_PUBLIC_URL = 'https://files.aether.test/';
    expect(isStoredFileRef(blob(`products/${COMPANY}/a.jpg`))).toBe(true);
    expect(isStoredFileRef(`https://files.aether.test/products/${COMPANY}/a.jpg`)).toBe(true);
    expect(isStoredFileRef(`r2private:///candidates/${COMPANY}/documents/x.pdf`)).toBe(true);
    expect(isStoredFileRef('https://instagram.com/aether')).toBe(false);
    expect(isStoredFileRef('http://abc.public.blob.vercel-storage.com/x.jpg')).toBe(false);
    expect(isStoredFileRef('https://evil.test/abc.public.blob.vercel-storage.com/x.jpg')).toBe(false);
    expect(isStoredFileRef('no es una dirección')).toBe(false);
  });

  it('solo es de la empresa si su id va en la segunda carpeta', () => {
    expect(belongsToCompany(blob(`products/${COMPANY}/a.jpg`), COMPANY)).toBe(true);
    expect(belongsToCompany(blob(`candidates/${COMPANY}/documents/c1-doc.pdf`), COMPANY)).toBe(true);
    expect(belongsToCompany(`r2private:///candidates/${COMPANY}/documents/c1-doc.pdf`, COMPANY)).toBe(true);
    expect(belongsToCompany(blob(`products/${OTHER}/a.jpg`), COMPANY)).toBe(false);
    expect(belongsToCompany(blob('branding/logo-compartido.png'), COMPANY)).toBe(false);
    // El id suelto en otro lugar de la ruta no cuenta: ni como archivo ni como nombre.
    expect(belongsToCompany(blob(`products/${OTHER}/${COMPANY}.jpg`), COMPANY)).toBe(false);
    expect(belongsToCompany(blob(`${COMPANY}/a.jpg`), COMPANY)).toBe(false);
    expect(belongsToCompany(blob(`products/${COMPANY}/../${OTHER}/a.jpg`), COMPANY)).toBe(false);
  });

  it('lee la ruta del objeto con sus caracteres escapados', () => {
    expect(storedFilePath(blob(`products/${COMPANY}/foto%20grande.jpg`))).toBe(`products/${COMPANY}/foto grande.jpg`);
    expect(storedFilePath('https://instagram.com/aether')).toBeNull();
  });

  it('separa lo propio de lo ajeno, sin repetir ni mezclar otros dominios', () => {
    const refs = [
      blob(`products/${COMPANY}/a.jpg`),
      blob(`products/${COMPANY}/a.jpg`),
      blob(`products/${OTHER}/b.jpg`),
      'https://instagram.com/aether',
    ];
    expect(splitRefs(refs, COMPANY)).toEqual({ own: [blob(`products/${COMPANY}/a.jpg`)], foreign: [blob(`products/${OTHER}/b.jpg`)] });
  });

  it('el patrón de búsqueda del SQL es de nuestro almacenamiento y se corta en comillas, espacios y paréntesis', () => {
    process.env.R2_PUBLIC_URL = 'https://files.aether.test';
    const pattern = new RegExp(storedFilePattern().replace(/\[:space:\]/g, '\\s'), 'g');
    const text = `{"imageUrl":"${blob(`products/${COMPANY}/a.jpg`)}","link":"https://instagram.com/x","other":"https://files.aether.test/pageant-site/${COMPANY}/p.png"} url(${blob(`web-sites/${COMPANY}/s/1.webp`)}) r2private:///candidates/${COMPANY}/documents/d.pdf`;
    const found = [...text.matchAll(pattern)].map((m) => m[1]);
    expect(found).toEqual([
      blob(`products/${COMPANY}/a.jpg`),
      `https://files.aether.test/pageant-site/${COMPANY}/p.png`,
      blob(`web-sites/${COMPANY}/s/1.webp`),
      `r2private:///candidates/${COMPANY}/documents/d.pdf`,
    ]);
  });

  describe('borrado', () => {
    it('borra en lotes y cuenta lo borrado', async () => {
      const refs = Array.from({ length: 120 }, (_, i) => blob(`products/${COMPANY}/${i}.jpg`));
      const result = await deleteStoredFiles(refs);
      expect(result).toEqual({ requested: 120, deleted: 120, failed: [] });
      expect(delMock).toHaveBeenCalledTimes(3);
    });

    it('si un lote falla, reintenta de a uno y dice cuáles no se pudieron borrar (sin lanzar)', async () => {
      const bad = blob(`products/${COMPANY}/malo.jpg`);
      delMock.mockImplementation(async (urls) => {
        const list = Array.isArray(urls) ? urls : [urls];
        if (list.includes(bad)) throw new Error('R2 no responde');
      });
      const result = await deleteStoredFiles([blob(`products/${COMPANY}/1.jpg`), bad, blob(`products/${COMPANY}/2.jpg`)]);
      expect(result).toEqual({ requested: 3, deleted: 2, failed: [bad] });
    });

    it('sin archivos no llama al almacenamiento', async () => {
      expect(await deleteStoredFiles([])).toEqual({ requested: 0, deleted: 0, failed: [] });
      expect(delMock).not.toHaveBeenCalled();
    });
  });
});
