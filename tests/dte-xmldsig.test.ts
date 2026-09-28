/**
 * Firma XML-DSig del SII (OP-15): certificado PKCS#12, firma de cada DTE y
 * del sobre EnvioDTE en su contexto final, y la firma de la semilla del
 * token. Las firmas se verifican con el verificador de xml-crypto sobre el
 * XML FINAL, que es lo que hace el SII: firmar un DTE suelto y meterlo
 * después al sobre produciría un digest distinto.
 */
import crypto from 'crypto';
import forge from 'node-forge';
import { DOMParser } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';
import { parseCaf } from '@/lib/chile/dte/caf';
import { buildDte } from '@/lib/chile/dte/document';
import { CertificateError, isCertificateCurrent, loadPkcs12 } from '@/lib/chile/dte/certificate';
import { buildSignedEnvioDte, encodeLatin1, SII_RUT } from '@/lib/chile/dte/envio';
import { signEnveloped, XmlSignatureError } from '@/lib/chile/dte/signature';
import { getToken, interpretUploadState, queryUploadStatus, SiiServiceError, uploadEnvioDte, type FetchLike } from '@/lib/chile/dte/sii-client';

const HOLDER_RUT = '12345678-5';
const PASSWORD = 'clave-del-pfx';

/** PKCS#12 como los de las certificadoras chilenas: el RUT del titular en el subjectAltName (otherName 1.3.6.1.4.1.8321.1). */
function makePfx(options: { rutInSan?: boolean; notAfter?: Date } = {}): Buffer {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const forgeKey = forge.pki.privateKeyFromPem(privateKey.export({ type: 'pkcs1', format: 'pem' }).toString());
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.publicKeyFromPem(publicKey.export({ type: 'spki', format: 'pem' }).toString());
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date('2026-01-01T00:00:00Z');
  cert.validity.notAfter = options.notAfter ?? new Date('2028-01-01T00:00:00Z');
  const subject = [{ name: 'commonName', value: 'JUANA PÉREZ SOTO' }, { name: 'countryName', value: 'CL' }];
  cert.setSubject(subject);
  cert.setIssuer([{ name: 'commonName', value: 'CERTIFICADORA DE PRUEBA' }]);
  if (options.rutInSan !== false) {
    const { asn1 } = forge;
    const san = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer('1.3.6.1.4.1.8321.1').getBytes()),
        asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [asn1.create(asn1.Class.UNIVERSAL, asn1.Type.IA5STRING, false, HOLDER_RUT)]),
      ]),
    ]);
    cert.setExtensions([{ id: '2.5.29.17', value: asn1.toDer(san).getBytes() }]);
  }
  cert.sign(forgeKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(forgeKey, [cert], PASSWORD, { algorithm: '3des' });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary');
}

const { privateKey: cafKey, publicKey: cafPub } = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 });
const CAF_XML = `<AUTORIZACION><CAF version="1.0"><DA><RE>76192083-9</RE><RS>EMPRESA DEMO SPA</RS><TD>33</TD><RNG><D>1</D><H>100</H></RNG><FA>2026-01-15</FA><RSAPK><M>abc</M><E>Aw==</E></RSAPK><IDK>300</IDK></DA><FRMA algoritmo="SHA1withRSA">FIRMA_DEL_SII==</FRMA></CAF><RSASK>${cafKey.export({ type: 'pkcs1', format: 'pem' })}</RSASK><RSAPUBK>${cafPub.export({ type: 'spki', format: 'pem' })}</RSAPUBK></AUTORIZACION>`;

