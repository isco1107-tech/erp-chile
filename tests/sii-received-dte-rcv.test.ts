import crypto from 'crypto';
import { buildDd, signDd } from '@/lib/chile/dte/ted';
import {
  decodeDteFile,
  parseReceivedDtes,
  purchaseDraftLines,
  purchaseTypeForCode,
  ReceivedDteParseError,
  taxReference,
} from '@/lib/chile/dte/received';
import { claimDaysLeft, claimDeadline, receivedDteLabel } from '@/lib/chile/dte/received-meta';
import { parseRcvCsv, purchaseRcvCode, rcvKey, reconcileRcv, RcvParseError, type ErpRcvEntry } from '@/lib/chile/rcv';
import { rutKey } from '@/lib/chile/rut';

/**
 * Ola 5 · SII: bandeja de DTE recibidos (lectura + timbre) y cuadratura del
 * Registro de Compras y Ventas.
 *
 * El timbre se prueba con un par de llaves generado en el momento, armado
 * igual que un CAF real (`<RSAPK>` con módulo y exponente en base64): así se
 * ejercita la misma ruta de verificación que corre con un DTE de proveedor.
 */

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 });
const SK_PEM = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
const jwk = publicKey.export({ format: 'jwk' });
const toB64 = (value: string | undefined) => Buffer.from(value ?? '', 'base64url').toString('base64');

const ISSUER = '76.123.456-0';
const RECEIVER = '96.555.444-0';

function cafBlock(from = 1, to = 500, rut = '76123456-0'): string {
  return `<CAF version="1.0"><DA><RE>${rut}</RE><RS>FERRETERIA MUÑOZ SPA</RS><TD>33</TD><RNG><D>${from}</D><H>${to}</H></RNG><FA>2026-01-15</FA><RSAPK><M>${toB64(jwk.n)}</M><E>${toB64(jwk.e)}</E></RSAPK><IDK>100</IDK></DA><FRMA algoritmo="SHA1withRSA">FIRMA_SII==</FRMA></CAF>`;
}

interface FixtureOptions {
  folio?: number;
  total?: number;
  tamperDdTotal?: number;
  indentDd?: boolean;
  withTed?: boolean;
  siiCode?: number;
  reference?: string;
  receiver?: string;
}

function makeDte(options: FixtureOptions = {}): string {
  const { folio = 120, total = 119_000, siiCode = 33, withTed = true, receiver = RECEIVER } = options;
  const dd = buildDd({
    issuerRut: '76123456-0',
    siiCode,
    folio,
    issueDate: new Date('2026-09-10T15:00:00Z'),
    receiverRut: receiver.replace(/\./g, ''),
    receiverName: 'PRODUCTORA AÑO NUEVO',
    totalAmount: options.tamperDdTotal ?? total,
    firstItemDescription: 'Cemento',
    cafBlockXml: cafBlock(),
    privateKeyPem: SK_PEM,
    stampedAt: new Date('2026-09-10T15:00:00Z'),
  });
  // La firma siempre se calcula sobre el DD original; el adulterado se inserta después.
  const signature = signDd(
    options.tamperDdTotal !== undefined
      ? dd.replace(`<MNT>${options.tamperDdTotal}</MNT>`, `<MNT>${total}</MNT>`)
      : dd,
    SK_PEM
  );
  const ddInFile = options.indentDd ? dd.replace(/></g, '>\n      <') : dd;
  const ted = withTed ? `<TED version="1.0">${ddInFile}<FRMT algoritmo="SHA1withRSA">${signature}</FRMT></TED>` : '';
  return `<DTE version="1.0"><Documento ID="F${folio}T${siiCode}"><Encabezado><IdDoc><TipoDTE>${siiCode}</TipoDTE><Folio>${folio}</Folio><FchEmis>2026-09-10</FchEmis><FchVenc>2026-10-10</FchVenc></IdDoc><Emisor><RUTEmisor>76123456-0</RUTEmisor><RznSoc>FERRETERIA MU&#209;OZ &amp; CIA SPA</RznSoc><GiroEmis>Ferretería</GiroEmis></Emisor><Receptor><RUTRecep>${receiver.replace(/\./g, '')}</RUTRecep><RznSocRecep>PRODUCTORA AÑO NUEVO</RznSocRecep></Receptor><Totales><MntNeto>90000</MntNeto><MntExe>10000</MntExe><TasaIVA>19</TasaIVA><IVA>17100</IVA><MntTotal>${total}</MntTotal></Totales></Encabezado><Detalle><NroLinDet>1</NroLinDet><NmbItem>Cemento 25 kg</NmbItem><QtyItem>10</QtyItem><UnmdItem>SACO</UnmdItem><PrcItem>9000</PrcItem><MontoItem>90000</MontoItem></Detalle><Detalle><NroLinDet>2</NroLinDet><IndExe>1</IndExe><NmbItem>Flete</NmbItem><QtyItem>1.5</QtyItem><PrcItem>6666.67</PrcItem><MontoItem>10000</MontoItem></Detalle>${options.reference ?? ''}${ted}</Documento></DTE>`;
}

