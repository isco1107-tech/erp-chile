import { signEnveloped, type SigningCredentials } from './signature';
import { encodeLatin1 } from './envio';
import { cleanRut, validateRut } from '@/lib/chile/rut';

/**
 * Cliente de los servicios del SII para DTE (facturas, notas, guías):
 * semilla → token → subida del EnvioDTE → consulta de estado por Track ID.
 *
 * Certificación (`maullin`) y producción (`palena`) son servidores distintos
 * con los mismos servicios. Una empresa en certificación no puede subir a
 * producción ni al revés: el ambiente se guarda por empresa, nunca se deduce.
 *
 * `fetch` es inyectable para las pruebas; en uso real es el `fetch` global.
 */

export type SiiEnvironment = 'certificacion' | 'produccion';

const HOSTS: Record<SiiEnvironment, string> = {
  certificacion: 'maullin.sii.cl',
  produccion: 'palena.sii.cl',
};

/** El CGI de subida del SII rechaza clientes cuyo User-Agent no se declare como programa ("PROG"). */
const UPLOAD_USER_AGENT = 'Mozilla/4.0 (compatible; PROG 1.0; Aether ERP)';
const TIMEOUT_MS = 30_000;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class SiiServiceError extends Error {
  constructor(
    message: string,
    /** Código o estado que devolvió el SII, para observabilidad. */
    readonly siiCode?: string,
  ) {
    super(message);
  }
}

/** Operación RPC de Axis en el namespace de sus WSDL (`http://DefaultNamespace`). */
function operation(name: string, params = ''): string {
  return `<ns1:${name} xmlns:ns1="http://DefaultNamespace">${params}</ns1:${name}>`;
}

function soapEnvelope(body: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body>' +
    body +
    '</soapenv:Body></soapenv:Envelope>'
  );
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCharCode(Number.parseInt(dec, 10)))
    .replace(/&amp;/g, '&');
}

/** Texto de la primera etiqueta `tag` (con o sin prefijo `SII:`). */
export function tagText(xml: string, tag: string): string | null {
  const match = new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${tag}>`).exec(xml);
  return match ? match[1].trim() : null;
}

/** Los servicios SOAP del SII devuelven su respuesta como XML escapado dentro de `<xxxReturn>`. */
export function soapReturn(xml: string, operation: string): string {
  const inner = tagText(xml, `${operation}Return`);
  if (inner === null) throw new SiiServiceError(`El SII respondió algo inesperado a ${operation}`);
  return decodeEntities(inner);
}

async function post(fetchImpl: FetchLike, url: string, init: RequestInit): Promise<string> {
  let response: Response;
  try {
    response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new SiiServiceError('No se pudo conectar con el SII. Puede estar en mantención; intenta de nuevo en unos minutos.');
  }
  const text = await response.text();
  if (!response.ok) throw new SiiServiceError(`El SII respondió con un error (HTTP ${response.status})`, String(response.status));
  return text;
}

function soapPost(fetchImpl: FetchLike, env: SiiEnvironment, service: string, body: string): Promise<string> {
  return post(fetchImpl, `https://${HOSTS[env]}/DTEWS/${service}.jws`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
    body: soapEnvelope(body),
  });
}

/** Paso 1: semilla de un solo uso. */
export async function getSeed(env: SiiEnvironment, fetchImpl: FetchLike = fetch): Promise<string> {
  const answer = soapReturn(await soapPost(fetchImpl, env, 'CrSeed', operation('getSeed')), 'getSeed');
  const state = tagText(answer, 'ESTADO');
  const seed = tagText(answer, 'SEMILLA');
  if (state !== '00' || !seed) throw new SiiServiceError('El SII no entregó la semilla de autenticación', state ?? undefined);
  return seed;
}

/** Paso 2: token de sesión, firmando la semilla con el certificado de quien envía. */
export async function getToken(env: SiiEnvironment, credentials: SigningCredentials, fetchImpl: FetchLike = fetch): Promise<string> {
  const seed = await getSeed(env, fetchImpl);
  if (!/^\d+$/.test(seed)) throw new SiiServiceError('Semilla del SII con formato inesperado');
  const signed = signEnveloped(`<getToken><item><Semilla>${seed}</Semilla></item></getToken>`, credentials);
  const answer = soapReturn(await soapPost(fetchImpl, env, 'GetTokenFromSeed', operation('getToken', `<pszXml><![CDATA[${signed}]]></pszXml>`)), 'getToken');
  const state = tagText(answer, 'ESTADO');
  const token = tagText(answer, 'TOKEN');
  if (state !== '00' || !token) {
    throw new SiiServiceError(
      'El SII rechazó el certificado al autenticar. Revisa que esté vigente y que su titular esté autorizado para la empresa.',
      state ?? undefined,
    );
  }
  return token;
}

/** Significado de `STATUS` en la respuesta de DTEUpload. */
const UPLOAD_STATUS: Record<string, string> = {
  '1': 'El RUT que envía no tiene permiso para enviar documentos de esta empresa',
  '2': 'El archivo supera el tamaño permitido',
  '3': 'El archivo llegó incompleto',
  '5': 'La sesión con el SII no es válida; vuelve a intentarlo',
  '6': 'La empresa no está autorizada como emisor electrónico en este ambiente',
  '7': 'El envío no cumple el esquema del SII',
  '8': 'La firma del envío no es válida',
  '9': 'El sistema del SII está bloqueado; intenta más tarde',
};