function makeDte(folio: number) {
  const caf = parseCaf(CAF_XML);
  return buildDte({
    siiCode: 33,
    folio,
    issueDate: new Date('2026-09-10T14:30:00Z'),
    paymentMode: 1,
    issuer: {
      rut: '76192083-9',
      businessName: 'PÉREZ & CÍA. LTDA.',
      giro: 'Servicios de consultoría',
      actividadEconomicaCodigo: '620200',
      address: 'Av. Siempre Viva 742',
      comuna: 'Providencia',
      ciudad: 'Santiago',
    },
    receiver: { rut: '77777777-7', businessName: 'CLIENTE <ÑUÑOA> SPA', giro: 'Comercio', address: 'Calle Falsa 123', comuna: 'Ñuñoa', ciudad: 'Santiago' },
    lines: [{ description: 'Consultoría "senior"', quantity: 1, unitPrice: 100000, lineTotal: 100000, isExempt: false }],
    totals: { netAmount: 100000, exemptAmount: 0, ivaAmount: 19000, totalAmount: 119000 },
    cafBlockXml: caf.cafBlockXml,
    privateKeyPem: caf.privateKeyPem,
  });
}

/** Verifica TODAS las `<Signature>` del XML final con xml-crypto, como lo haría el SII. */
function verifyAll(xml: string, certificatePem: string): number {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const signatures = doc.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature');
  for (let i = 0; i < signatures.length; i += 1) {
    const verifier = new SignedXml({ publicCert: certificatePem });
    verifier.loadSignature(signatures[i]);
    if (!verifier.checkSignature(xml)) throw new Error(`Firma ${i} inválida`);
  }
  return signatures.length;
}

describe('Certificado digital (PKCS#12)', () => {
  const pfx = makePfx();

  it('extrae llave, certificado, titular, RUT y vigencia', () => {
    const cert = loadPkcs12(pfx, PASSWORD);
    expect(cert.holderRut).toBe(HOLDER_RUT);
    expect(cert.holderName).toBe('JUANA PÉREZ SOTO');
    expect(cert.issuerName).toBe('CERTIFICADORA DE PRUEBA');
    expect(cert.exponentBase64).toBe('AQAB');
    expect(cert.privateKeyPem).toContain('PRIVATE KEY');
    expect(cert.fingerprintSha1).toMatch(/^[0-9a-f]{40}$/);
    expect(isCertificateCurrent(cert, new Date('2026-09-28T00:00:00Z'))).toBe(true);
    expect(isCertificateCurrent(cert, new Date('2028-06-01T00:00:00Z'))).toBe(false);
  });

  it('el módulo va sin bytes de signo, como exige RSAKeyValue', () => {
    const cert = loadPkcs12(pfx, PASSWORD);
    const modulus = Buffer.from(cert.modulusBase64, 'base64');
    expect(modulus.length).toBe(256);
    expect(modulus[0]).not.toBe(0);
  });

  it('sin RUT en el certificado lo deja en null (se pedirá a mano)', () => {
    expect(loadPkcs12(makePfx({ rutInSan: false }), PASSWORD).holderRut).toBeNull();
  });

  it('una contraseña incorrecta da un error legible', () => {
    expect(() => loadPkcs12(pfx, 'otra')).toThrow(CertificateError);
    expect(() => loadPkcs12(Buffer.from('no es un pfx'), PASSWORD)).toThrow(/contraseña/);
  });
});