function envio(...dtes: string[]): Buffer {
  const xml = `<?xml version="1.0" encoding="ISO-8859-1"?>\n<EnvioDTE xmlns="http://www.sii.cl/SiiDte" version="1.0"><SetDTE ID="SetDoc"><Caratula version="1.0"><RutEmisor>76123456-0</RutEmisor></Caratula>${dtes.join('\n')}</SetDTE><Signature>...</Signature></EnvioDTE>`;
  return Buffer.from(xml, 'latin1');
}

describe('DTE recibidos: lectura del XML del proveedor', () => {
  it('lee un EnvioDTE en ISO-8859-1 con tildes, entidades, líneas y totales', () => {
    const [dte] = parseReceivedDtes(decodeDteFile(envio(makeDte())));
    expect(dte.siiCode).toBe(33);
    expect(dte.folio).toBe(120);
    expect(dte.issueDate).toBe('2026-09-10');
    expect(dte.dueDate).toBe('2026-10-10');
    expect(dte.issuerRut).toBe(ISSUER);
    expect(dte.receiverRut).toBe(RECEIVER);
    expect(dte.issuerName).toBe('FERRETERIA MUÑOZ & CIA SPA');
    expect(dte.issuerGiro).toBe('Ferretería');
    expect([dte.netAmount, dte.exemptAmount, dte.ivaAmount, dte.totalAmount]).toEqual([90_000, 10_000, 17_100, 119_000]);
    expect(dte.lines).toHaveLength(2);
    expect(dte.lines[0]).toMatchObject({ name: 'Cemento 25 kg', quantity: 10, unit: 'SACO', unitPrice: 9000, amount: 90_000, exempt: false });
    expect(dte.lines[1]).toMatchObject({ name: 'Flete', exempt: true, amount: 10_000 });
    expect(dte.xml.startsWith('<DTE')).toBe(true);
  });

  it('lee varios DTE del mismo sobre', () => {
    const dtes = parseReceivedDtes(decodeDteFile(envio(makeDte({ folio: 120 }), makeDte({ folio: 121 }))));
    expect(dtes.map((dte) => dte.folio)).toEqual([120, 121]);
  });

  it('rechaza un archivo sin DTE con un mensaje accionable', () => {
    expect(() => parseReceivedDtes('<RespuestaDTE><Resultado/></RespuestaDTE>')).toThrow(ReceivedDteParseError);
    expect(() => parseReceivedDtes('<RespuestaDTE/>')).toThrow(/EnvioDTE/);
  });

  it('decodifica UTF-8 cuando el archivo lo es', () => {
    const utf8 = Buffer.from('<?xml version="1.0" encoding="UTF-8"?><x>Muñoz</x>', 'utf8');
    expect(decodeDteFile(utf8)).toContain('Muñoz');
    const latinWithoutDeclaration = Buffer.from('<x>Muñoz</x>', 'latin1');
    expect(decodeDteFile(latinWithoutDeclaration)).toContain('Muñoz');
  });

  it('lee las referencias de una nota de crédito', () => {
    const reference = '<Referencia><NroLinRef>1</NroLinRef><TpoDocRef>33</TpoDocRef><FolioRef>98</FolioRef><FchRef>2026-09-01</FchRef><CodRef>3</CodRef><RazonRef>Corrige montos</RazonRef></Referencia>';
    const oc = '<Referencia><NroLinRef>2</NroLinRef><TpoDocRef>801</TpoDocRef><FolioRef>OC-55</FolioRef></Referencia>';
    const [dte] = parseReceivedDtes(makeDte({ siiCode: 61, reference: oc + reference }));
    expect(dte.references).toHaveLength(2);
    expect(taxReference(dte.references)).toMatchObject({ docType: '33', folio: '98', code: 3, reason: 'Corrige montos' });
  });
});