function splitRut(rut: string): { body: string; dv: string } {
  const clean = cleanRut(rut);
  if (clean.length < 2 || !validateRut(clean)) throw new SiiServiceError(`RUT inválido: ${rut}`);
  return { body: clean.slice(0, -1), dv: clean.slice(-1) };
}

/** Paso 3: sube el EnvioDTE firmado. Devuelve el Track ID con que se consulta el resultado. */
export async function uploadEnvioDte(
  env: SiiEnvironment,
  params: { token: string; senderRut: string; companyRut: string; xml: string },
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const sender = splitRut(params.senderRut);
  const company = splitRut(params.companyRut);
  const form = new FormData();
  form.append('rutSender', sender.body);
  form.append('dvSender', sender.dv);
  form.append('rutCompany', company.body);
  form.append('dvCompany', company.dv);
  form.append('archivo', new Blob([new Uint8Array(encodeLatin1(params.xml))], { type: 'text/xml' }), 'envio_dte.xml');

  const answer = await post(fetchImpl, `https://${HOSTS[env]}/cgi_dte/UPL/DTEUpload`, {
    method: 'POST',
    headers: { 'User-Agent': UPLOAD_USER_AGENT, Cookie: `TOKEN=${params.token}` },
    body: form,
  });
  const status = tagText(answer, 'STATUS');
  const trackId = tagText(answer, 'TRACKID');
  if (status !== '0' || !trackId) {
    throw new SiiServiceError(UPLOAD_STATUS[status ?? ''] ?? 'El SII no aceptó el envío', status ?? undefined);
  }
  return trackId;
}

export type SiiUploadResult = {
  /**
   * `REPEATED`: el SII ya había recibido ese mismo envío (RPT). No es un
   * rechazo: los DTE pueden estar aceptados bajo el Track ID original, que es
   * el que hay que consultar.
   */
  status: 'SENT' | 'ACCEPTED' | 'ACCEPTED_WITH_OBJECTIONS' | 'REJECTED' | 'REPEATED';
  rawState: string;
  detail: string | null;
};

/** Estados de un envío que todavía se está procesando. */
const IN_PROCESS = new Set(['REC', 'SOK', 'CRT', 'FOK', 'PDR', 'PRD']);
/** Rechazo del envío completo: esquema, firma, carátula, o rechazado. */
const REJECTED = new Set(['RSC', 'RFR', 'RCT', 'RCH', 'RCO']);
/** Procesado con observaciones. */
const WITH_OBJECTIONS = new Set(['RPR', 'RLV']);

/**
 * Traduce la respuesta de `getEstUp` a un estado del documento. Para un
 * envío procesado (`EPR`) se miran los contadores: el sobre puede estar
 * procesado y aun así tener documentos rechazados. Un estado desconocido
 * se trata como "en proceso": nunca se da por aceptado algo que no se
 * entendió.
 */
export function interpretUploadState(answer: string): SiiUploadResult {
  const state = tagText(answer, 'ESTADO');
  if (!state) throw new SiiServiceError('El SII respondió la consulta sin estado');
  const detail = tagText(answer, 'GLOSA');
  if (state.startsWith('-') || /^\d+$/.test(state)) {
    throw new SiiServiceError(`El SII no pudo responder la consulta${detail ? `: ${detail}` : ''}`, state);
  }
  if (state === 'EPR') {
    // El SII repite los contadores por cada tipo de documento del sobre:
    // leer solo el primero daría por aceptado un 61 rechazado detrás de un 33.
    const count = (tag: string) =>
      [...answer.matchAll(new RegExp(`<(?:\\w+:)?${tag}>\\s*(\\d+)\\s*</(?:\\w+:)?${tag}>`, 'g'))].reduce((sum, m) => sum + Number(m[1]), 0);
    if (count('RECHAZADOS') > 0) return { status: 'REJECTED', rawState: state, detail };
    if (count('REPAROS') > 0) return { status: 'ACCEPTED_WITH_OBJECTIONS', rawState: state, detail };
    if (count('ACEPTADOS') > 0) return { status: 'ACCEPTED', rawState: state, detail };
    return { status: 'SENT', rawState: state, detail };
  }
  if (state === 'RPT') return { status: 'REPEATED', rawState: state, detail };
  if (WITH_OBJECTIONS.has(state)) return { status: 'ACCEPTED_WITH_OBJECTIONS', rawState: state, detail };
  if (REJECTED.has(state)) return { status: 'REJECTED', rawState: state, detail };
  if (IN_PROCESS.has(state)) return { status: 'SENT', rawState: state, detail };
  return { status: 'SENT', rawState: state, detail };
}

/** Paso 4: resultado del envío. */
export async function queryUploadStatus(
  env: SiiEnvironment,
  params: { token: string; companyRut: string; trackId: string },
  fetchImpl: FetchLike = fetch,
): Promise<SiiUploadResult> {
  if (!/^\d+$/.test(params.trackId)) throw new SiiServiceError('Track ID inválido');
  const company = splitRut(params.companyRut);
  const body = operation(
    'getEstUp',
    `<RutCompania>${company.body}</RutCompania><DvCompania>${company.dv}</DvCompania>` +
      `<TrackId>${params.trackId}</TrackId><Token>${params.token.replace(/[^\w.-]/g, '')}</Token>`,
  );
  return interpretUploadState(soapReturn(await soapPost(fetchImpl, env, 'QueryEstUp', body), 'getEstUp'));
}
