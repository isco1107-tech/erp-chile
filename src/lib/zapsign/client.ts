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

function requireToken(): string {
  const token = process.env.ZAPSIGN_API_TOKEN;
  if (!token) throw new Error('ZAPSIGN_API_TOKEN no está configurado');
  return cleanEnvValue(token);
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

export async function createDocument(input: CreateDocumentInput): Promise<CreateDocumentResult> {
  const response = await fetch(`${ZAPSIGN_BASE_URL}/api/v1/docs/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${requireToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      base64_pdf: input.pdfBuffer.toString('base64'),
      signers: [{ name: input.signerName, email: input.signerEmail, auth_mode: 'tokenEmail', send_automatic_email: true }],
      lang: 'es',
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ZapSign rechazó la creación del documento (${response.status}): ${body.slice(0, 300)}`);
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
export async function getDocumentStatus(docToken: string): Promise<DocumentStatus> {
  const response = await fetch(`${ZAPSIGN_BASE_URL}/api/v1/docs/${docToken}/`, {
    headers: { Authorization: `Bearer ${requireToken()}` },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ZapSign rechazó la consulta de estado (${response.status}): ${body.slice(0, 300)}`);
  }
  const data = await response.json();
  return { status: data.status, signedFileUrl: data.signed_file ?? null };
}