describe('DTE recibidos: timbre electrónico', () => {
  it('valida el timbre de un documento íntegro', () => {
    const [dte] = parseReceivedDtes(decodeDteFile(envio(makeDte())));
    expect(dte.tedStatus).toBe('VALID');
    expect(dte.tedIssue).toBeNull();
  });

  it('valida también cuando el emisor indentó el DD', () => {
    const [dte] = parseReceivedDtes(makeDte({ indentDd: true }));
    expect(dte.tedStatus).toBe('VALID');
  });

  it('detecta un timbre cuyo monto no coincide con el documento', () => {
    const [dte] = parseReceivedDtes(makeDte({ tamperDdTotal: 9_999 }));
    expect(dte.tedStatus).toBe('INVALID');
    expect(dte.tedIssue).toMatch(/monto total/);
  });

  it('detecta un documento alterado después de timbrar', () => {
    // El total del documento y del DD dicen lo mismo, pero no es lo que se firmó.
    const original = makeDte();
    const tampered = original.replace(/<MNT>119000<\/MNT>/, '<MNT>1190</MNT>').replace(/<MntTotal>119000<\/MntTotal>/, '<MntTotal>1190</MntTotal>');
    const [dte] = parseReceivedDtes(tampered);
    expect(dte.tedStatus).toBe('INVALID');
    expect(dte.tedIssue).toMatch(/firma/);
  });

  it('detecta un folio fuera del rango del CAF', () => {
    const [dte] = parseReceivedDtes(makeDte({ folio: 900 }));
    expect(dte.tedStatus).toBe('INVALID');
    expect(dte.tedIssue).toMatch(/rango/);
  });

  it('marca como MISSING un documento sin timbre', () => {
    const [dte] = parseReceivedDtes(makeDte({ withTed: false }));
    expect(dte.tedStatus).toBe('MISSING');
  });
});

describe('DTE recibidos: registro como compra', () => {
  it('traduce el tipo del SII al tipo de compra del ERP', () => {
    expect(purchaseTypeForCode(33)).toBe('FACTURA');
    expect(purchaseTypeForCode(34)).toBe('FACTURA');
    expect(purchaseTypeForCode(39)).toBe('BOLETA');
    expect(purchaseTypeForCode(52)).toBe('GUIA_DESPACHO');
    expect(purchaseTypeForCode(56)).toBe('NOTA_DEBITO');
    expect(purchaseTypeForCode(61)).toBe('NOTA_CREDITO');
    expect(purchaseTypeForCode(43)).toBe('OTRO');
    expect(receivedDteLabel(33)).toBe('Factura electrónica');
    expect(receivedDteLabel(999)).toBe('Documento tipo 999');
  });

  it('arma líneas que suman exactamente lo que cobró el proveedor', () => {
    const [dte] = parseReceivedDtes(makeDte());
    const lines = purchaseDraftLines(dte);
    expect(lines[0]).toEqual({ description: 'Cemento 25 kg', quantity: 10, unitCost: 9000, isExempt: false });
    // 1,5 × 6.666,67 no da un entero: se registra el monto de la línea completo.
    expect(lines[1]).toEqual({ description: 'Flete (1,5)', quantity: 1, unitCost: 10_000, isExempt: true });
    const net = lines.filter((line) => !line.isExempt).reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
    const exempt = lines.filter((line) => line.isExempt).reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
    expect([net, exempt]).toEqual([dte.netAmount, dte.exemptAmount]);
  });

  it('usa los totales cuando el documento no trae detalle con montos', () => {
    const lines = purchaseDraftLines({ siiCode: 61, lines: [], netAmount: 5000, exemptAmount: 0 });
    expect(lines).toEqual([{ description: 'Monto neto según DTE', quantity: 1, unitCost: 5000, isExempt: false }]);
  });

  it('una factura exenta registra todas sus líneas como exentas', () => {
    const lines = purchaseDraftLines({
      siiCode: 34,
      netAmount: 0,
      exemptAmount: 3000,
      lines: [{ lineNumber: 1, name: 'Asesoría', description: null, quantity: 1, unit: null, unitPrice: 3000, discount: 0, amount: 3000, exempt: false }],
    });
    expect(lines[0].isExempt).toBe(true);
  });

  it('calcula el plazo de 8 días para reclamar', () => {
    const receivedAt = new Date('2026-09-10T12:00:00Z');
    expect(claimDeadline(receivedAt).toISOString()).toBe('2026-09-18T12:00:00.000Z');
    expect(claimDaysLeft(receivedAt, receivedAt)).toBe(8);
    expect(claimDaysLeft(receivedAt, new Date('2026-09-11T12:00:00Z'))).toBe(7);
    expect(claimDaysLeft(receivedAt, new Date('2026-09-18T02:00:00Z'))).toBe(1);
    expect(claimDaysLeft(receivedAt, new Date('2026-09-18T13:00:00Z'))).toBe(-1);
    expect(claimDaysLeft(receivedAt, new Date('2026-09-19T13:00:00Z'))).toBe(-2);
  });
});