describe('EnvioDTE firmado', () => {
  const cert = loadPkcs12(makePfx(), PASSWORD);
  const dteA = makeDte(1);
  const dteB = makeDte(2);
  const input = {
    issuerRut: '76.192.083-9',
    senderRut: HOLDER_RUT,
    resolutionDate: '2026-01-15',
    resolutionNumber: 0,
    documents: [
      { xml: dteA.xml, documentId: dteA.documentId, siiCode: 33 },
      { xml: dteB.xml, documentId: dteB.documentId, siiCode: 33 },
    ],
    signedAt: new Date('2026-09-10T15:00:00Z'),
  };
  const envio = buildSignedEnvioDte(input, cert);

  it('todas las firmas (cada DTE y el SetDTE) verifican sobre el XML final', () => {
    expect(verifyAll(envio, cert.certificatePem)).toBe(3);
  });

  it('no re-serializa: el Documento y el timbre (con el CAF) quedan byte a byte', () => {
    const documento = (xml: string) => xml.slice(xml.indexOf('<Documento'), xml.indexOf('</Documento>') + '</Documento>'.length);
    expect(envio).toContain(documento(dteA.xml));
    expect(envio).toContain(documento(dteB.xml));
    expect(envio).toContain(dteA.tedXml);
  });

  it('la carátula va al SII, con el RUT que envía y los subtotales por tipo', () => {
    expect(envio).toContain(`<RutReceptor>${SII_RUT}</RutReceptor>`);
    expect(envio).toContain(`<RutEnvia>${HOLDER_RUT}</RutEnvia>`);
    expect(envio).toContain('<RutEmisor>76192083-9</RutEmisor>');
    expect(envio).toContain('<SubTotDTE><TpoDTE>33</TpoDTE><NroDTE>2</NroDTE></SubTotDTE>');
    expect(envio).toContain('<TmstFirmaEnv>2026-09-10T12:00:00</TmstFirmaEnv>');
  });

  it('cada firma queda como hermana de lo que firma, en el orden que pide el esquema', () => {
    expect(envio).toMatch(/<\/Documento><Signature xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#"><SignedInfo>/);
    expect(envio).toMatch(/<\/SetDTE><Signature xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#">.*<\/Signature><\/EnvioDTE>$/s);
  });

  it('alterar cualquier dato del documento invalida la firma', () => {
    const tampered = envio.replace('<MntTotal>119000</MntTotal>', '<MntTotal>119001</MntTotal>');
    expect(tampered).not.toBe(envio);
    expect(() => verifyAll(tampered, cert.certificatePem)).toThrow(/inválida/);
  });

  it('un DTE firmado suelto NO verifica dentro del sobre (por eso se firma en contexto)', () => {
    // El mismo DTE fuera del sobre ya no hereda xmlns ni xmlns:xsi: su forma
    // canónica cambia y el digest firmado en contexto no calza.
    const loose = buildSignedEnvioDte({ ...input, documents: [input.documents[0]] }, cert);
    const doc = loose.slice(loose.indexOf('<DTE'), loose.indexOf('</DTE>') + 6);
    const standalone = `<?xml version="1.0" encoding="ISO-8859-1"?>${doc}`;
    const parsed = new DOMParser().parseFromString(standalone, 'text/xml');
    const signature = parsed.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature')[0];
    const verifier = new SignedXml({ publicCert: cert.certificatePem });
    verifier.loadSignature(signature);
    expect(verifier.checkSignature(standalone)).toBe(false);
  });

  it('rechaza boletas, sobres vacíos y fechas de resolución mal formadas', () => {
    expect(() => buildSignedEnvioDte({ ...input, documents: [{ ...input.documents[0], siiCode: 39 }] }, cert)).toThrow(/boletas/i);
    expect(() => buildSignedEnvioDte({ ...input, documents: [] }, cert)).toThrow(XmlSignatureError);
    expect(() => buildSignedEnvioDte({ ...input, resolutionDate: '15-01-2026' }, cert)).toThrow(/AAAA-MM-DD/);
  });

  it('se sube en ISO-8859-1 y rechaza caracteres que no existen en ese juego', () => {
    const bytes = encodeLatin1(envio);
    expect(bytes.toString('latin1')).toBe(envio);
    expect(bytes.includes(Buffer.from('Ñ', 'latin1'))).toBe(true);
    expect(() => encodeLatin1(`${envio}“`)).toThrow(/no acepta/);
  });
});

describe('Firma de la semilla (token del SII)', () => {
  const cert = loadPkcs12(makePfx(), PASSWORD);

  it('firma el documento completo con transformación enveloped y verifica', () => {
    const signed = signEnveloped('<getToken><item><Semilla>012345678901</Semilla></item></getToken>', cert);
    expect(signed).toContain('<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>');
    expect(signed).toContain('<Reference URI="">');
    expect(signed.startsWith('<getToken><item><Semilla>012345678901</Semilla></item><Signature')).toBe(true);
    expect(verifyAll(signed, cert.certificatePem)).toBe(1);
  });
});

/** Respuesta SOAP del SII: el XML de respuesta va escapado dentro de <operacionReturn>. */
function soap(operation: string, inner: string): string {
  const escaped = inner.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="utf-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><ns1:${operation}Response xmlns:ns1="http://DefaultNamespace"><ns1:${operation}Return xsi:type="xsd:string">${escaped}</ns1:${operation}Return></ns1:${operation}Response></soapenv:Body></soapenv:Envelope>`;
}

function siiAnswer(body: string, state = '00'): string {
  return `<?xml version="1.0" encoding="UTF-8"?><SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema"><SII:RESP_BODY>${body}</SII:RESP_BODY><SII:RESP_HDR><ESTADO>${state}</ESTADO></SII:RESP_HDR></SII:RESPUESTA>`;
}

describe('Cliente de servicios del SII', () => {
  const cert = loadPkcs12(makePfx(), PASSWORD);

  it('obtiene el token: pide semilla a certificación, la firma y la canjea', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const fetchMock: FetchLike = async (url, init) => {
      calls.push({ url, body: String(init?.body) });
      if (url.endsWith('CrSeed.jws')) return new Response(soap('getSeed', siiAnswer('<SEMILLA>012345678901</SEMILLA>')));
      return new Response(soap('getToken', siiAnswer('<TOKEN>ABCDEF123</TOKEN>')));
    };
    await expect(getToken('certificacion', cert, fetchMock)).resolves.toBe('ABCDEF123');
    expect(calls.map((c) => c.url)).toEqual(['https://maullin.sii.cl/DTEWS/CrSeed.jws', 'https://maullin.sii.cl/DTEWS/GetTokenFromSeed.jws']);
    const signed = /<!\[CDATA\[([\s\S]*)\]\]>/.exec(calls[1].body)?.[1] ?? '';
    expect(signed).toContain('<Semilla>012345678901</Semilla>');
    expect(verifyAll(signed, cert.certificatePem)).toBe(1);
  });

  it('producción va a palena, nunca a maullin', async () => {
    const urls: string[] = [];
    const fetchMock: FetchLike = async (url) => {
      urls.push(url);
      return new Response(url.endsWith('CrSeed.jws') ? soap('getSeed', siiAnswer('<SEMILLA>1</SEMILLA>')) : soap('getToken', siiAnswer('<TOKEN>T</TOKEN>')));
    };
    await getToken('produccion', cert, fetchMock);
    expect(urls.every((url) => url.startsWith('https://palena.sii.cl/'))).toBe(true);
  });

  it('un certificado rechazado al autenticar da un error accionable', async () => {
    const fetchMock: FetchLike = async (url) =>
      new Response(url.endsWith('CrSeed.jws') ? soap('getSeed', siiAnswer('<SEMILLA>1</SEMILLA>')) : soap('getToken', siiAnswer('', '11')));
    await expect(getToken('certificacion', cert, fetchMock)).rejects.toThrow(/titular esté autorizado/);
  });

  it('sin conexión, el error lo dice en vez de mostrar el detalle técnico', async () => {
    const fetchMock: FetchLike = async () => {
      throw new TypeError('fetch failed');
    };
    await expect(getToken('certificacion', cert, fetchMock)).rejects.toThrow(/No se pudo conectar con el SII/);
  });

  it('sube el EnvioDTE en ISO-8859-1 con los campos y el User-Agent que exige el SII', async () => {
    let captured: { url: string; init?: RequestInit } | null = null;
    const fetchMock: FetchLike = async (url, init) => {
      captured = { url, init };
      return new Response('<?xml version="1.0"?><RECEPCIONDTE><RUTSENDER>12345678-5</RUTSENDER><STATUS>0</STATUS><TRACKID>0123456789</TRACKID></RECEPCIONDTE>');
    };
    const xml = '<?xml version="1.0" encoding="ISO-8859-1"?><EnvioDTE>Ñuñoa</EnvioDTE>';
    await expect(uploadEnvioDte('certificacion', { token: 'TK', senderRut: '12.345.678-5', companyRut: '76192083-9', xml }, fetchMock)).resolves.toBe('0123456789');
    const sent = captured as unknown as { url: string; init: RequestInit };
    expect(sent.url).toBe('https://maullin.sii.cl/cgi_dte/UPL/DTEUpload');
    const headers = sent.init.headers as Record<string, string>;
    expect(headers.Cookie).toBe('TOKEN=TK');
    expect(headers['User-Agent']).toContain('PROG');
    const form = sent.init.body as FormData;
    expect([...form.keys()]).toEqual(['rutSender', 'dvSender', 'rutCompany', 'dvCompany', 'archivo']);
    expect(form.get('rutSender')).toBe('12345678');
    expect(form.get('dvCompany')).toBe('9');
    const file = form.get('archivo') as Blob;
    expect(Buffer.from(await file.arrayBuffer())).toEqual(Buffer.from(xml, 'latin1'));
  });

  it('traduce los rechazos de la subida a mensajes para el usuario', async () => {
    const fetchMock: FetchLike = async () => new Response('<RECEPCIONDTE><STATUS>7</STATUS></RECEPCIONDTE>');
    const upload = uploadEnvioDte('certificacion', { token: 'TK', senderRut: '12345678-5', companyRut: '76192083-9', xml: '<a/>' }, fetchMock);
    await expect(upload).rejects.toThrow(SiiServiceError);
    await expect(upload).rejects.toThrow(/esquema/);
  });

  it('interpreta el estado del envío sin dar por aceptado lo que no entiende', () => {
    const answer = (state: string, body = '') => siiAnswer(body, state);
    expect(interpretUploadState(answer('EPR', '<ACEPTADOS>1</ACEPTADOS><RECHAZADOS>0</RECHAZADOS><REPAROS>0</REPAROS>')).status).toBe('ACCEPTED');
    expect(interpretUploadState(answer('EPR', '<ACEPTADOS>0</ACEPTADOS><RECHAZADOS>1</RECHAZADOS>')).status).toBe('REJECTED');
    expect(interpretUploadState(answer('EPR', '<ACEPTADOS>1</ACEPTADOS><REPAROS>1</REPAROS>')).status).toBe('ACCEPTED_WITH_OBJECTIONS');
    expect(interpretUploadState(answer('RPR')).status).toBe('ACCEPTED_WITH_OBJECTIONS');
    expect(interpretUploadState(answer('RFR')).status).toBe('REJECTED');
    expect(interpretUploadState(answer('RSC')).status).toBe('REJECTED');
    expect(interpretUploadState(answer('PDR')).status).toBe('SENT');
    expect(interpretUploadState(answer('XYZ')).status).toBe('SENT');
    expect(() => interpretUploadState(answer('-11'))).toThrow(SiiServiceError);
  });

  it('consulta el estado por Track ID contra QueryEstUp', async () => {
    let body = '';
    const fetchMock: FetchLike = async (url, init) => {
      body = String(init?.body);
      expect(url).toBe('https://maullin.sii.cl/DTEWS/QueryEstUp.jws');
      return new Response(soap('getEstUp', siiAnswer('<ACEPTADOS>1</ACEPTADOS>', 'EPR')));
    };
    await expect(queryUploadStatus('certificacion', { token: 'TK', companyRut: '76.192.083-9', trackId: '0123456789' }, fetchMock)).resolves.toMatchObject({ status: 'ACCEPTED', rawState: 'EPR' });
    expect(body).toContain('<RutCompania>76192083</RutCompania><DvCompania>9</DvCompania><TrackId>0123456789</TrackId><Token>TK</Token>');
    await expect(queryUploadStatus('certificacion', { token: 'TK', companyRut: '76192083-9', trackId: '1 OR 1' }, fetchMock)).rejects.toThrow(/Track ID/);
  });
});
