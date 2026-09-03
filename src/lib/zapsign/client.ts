/**
 * Cliente mínimo sobre `fetch` para la API de ZapSign — sin SDK externo, solo
 * las 2 llamadas que necesita el flujo de firma del contrato de candidatas.
 *
 * `ZAPSIGN_API_TOKEN` está guardado como variable de entorno (Sandbox por
 * ahora). La base URL apunta a Sandbox mientras se prueba la integración;
 * cambiar a producción es una decisión explícita de negocio (más
 * documentos "reales", con costo), no algo que este código decida solo —
 * ver `ZAPSIGN_BASE_URL` abajo.
 */

const ZAPSIGN_BASE_URL = process.env.ZAPSIGN_BASE_URL || 'https://sandbox.api.zapsign.com.br';

function requireToken(): string {
  const token = process.env.ZAPSIGN_API_TOKEN;
  if (!token) throw new Error('ZAPSIGN_API_TOKEN no está configurado');
  return token;
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
