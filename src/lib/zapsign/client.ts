/**
 * Cliente mínimo sobre `fetch` para la API de ZapSign — sin SDK externo, solo
 * las 2 llamadas que necesita el flujo de firma del contrato de candidatas.
 *
 * `ZAPSIGN_API_TOKEN` y `ZAPSIGN_BASE_URL` están configurados en producción
 * apuntando a la API real de ZapSign (`https://api.zapsign.com.br`) — ya no
 * al Sandbox. Si `ZAPSIGN_BASE_URL` faltara como variable de entorno, el
 * default de abajo cae a Sandbox, que no envía correos reales a la
 * candidata (así se manifestó el bug original: sin error visible, pero el
 * correo nunca llegaba).
 */

/**
 * Un valor de variable de entorno pegado desde un archivo guardado con BOM
 * (ej. UTF-8 con BOM de Notepad clásico, o `vercel env add` alimentado desde
 * un archivo así) arrastra un `﻿` invisible al inicio o espacios/saltos
 * de línea al final. `fetch` revienta al construir el header `Authorization`
 * con "Cannot convert argument to a ByteString" — un error que no dice nada
 * sobre la causa real. Se sanea acá, en el único lugar donde se leen estas
 * env vars, en vez de confiar en que quien las cargue nunca cometa este error.
 */
function cleanEnvValue(value: string): string {
  return value.replace(/^﻿/, '').trim();
}

const ZAPSIGN_BASE_URL = cleanEnvValue(process.env.ZAPSIGN_BASE_URL || 'https://sandbox.api.zapsign.com.br');

/**
 * Credenciales con las que se llama a ZapSign. Cada empresa puede conectar la
 * suya (`getCompanyZapsignConfig`); sin ella se usa la de la plataforma
 * (variables de entorno), que es como operan los clientes que no conectaron
 * nada.
 */
export interface ZapsignConfig {
  token: string;
  baseUrl: string;
}

export function platformZapsignConfig(): ZapsignConfig {
  const token = process.env.ZAPSIGN_API_TOKEN;
  if (!token) throw new Error('ZapSign no está configurado: conecta tu cuenta en Configuración → Empresa → Integraciones');
  return { token: cleanEnvValue(token), baseUrl: ZAPSIGN_BASE_URL };
}

/** `null` = la empresa no conectó la suya; se usa la de la plataforma. */
function resolveConfig(config?: ZapsignConfig | null): ZapsignConfig {
  return config ?? platformZapsignConfig();
}

/**
 * Error de la API de ZapSign. `message` es apto para mostrar; la respuesta
 * cruda del proveedor queda en `detail` solo para observabilidad.
 */
export class ZapsignApiError extends Error {
  constructor(
    message: string,
    readonly detail: string
  ) {
    super(message);
    this.name = 'ZapsignApiError';
  }
}

export interface CreateDocumentInput {
  name: string;
  pdfBuffer: Buffer;
  signerName: string;
  signerEmail: string;
}

export interface CreateDocumentResult {
  docToken: string;
  signUrl: string | null;
}

export async function createDocument(input: CreateDocumentInput, config?: ZapsignConfig | null): Promise<CreateDocumentResult> {
  const { token, baseUrl } = resolveConfig(config);
  const response = await fetch(`${baseUrl}/api/v1/docs/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      base64_pdf: input.pdfBuffer.toString('base64'),
      signers: [{ name: input.signerName, email: input.signerEmail, auth_mode: 'tokenEmail', send_automatic_email: true }],
      lang: 'es',
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new ZapsignApiError(
      'ZapSign no aceptó el documento. Revisa que el token de tu cuenta sea válido en Configuración → Empresa → Integraciones.',
      `creación (${response.status}): ${body.slice(0, 300)}`
    );
  }
  const data = await response.json();
  return { docToken: data.token, signUrl: data.signers?.[0]?.sign_url ?? null };
}

export interface DocumentStatus {
  status: 'pending' | 'signed';
  signedFileUrl: string | null;
}

/**
 * Reconsulta el estado real del documento contra la API de ZapSign — nunca
 * se confía en el body del webhook para decidir que algo está firmado (ver
 * `src/app/api/webhooks/zapsign/route.ts`), porque ZapSign no firma sus
 * webhooks con HMAC. Esta llamada, autenticada con nuestro propio token, es
 * la verificación real.
 */
export async function getDocumentStatus(docToken: string, config?: ZapsignConfig | null): Promise<DocumentStatus> {
  const { token, baseUrl } = resolveConfig(config);
  const response = await fetch(`${baseUrl}/api/v1/docs/${docToken}/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ZapSign rechazó la consulta de estado (${response.status}): ${body.slice(0, 300)}`);
  }
  const data = await response.json();
  return { status: data.status, signedFileUrl: data.signed_file ?? null };
}