const RCV_COMPRAS = [
  'Nro;Tipo Doc;Tipo Compra;RUT Proveedor;Razon Social;Folio;Fecha Docto;Fecha Recepcion;Fecha Acuse;Monto Exento;Monto Neto;Monto IVA Recuperable;Monto Iva No Recuperable;Codigo IVA No Rec.;Monto Total;Monto Neto Activo Fijo',
  '1;33;Del Giro;76123456-0;FERRETERIA MUÑOZ SPA;120;10/09/2026;10/09/2026 15:02:11;;10000;90000;17100;;;117100;',
  '2;33;Del Giro;77888999-4;OFICINAS DEL SUR LTDA;4455;12/09/2026;12/09/2026 09:12:00;;0;50000;9500;;;59500;',
  '3;61;Del Giro;76123456-0;FERRETERIA MUÑOZ SPA;15;20/09/2026;20/09/2026 10:00:00;;0;10000;1900;;;11900;',
  '4;34;Del Giro;011111111-1;ASESORIAS PEREZ;77;21/09/2026;21/09/2026 10:00:00;;30000;0;0;;;30000;',
  ';;;;;;;;;;;;;;;',
].join('\n');

describe('RCV: lectura del detalle descargado del SII', () => {
  it('lee el CSV con separador punto y coma, ubicando columnas por encabezado', () => {
    const entries = parseRcvCsv('﻿' + RCV_COMPRAS);
    expect(entries).toHaveLength(4);
    expect(entries[0]).toEqual({
      siiCode: 33,
      rut: '76.123.456-0',
      name: 'FERRETERIA MUÑOZ SPA',
      folio: 120,
      date: '2026-09-10',
      exemptAmount: 10_000,
      netAmount: 90_000,
      ivaAmount: 17_100,
      totalAmount: 117_100,
    });
    // RUT con cero a la izquierda: se normaliza para poder cruzarlo.
    expect(entries[3].rut).toBe('11.111.111-1');
  });

  it('acepta separador coma y montos con separador de miles', () => {
    const csv = 'Tipo Doc,Rut cliente,Razon Social,Folio,Fecha Docto,Monto Exento,Monto Neto,Monto IVA,Monto total\n33,76123456-0,X,10,2026-09-01,0,"1.000","190","1.190"';
    expect(parseRcvCsv(csv)[0]).toMatchObject({ netAmount: 1000, ivaAmount: 190, totalAmount: 1190, date: '2026-09-01' });
  });

  it('explica qué columnas faltan o si el archivo no es el detalle', () => {
    expect(() => parseRcvCsv('hola;mundo\n1;2')).toThrow(RcvParseError);
    expect(() => parseRcvCsv('Tipo Doc;Folio;Monto Neto\n33;1;100')).toThrow(/RUT, Monto Total/);
    expect(() => parseRcvCsv('')).toThrow(/vacío/);
  });
});

