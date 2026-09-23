import crypto from 'crypto';
import { parseCaf, cafBelongsTo, cafFolioCount, CafParseError } from '@/lib/chile/dte/caf';
import { buildTed, buildDd, verifyTed, tedBarcodePayload, CONSUMIDOR_FINAL_RUT } from '@/lib/chile/dte/ted';
import { buildDte } from '@/lib/chile/dte/document';
import { siiCode, isDte, dteTypeFromCode, isBoletaCode, requiresReferenceCode } from '@/lib/chile/dte/codes';
import { escapeXml, fitField, siiDate, siiRut, siiTimestamp } from '@/lib/chile/dte/xml';
import { encryptCafXml, decryptCafXml } from '@/lib/chile/dte/crypto';

/**
 * Núcleo de facturación electrónica: CAF, timbre (TED) y XML del DTE.
 *
 * Se testea con un par de llaves RSA generado en el momento, no con un CAF
 * real: un CAF verdadero contiene la llave privada de emisión de una empresa,
 * y comprometerla en un repositorio permitiría emitir facturas a su nombre.
 * La estructura del archivo sintético es idéntica a la del SII, que es lo que
 * el parser necesita verificar.
 */

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 });
const SK_PEM = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
const PK_PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();

function makeCafXml(overrides: { td?: number; from?: number; to?: number; rut?: string; sk?: string } = {}): string {
  const { td = 33, from = 101, to = 200, rut = '76192083-9', sk = SK_PEM } = overrides;
  return `<AUTORIZACION><CAF version="1.0"><DA><RE>${rut}</RE><RS>EMPRESA DEMO SPA</RS><TD>${td}</TD><RNG><D>${from}</D><H>${to}</H></RNG><FA>2026-01-15</FA><RSAPK><M>abc</M><E>Aw==</E></RSAPK><IDK>300</IDK></DA><FRMA algoritmo="SHA1withRSA">FIRMA_DEL_SII==</FRMA></CAF><RSASK>${sk}</RSASK><RSAPUBK>${PK_PEM}</RSAPUBK></AUTORIZACION>`;
}

describe('Códigos de documento del SII', () => {
  it('traduce el enum interno al código numérico del SII', () => {
    expect(siiCode('FACTURA_33')).toBe(33);
    expect(siiCode('BOLETA_39')).toBe(39);
    expect(siiCode('NOTA_CREDITO_61')).toBe(61);
    expect(siiCode('NOTA_DEBITO_56')).toBe(56);
  });

  it('no trata la cotización como DTE: no tiene código del SII', () => {
    // Una cotización no es un documento tributario; intentar timbrarla es un
    // error conceptual, no un caso a soportar con un código por defecto.
    expect(isDte('COTIZACION')).toBe(false);
    expect(() => siiCode('COTIZACION')).toThrow(/no es un DTE/);
  });

  it('reconoce boletas y documentos que exigen referencia', () => {
    expect(isBoletaCode(39)).toBe(true);
    expect(isBoletaCode(41)).toBe(true);
    expect(isBoletaCode(33)).toBe(false);
    expect(requiresReferenceCode(61)).toBe(true);
    expect(requiresReferenceCode(56)).toBe(true);
    expect(requiresReferenceCode(33)).toBe(false);
  });

  it('mapea de vuelta desde el código del SII', () => {
    expect(dteTypeFromCode(33)).toBe('FACTURA_33');
    expect(dteTypeFromCode(999)).toBeNull();
  });
});

describe('Formato de campos del SII', () => {
  it('escapa los caracteres que romperían el XML', () => {
    expect(escapeXml('PEREZ & CIA <LTDA>')).toBe('PEREZ &amp; CIA &lt;LTDA&gt;');
  });

  it('recorta al largo máximo y colapsa espacios', () => {
    expect(fitField('  uno   dos  ', 20)).toBe('uno dos');
    expect(fitField('x'.repeat(60), 40)).toHaveLength(40);
  });

  it('normaliza el RUT al formato del SII', () => {
    expect(siiRut('12.345.678-k')).toBe('12345678-K');
    expect(siiRut('76192083-9')).toBe('76192083-9');
  });

  it('usa la fecha de Chile y no la UTC', () => {
    // 2026-09-10 23:30 en Chile (UTC-3 en septiembre, ya con horario de
    // verano) es 2026-09-11 02:30 UTC. Fechar en UTC adelantaría un día todos
    // los documentos emitidos de noche.
    const lateNightInChile = new Date('2026-09-11T02:30:00Z');
    expect(siiDate(lateNightInChile)).toBe('2026-09-10');
  });

  it('emite la marca de tiempo sin sufijo de zona, como exige el SII', () => {
    const stamp = siiTimestamp(new Date('2026-09-10T14:30:15Z'));
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(stamp).not.toMatch(/Z$/);
  });
});

