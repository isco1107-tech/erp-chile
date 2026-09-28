import crypto from 'crypto';
import forge from 'node-forge';
import { cleanRut, validateRut } from '@/lib/chile/rut';

/**
 * Certificado digital (firma electrónica simple) con que la empresa firma
 * sus DTE y se autentica ante el SII. Lo entrega una entidad acreditada
 * (E-Sign, Acepta, etc.) como un archivo PKCS#12 (.pfx / .p12) protegido con
 * contraseña, a nombre de una PERSONA (el "RUT que envía"), no de la empresa.
 *
 * Se abre una sola vez al cargarlo: lo que se guarda (cifrado) es la llave y
 * el certificado ya extraídos, nunca la contraseña del archivo.
 */
export interface DigitalCertificate {
  /** Llave privada RSA en PEM (PKCS#1). Secreta: se guarda cifrada. */
  privateKeyPem: string;
  certificatePem: string;
  /** DER del certificado en base64, sin encabezados: va en `<X509Certificate>`. */
  certificateBase64: string;
  /** Módulo y exponente de la llave pública en base64: van en `<RSAKeyValue>`. */
  modulusBase64: string;
  exponentBase64: string;
  /** RUT del titular (formato SII, `12345678-9`), si el certificado lo trae. */
  holderRut: string | null;
  holderName: string;
  issuerName: string;
  notBefore: Date;
  notAfter: Date;
  /** SHA-1 del DER en hexadecimal: identifica el certificado sin exponerlo. */
  fingerprintSha1: string;
}

export class CertificateError extends Error {}

/**
 * OID con que las entidades certificadoras chilenas ponen el RUT del titular
 * en el `subjectAltName` (otherName). Si no está, se prueba el
 * `serialNumber` del sujeto, que algunas usan en su lugar.
 */
const RUT_OTHER_NAME_OID = '1.3.6.1.4.1.8321.1';

function bigIntegerToBase64(value: forge.jsbn.BigInteger): string {
  let hex = value.toString(16);
  if (hex.length % 2 === 1) hex = `0${hex}`;
  return Buffer.from(hex, 'hex').toString('base64');
}

function normalizeRut(raw: string): string | null {
  const clean = cleanRut(raw);
  if (clean.length < 2 || !validateRut(clean)) return null;
  return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
}

/** Busca recursivamente el primer texto imprimible de un valor ASN.1 (el RUT viene envuelto en un [0] EXPLICIT). */
function firstString(node: forge.asn1.Asn1): string | null {
  if (typeof node.value === 'string') {
    return node.type === forge.asn1.Type.OCTETSTRING || node.constructed ? null : node.value;
  }
  for (const child of node.value) {
    const found = firstString(child);
    if (found) return found;
  }
  return null;
}

function rutFromSubjectAltName(cert: forge.pki.Certificate): string | null {
  const extension = cert.extensions.find((ext: { id?: string }) => ext.id === '2.5.29.17') as { value?: string } | undefined;
  if (!extension?.value) return null;
  try {
    const sequence = forge.asn1.fromDer(extension.value);
    if (!Array.isArray(sequence.value)) return null;
    for (const generalName of sequence.value) {
      // otherName es el [0] del GeneralName: OID + [0] EXPLICIT valor.
      if (generalName.tagClass !== forge.asn1.Class.CONTEXT_SPECIFIC || generalName.type !== 0 || !Array.isArray(generalName.value)) continue;
      const [oidNode, valueNode] = generalName.value;
      if (!oidNode || typeof oidNode.value !== 'string' || forge.asn1.derToOid(oidNode.value) !== RUT_OTHER_NAME_OID || !valueNode) continue;
      const text = firstString(valueNode);
      const rut = text ? normalizeRut(text) : null;
      if (rut) return rut;
    }
  } catch {
    return null;
  }
  return null;
}

function rutFromSubject(cert: forge.pki.Certificate): string | null {
  const serial = cert.subject.getField({ type: '2.5.4.5' }) as { value?: string } | null;
  return serial?.value ? normalizeRut(serial.value) : null;
}

function describeName(name: forge.pki.Certificate['subject']): string {
  const cn = name.getField('CN') as { value?: string } | null;
  if (cn?.value) return cn.value;
  return name.attributes.map((attr) => `${attr.shortName ?? attr.name}=${attr.value}`).join(', ');
}

/**
 * Abre el archivo PKCS#12. Lanza `CertificateError` con un mensaje para el
 * usuario si la contraseña no corresponde, si no trae llave RSA o si no hay
 * un certificado que calce con esa llave.
 */
export function loadPkcs12(pfx: Buffer, password: string): DigitalCertificate {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary')));
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
  } catch {
    throw new CertificateError('No se pudo abrir el certificado: revisa que sea el archivo .pfx/.p12 y que la contraseña sea la correcta');
  }

  const shrouded = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [];
  const plain = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? [];
  const privateKey = [...shrouded, ...plain].map((bag) => bag.key).find((key): key is forge.pki.rsa.PrivateKey => Boolean(key && 'n' in key));
  if (!privateKey) throw new CertificateError('El archivo no trae una llave privada RSA');

  // El archivo puede traer la cadena completa: se usa el certificado cuya
  // llave pública calza con la llave privada, no el primero que aparezca.
  const certificates = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [])
    .map((bag) => bag.cert)
    .filter((cert): cert is forge.pki.Certificate => Boolean(cert));
  const certificate = certificates.find((cert) => {
    const publicKey = cert.publicKey as forge.pki.rsa.PublicKey;
    return publicKey.n?.equals(privateKey.n) && publicKey.e?.equals(privateKey.e);
  });
  if (!certificate) throw new CertificateError('El archivo no trae el certificado que corresponde a su llave privada');

  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes();
  const derBuffer = Buffer.from(der, 'binary');
  const publicKey = certificate.publicKey as forge.pki.rsa.PublicKey;

  return {
    privateKeyPem: forge.pki.privateKeyToPem(privateKey),
    certificatePem: forge.pki.certificateToPem(certificate),
    certificateBase64: derBuffer.toString('base64'),
    modulusBase64: bigIntegerToBase64(publicKey.n),
    exponentBase64: bigIntegerToBase64(publicKey.e),
    holderRut: rutFromSubjectAltName(certificate) ?? rutFromSubject(certificate),
    holderName: describeName(certificate.subject),
    issuerName: describeName(certificate.issuer),
    notBefore: certificate.validity.notBefore,
    notAfter: certificate.validity.notAfter,
    fingerprintSha1: crypto.createHash('sha1').update(derBuffer).digest('hex'),
  };
}

/** Vigente en `at`: el SII rechaza lo firmado con un certificado vencido o aún no válido. */
export function isCertificateCurrent(certificate: Pick<DigitalCertificate, 'notBefore' | 'notAfter'>, at: Date = new Date()): boolean {
  return certificate.notBefore.getTime() <= at.getTime() && at.getTime() <= certificate.notAfter.getTime();
}