describe('RCV: cuadratura contra el ERP', () => {
  const sii = parseRcvCsv(RCV_COMPRAS);
  const erp: ErpRcvEntry[] = [
    // Coincide exacto (el ERP registró IVA con 1 peso de diferencia: tolerado).
    { documentId: 'p1', siiCode: 33, rut: '76.123.456-0', name: 'Ferretería', folio: 120, date: '2026-09-10', exemptAmount: 10_000, netAmount: 90_000, ivaAmount: 17_101, totalAmount: 117_100 },
    // Mismo documento, montos distintos.
    { documentId: 'p2', siiCode: 33, rut: '77.888.999-4', name: 'Oficinas', folio: 4455, date: '2026-09-12', exemptAmount: 0, netAmount: 5_000, ivaAmount: 950, totalAmount: 5_950 },
    // La factura exenta el ERP la tiene como 33 sin IVA: misma familia.
    { documentId: 'p3', siiCode: 33, rut: '11111111-1', name: 'Pérez', folio: 77, date: '2026-09-21', exemptAmount: 30_000, netAmount: 0, ivaAmount: 0, totalAmount: 30_000 },
    // Solo en el ERP.
    { documentId: 'p4', siiCode: 33, rut: '76.123.456-0', name: 'Ferretería', folio: 999, date: '2026-09-25', exemptAmount: 0, netAmount: 1_000, ivaAmount: 190, totalAmount: 1_190 },
  ];

  it('clasifica coincidencias, diferencias y faltantes de cada lado', () => {
    const result = reconcileRcv(sii, erp);
    expect(result.matched.map((match) => match.erp.documentId).sort()).toEqual(['p1', 'p3']);
    expect(result.differences).toHaveLength(1);
    expect(result.differences[0].erp.documentId).toBe('p2');
    expect(result.differences[0].fields).toEqual(['totalAmount', 'netAmount', 'ivaAmount']);
    expect(result.onlyInSii.map((entry) => `${entry.siiCode}-${entry.folio}`)).toEqual(['61-15']);
    expect(result.onlyInErp.map((entry) => entry.documentId)).toEqual(['p4']);
  });

  it('las notas de crédito restan en los totales del período', () => {
    const { totals } = reconcileRcv(sii, []);
    expect(totals.sii.count).toBe(4);
    expect(totals.sii.netAmount).toBe(90_000 + 50_000 - 10_000);
    expect(totals.sii.ivaAmount).toBe(17_100 + 9_500 - 1_900);
    expect(totals.sii.totalAmount).toBe(117_100 + 59_500 - 11_900 + 30_000);
  });

  it('compara RUT sin importar puntos, ceros ni mayúsculas', () => {
    expect(rutKey('011.111.111-1')).toBe(rutKey('11111111-1'));
    expect(rcvKey({ siiCode: 34, rut: '12.345.678-k', folio: 5 })).toBe(rcvKey({ siiCode: 33, rut: '12345678-K', folio: 5 }));
    expect(rcvKey({ siiCode: 61, rut: '1-9', folio: 5 })).not.toBe(rcvKey({ siiCode: 33, rut: '1-9', folio: 5 }));
  });

  it('solo las facturas y notas de proveedor van al RCV de compras', () => {
    expect(purchaseRcvCode('FACTURA', { netAmount: 100, ivaAmount: 19, exemptAmount: 0 })).toBe(33);
    expect(purchaseRcvCode('FACTURA', { netAmount: 0, ivaAmount: 0, exemptAmount: 100 })).toBe(34);
    expect(purchaseRcvCode('NOTA_CREDITO', { netAmount: 1, ivaAmount: 0, exemptAmount: 0 })).toBe(61);
    expect(purchaseRcvCode('BOLETA', { netAmount: 1, ivaAmount: 0, exemptAmount: 0 })).toBeNull();
    expect(purchaseRcvCode('GUIA_DESPACHO', { netAmount: 1, ivaAmount: 0, exemptAmount: 0 })).toBeNull();
  });
});