describe('Lectura del CAF', () => {
  it('extrae rango, tipo y llaves de un CAF válido', () => {
    const caf = parseCaf(makeCafXml());

    expect(caf.dteType).toBe('FACTURA_33');
    expect(caf.siiCode).toBe(33);
    expect(caf.rangeFrom).toBe(101);
    expect(caf.rangeTo).toBe(200);
    expect(cafFolioCount(caf)).toBe(100);
    expect(caf.privateKeyPem).toContain('BEGIN RSA PRIVATE KEY');
  });

  it('conserva el bloque <CAF> literal, con la firma del SII intacta', () => {
    // Es el requisito que obliga a extraer texto en vez de reserializar: la
    // firma <FRMA> del SII se calculó sobre esos bytes exactos.
    const caf = parseCaf(makeCafXml());
    expect(caf.cafBlockXml).toContain('<FRMA algoritmo="SHA1withRSA">FIRMA_DEL_SII==</FRMA>');
    expect(caf.cafBlockXml.startsWith('<CAF')).toBe(true);
    expect(caf.cafBlockXml.endsWith('</CAF>')).toBe(true);
  });

  it('reconoce si el CAF pertenece a la empresa, tolerando el formato del RUT', () => {
    const caf = parseCaf(makeCafXml());
    expect(cafBelongsTo(caf, '76.192.083-9')).toBe(true);
    expect(cafBelongsTo(caf, '76192083-9')).toBe(true);
    expect(cafBelongsTo(caf, '99.999.999-9')).toBe(false);
  });

  it('rechaza un archivo que no es un CAF', () => {
    expect(() => parseCaf('<xml>cualquier cosa</xml>')).toThrow(CafParseError);
  });

  it('rechaza un CAF sin llave privada', () => {
    const sinLlave = makeCafXml().replace(/<RSASK>[\s\S]*?<\/RSASK>/, '');
    expect(() => parseCaf(sinLlave)).toThrow(/llave privada/i);
  });

  it('rechaza una llave privada dañada antes de consumir folios', () => {
    // Sin esta validación, un CAF con la llave truncada pasa la carga y falla
    // recién al emitir, cuando el folio ya se gastó.
    const dañado = makeCafXml({ sk: '-----BEGIN RSA PRIVATE KEY-----\nQUJD\n-----END RSA PRIVATE KEY-----' });
    expect(() => parseCaf(dañado)).toThrow(/no se pudo interpretar|dañado/i);
  });

  it('rechaza un rango invertido', () => {
    expect(() => parseCaf(makeCafXml({ from: 500, to: 100 }))).toThrow(/rango/i);
  });

  it('rechaza un CAF de un tipo de documento que el sistema no emite', () => {
    expect(() => parseCaf(makeCafXml({ td: 110 }))).toThrow(/no emite/i);
  });
});

