import { matchesDeclaredAttachmentType } from '@/lib/security/file-signature';

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new Uint8Array(Buffer.from(text, 'latin1'));

describe('matchesDeclaredAttachmentType — el tipo sale de los bytes, no de file.type', () => {
  it('acepta firmas reales de imagen y PDF', () => {
    expect(matchesDeclaredAttachmentType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), 'image/png')).toBe(true);
    expect(matchesDeclaredAttachmentType(bytes(0xff, 0xd8, 0xff, 0xe0), 'image/jpeg')).toBe(true);
    expect(matchesDeclaredAttachmentType(ascii('GIF89a'), 'image/gif')).toBe(true);
    expect(matchesDeclaredAttachmentType(ascii('%PDF-1.7'), 'application/pdf')).toBe(true);
  });

  it('rechaza un tipo de imagen o PDF que no coincide con su contenido', () => {
    expect(matchesDeclaredAttachmentType(ascii('%PDF-1.7'), 'image/png')).toBe(false);
    expect(matchesDeclaredAttachmentType(bytes(0x4d, 0x5a, 0x90, 0x00), 'application/pdf')).toBe(false);
    expect(matchesDeclaredAttachmentType(ascii('<html><script>'), 'image/jpeg')).toBe(false);
    expect(matchesDeclaredAttachmentType(ascii('<svg onload=alert(1)>'), 'image/png')).toBe(false);
  });

  it('Office moderno y ZIP exigen contenedor ZIP; Office antiguo exige OLE2', () => {
    const zip = bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00);
    const ole = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
    expect(matchesDeclaredAttachmentType(zip, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true);
    expect(matchesDeclaredAttachmentType(zip, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(true);
    expect(matchesDeclaredAttachmentType(zip, 'application/zip')).toBe(true);
    expect(matchesDeclaredAttachmentType(ole, 'application/msword')).toBe(true);
    expect(matchesDeclaredAttachmentType(ole, 'application/vnd.ms-excel')).toBe(true);
    expect(matchesDeclaredAttachmentType(ole, 'application/zip')).toBe(false);
    expect(matchesDeclaredAttachmentType(bytes(0x4d, 0x5a, 0x90, 0x00), 'application/zip')).toBe(false);
    expect(matchesDeclaredAttachmentType(zip, 'application/msword')).toBe(false);
  });

  it('texto y CSV: aceptan texto real y rechazan binarios', () => {
    expect(matchesDeclaredAttachmentType(ascii('nombre;monto\nAna;1000\n'), 'text/csv')).toBe(true);
    expect(matchesDeclaredAttachmentType(new Uint8Array(Buffer.from('acción con ñ y tildes', 'utf8')), 'text/plain')).toBe(true);
    expect(matchesDeclaredAttachmentType(bytes(0x4d, 0x5a, 0x90, 0x00, 0x03), 'text/plain')).toBe(false);
    expect(matchesDeclaredAttachmentType(new Uint8Array(), 'text/plain')).toBe(false);
  });

  it('acepta el «Texto Unicode» (UTF-16 con BOM) que exporta Excel', () => {
    expect(matchesDeclaredAttachmentType(bytes(0xff, 0xfe, 0x41, 0x00, 0x42, 0x00), 'text/plain')).toBe(true);
  });

  it('un tipo declarado fuera de la lista nunca coincide (SVG, HTML, ejecutables)', () => {
    expect(matchesDeclaredAttachmentType(ascii('<svg xmlns="http://www.w3.org/2000/svg">'), 'image/svg+xml')).toBe(false);
    expect(matchesDeclaredAttachmentType(ascii('<html>'), 'text/html')).toBe(false);
    expect(matchesDeclaredAttachmentType(bytes(0x4d, 0x5a), 'application/x-msdownload')).toBe(false);
    expect(matchesDeclaredAttachmentType(ascii('x'), '')).toBe(false);
  });
});
