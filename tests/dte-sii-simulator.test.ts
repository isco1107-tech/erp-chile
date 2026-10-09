import {
  isSimulatedTrackId,
  SIMULATION_NOTICE,
  simulateStatus,
  simulateSubmission,
} from '@/lib/chile/dte/sii-simulator';

const TED = '<TED version="1.0"><DD/></TED>';
const XML = `<DTE><Documento>${TED}</Documento></DTE>`;

describe('simulador del SII', () => {
  it('entrega un Track ID reconocible como simulado, con el folio', () => {
    const { trackId } = simulateSubmission({ folio: 42, tedXml: TED, signedXml: XML, now: new Date('2026-10-09T12:00:00Z') });
    expect(isSimulatedTrackId(trackId)).toBe(true);
    expect(trackId.endsWith('-42')).toBe(true);
  });

  it('un Track ID real del SII no se confunde con uno simulado', () => {
    expect(isSimulatedTrackId('0123456789')).toBe(false);
    expect(isSimulatedTrackId(null)).toBe(false);
  });

  it('no envía un documento sin timbre ni XML', () => {
    expect(() => simulateSubmission({ folio: 1, tedXml: null, signedXml: null })).toThrow(/CAF/);
  });

  it('acepta un XML con timbre y lo declara simulado', () => {
    const result = simulateStatus({ tedXml: TED, signedXml: XML });
    expect(result.status).toBe('ACCEPTED');
    expect(result.detail).toContain(SIMULATION_NOTICE);
  });

  it('rechaza si el XML enviado perdió el timbre', () => {
    const result = simulateStatus({ tedXml: TED, signedXml: '<DTE><Documento/></DTE>' });
    expect(result.status).toBe('REJECTED');
    expect(result.detail).toContain('TED');
  });
});