describe('Timbre electrónico (TED)', () => {
  const caf = parseCaf(makeCafXml());

  const baseTed = {
    issuerRut: '76.192.083-9',
    siiCode: 33,
    folio: 101,
    issueDate: new Date('2026-09-10T14:30:00Z'),
    receiverRut: '77.777.777-7',
    receiverName: 'CLIENTE & CIA LTDA',
    totalAmount: 119000,
    firstItemDescription: 'Servicio de consultoría mensual con una glosa larguísima',
    cafBlockXml: caf.cafBlockXml,
    privateKeyPem: caf.privateKeyPem,
    stampedAt: new Date('2026-09-10T14:30:00Z'),
  };

  it('firma el DD de forma verificable con la llave pública del CAF', () => {
    const ted = buildTed(baseTed);
    expect(verifyTed(ted.dd, ted.signature, caf.publicKeyPem)).toBe(true);
  });

  it('rechaza la verificación si el contenido cambió después de firmar', () => {
    // Es la propiedad que hace útil al timbre: quien recibe el documento puede
    // detectar que el monto fue alterado sin consultar al SII.
    const ted = buildTed(baseTed);
    const adulterado = ted.dd.replace('<MNT>119000</MNT>', '<MNT>11900</MNT>');
    expect(verifyTed(adulterado, ted.signature, caf.publicKeyPem)).toBe(false);
  });

  it('incrusta el bloque CAF completo dentro del DD', () => {
    const ted = buildTed(baseTed);
    expect(ted.dd).toContain(caf.cafBlockXml);
  });

  it('recorta IT1 a los 40 caracteres del esquema', () => {
    const ted = buildTed(baseTed);
    const it1 = /<IT1>([^<]*)<\/IT1>/.exec(ted.dd)?.[1] ?? '';
    expect(it1.length).toBeLessThanOrEqual(40);
  });

  it('escapa la razón social del receptor', () => {
    const ted = buildTed(baseTed);
    expect(ted.dd).toContain('<RSR>CLIENTE &amp; CIA LTDA</RSR>');
  });

  it('produce un DD determinista para la misma entrada', () => {
    // Si el DD no fuese reproducible byte a byte, revalidar un documento
    // guardado sería imposible: la firma dejaría de cuadrar.
    expect(buildDd(baseTed)).toBe(buildDd(baseTed));
  });

  it('rechaza folios y montos inválidos', () => {
    expect(() => buildTed({ ...baseTed, folio: 0 })).toThrow(/folio/i);
    expect(() => buildTed({ ...baseTed, totalAmount: -1 })).toThrow(/monto/i);
  });

  it('entrega el payload del código de barras en una sola línea', () => {
    const ted = buildTed(baseTed);
    expect(tedBarcodePayload(`${ted.xml}\n  `)).not.toMatch(/\n/);
  });
});

describe('XML del DTE', () => {
  const caf = parseCaf(makeCafXml());

  const issuer = {
    rut: '76192083-9',
    businessName: 'EMPRESA DEMO SPA',
    giro: 'Servicios de consultoría',
    actividadEconomicaCodigo: '620200',
    address: 'Av. Siempre Viva 742',
    comuna: 'Providencia',
    ciudad: 'Santiago',
  };

  const receiver = {
    rut: '77777777-7',
    businessName: 'CLIENTE SPA',
    giro: 'Comercio',
    address: 'Calle Falsa 123',
    comuna: 'Ñuñoa',
    ciudad: 'Santiago',
  };

  const baseDte = {
    siiCode: 33,
    folio: 101,
    issueDate: new Date('2026-09-10T14:30:00Z'),
    paymentMode: 1 as const,
    issuer,
    receiver,
    lines: [
      { description: 'Consultoría', quantity: 1, unitPrice: 100000, lineTotal: 100000, isExempt: false },
    ],
    totals: { netAmount: 100000, exemptAmount: 0, ivaAmount: 19000, totalAmount: 119000 },
    cafBlockXml: caf.cafBlockXml,
    privateKeyPem: caf.privateKeyPem,
  };

  it('declara ISO-8859-1, que es el encoding que exige el SII', () => {
    const dte = buildDte(baseDte);
    expect(dte.xml.startsWith('<?xml version="1.0" encoding="ISO-8859-1"?>')).toBe(true);
  });

  it('respeta el orden de bloques del esquema', () => {
    const { xml } = buildDte(baseDte);
    const orden = ['<IdDoc>', '<Emisor>', '<Receptor>', '<Totales>', '<Detalle>', '<TED', '<TmstFirma>'];
    const posiciones = orden.map((tag) => xml.indexOf(tag));
    expect(posiciones.every((pos) => pos >= 0)).toBe(true);
    expect([...posiciones]).toEqual([...posiciones].sort((a, b) => a - b));
  });

  it('usa el identificador de documento con el formato del SII', () => {
    expect(buildDte(baseDte).documentId).toBe('T33F101');
  });

  it('omite IVA y TasaIVA en un documento totalmente exento', () => {
    // El SII rechaza un <IVA>0</IVA> explícito cuando no hay monto afecto.
    const exento = buildDte({
      ...baseDte,
      siiCode: 34,
      lines: [{ description: 'Servicio exento', quantity: 1, unitPrice: 50000, lineTotal: 50000, isExempt: true }],
      totals: { netAmount: 0, exemptAmount: 50000, ivaAmount: 0, totalAmount: 50000 },
    });

    expect(exento.xml).toContain('<MntExe>50000</MntExe>');
    expect(exento.xml).not.toContain('<IVA>');
    expect(exento.xml).not.toContain('<TasaIVA>');
  });

  it('marca con IndExe la línea exenta dentro de un documento afecto', () => {
    const mixto = buildDte({
      ...baseDte,
      lines: [
        { description: 'Afecto', quantity: 1, unitPrice: 100000, lineTotal: 100000, isExempt: false },
        { description: 'Exento', quantity: 1, unitPrice: 50000, lineTotal: 50000, isExempt: true },
      ],
      totals: { netAmount: 100000, exemptAmount: 50000, ivaAmount: 19000, totalAmount: 169000 },
    });

    expect(mixto.xml).toContain('<IndExe>1</IndExe>');
    expect((mixto.xml.match(/<IndExe>/g) ?? [])).toHaveLength(1);
  });

  it('exige referencia en una nota de crédito', () => {
    expect(() => buildDte({ ...baseDte, siiCode: 61 })).toThrow(/referenciar/i);
  });

  it('incluye el bloque Referencia cuando corresponde', () => {
    const nota = buildDte({
      ...baseDte,
      siiCode: 61,
      references: [{ siiCode: 33, folio: 55, issueDate: new Date('2026-08-01T12:00:00Z'), reasonCode: 3 }],
    });

    expect(nota.xml).toContain('<TpoDocRef>33</TpoDocRef>');
    expect(nota.xml).toContain('<FolioRef>55</FolioRef>');
    expect(nota.xml).toContain('<CodRef>3</CodRef>');
  });

  it('usa el RUT de consumidor final en una boleta sin receptor', () => {
    const boleta = buildDte({ ...baseDte, siiCode: 39, receiver: null });
    expect(boleta.xml).toContain(`<RUTRecep>${CONSUMIDOR_FINAL_RUT}</RUTRecep>`);
  });

  it('omite el giro del receptor en una boleta pero lo incluye en una factura', () => {
    expect(buildDte({ ...baseDte, siiCode: 39 }).xml).not.toContain('<GiroRecep>');
    expect(buildDte(baseDte).xml).toContain('<GiroRecep>Comercio</GiroRecep>');
  });

  it('rechaza un documento sin líneas de detalle', () => {
    expect(() => buildDte({ ...baseDte, lines: [] })).toThrow(/al menos una línea/i);
  });

  it('incrusta un TED verificable dentro del documento', () => {
    const dte = buildDte(baseDte);
    expect(dte.xml).toContain(dte.tedXml);

    const dd = /<DD>[\s\S]*<\/DD>/.exec(dte.tedXml)?.[0] ?? '';
    const firma = /<FRMT algoritmo="SHA1withRSA">([^<]*)<\/FRMT>/.exec(dte.tedXml)?.[1] ?? '';
    expect(verifyTed(dd, firma, caf.publicKeyPem)).toBe(true);
  });
});

