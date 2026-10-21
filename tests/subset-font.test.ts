import { fetchGoogleFontSubset } from '@/lib/images/subset-font';

const CSS = "@font-face { src: url(https://fonts.gstatic.com/f.ttf) format('truetype'); }";

describe('fetchGoogleFontSubset', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith('https://fonts.googleapis.com') ? { ok: true, text: async () => CSS } : { ok: true, arrayBuffer: async () => new ArrayBuffer(8) },
    );
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('el espacio nunca va en un extremo de text= (Google lo recorta y la fuente quedaría sin él)', async () => {
    await fetchGoogleFontSubset('Montserrat', ' ab a', { weight: 700 });
    const text = decodeURIComponent(new URL(fetchMock.mock.calls[0]![0] as string).searchParams.get('text')!);
    expect(text).toContain(' ');
    expect(text.startsWith(' ')).toBe(false);
    expect(text.endsWith(' ')).toBe(false);
    expect(text.replace(' ', '')).toBe('ab');
  });

  it('pide el peso y la cursiva', async () => {
    await fetchGoogleFontSubset('Cormorant Garamond', 'xy', { weight: 500, italic: true });
    expect(fetchMock.mock.calls[0]![0]).toContain('family=Cormorant%20Garamond:ital,wght@1,500');
  });

  it('el mismo texto y variante se descarga una sola vez', async () => {
    await fetchGoogleFontSubset('Anton', 'cache-1');
    await fetchGoogleFontSubset('Anton', '1-ehcac');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('si Google no responde, null (el afiche usa la fuente de reserva) y no queda en caché', async () => {
    fetchMock.mockRejectedValueOnce(new Error('red'));
    expect(await fetchGoogleFontSubset('Anton', 'falla')).toBeNull();
    expect(await fetchGoogleFontSubset('Anton', 'falla')).not.toBeNull();
  });
});