describe('Cifrado del CAF en reposo', () => {
  const originalKey = process.env.DTE_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.DTE_ENCRYPTION_KEY = 'clave-de-prueba-para-tests-1234567890';
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.DTE_ENCRYPTION_KEY;
    else process.env.DTE_ENCRYPTION_KEY = originalKey;
  });

  it('cifra y descifra el XML sin pérdida', () => {
    const xml = makeCafXml();
    expect(decryptCafXml(encryptCafXml(xml))).toBe(xml);
  });

  it('no deja la llave privada legible en el texto cifrado', () => {
    const cifrado = encryptCafXml(makeCafXml());
    expect(cifrado).not.toContain('BEGIN RSA PRIVATE KEY');
    expect(cifrado).not.toContain('76192083-9');
  });

  it('detecta una manipulación del registro cifrado', () => {
    // GCM autentica además de cifrar: sin esto, un registro alterado
    // produciría timbres inválidos sin que nadie lo note hasta el rechazo.
    const cifrado = encryptCafXml(makeCafXml());
    const [iv, tag, datos] = cifrado.split('.');
    const alterado = `${iv}.${tag}.${Buffer.from(`${datos}corrupto`).toString('base64')}`;
    expect(() => decryptCafXml(alterado)).toThrow();
  });

  it('falla explícitamente si no hay ninguna llave de cifrado configurada', () => {
    const dte = process.env.DTE_ENCRYPTION_KEY;
    const totp = process.env.TOTP_ENCRYPTION_KEY;
    delete process.env.DTE_ENCRYPTION_KEY;
    delete process.env.TOTP_ENCRYPTION_KEY;

    try {
      expect(() => encryptCafXml('<x/>')).toThrow(/DTE_ENCRYPTION_KEY/);
    } finally {
      if (dte !== undefined) process.env.DTE_ENCRYPTION_KEY = dte;
      if (totp !== undefined) process.env.TOTP_ENCRYPTION_KEY = totp;
    }
  });
});
