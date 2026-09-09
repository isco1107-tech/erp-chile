import 'server-only';

/**
 * Envío de correo transaccional.
 *
 * Soporta dos proveedores por API HTTP (`fetch`), sin instalar sus SDK: es una
 * sola petición POST en cada caso y evita sumar dependencias a un proyecto que
 * ya arrastra advisories de terceros.
 *
 * - **Brevo**: permite verificar un remitente por dirección individual, sin
 *   dominio propio, y desde ahí enviar a cualquier destinatario.
 * - **Resend**: exige dominio verificado; sin él solo entrega al correo dueño
 *   de la cuenta, lo que sirve para probar pero no para invitar a nadie.
 *
 * Si hay ambas claves, gana Brevo por esa razón. Si no hay ninguna, el
 * transporte cae a consola en vez de fallar: un entorno sin credenciales debe
 * poder invitar gente y ver el enlace en el log, y una invitación NUNCA debe
 * perderse porque el proveedor esté caído — el registro en base ya se creó y el
 * enlace se puede copiar a mano desde el panel de Equipo.
 */

export interface EmailAttachment {
  filename: string;
  /** Contenido binario crudo — cada proveedor lo codifica a base64 recién al armar su request. */
  content: Buffer;
  contentType?: string;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
}

export type EmailDeliveryStatus = 'sent' | 'logged' | 'failed';
export type EmailProvider = 'brevo' | 'resend' | 'none';

export interface EmailResult {
  status: EmailDeliveryStatus;
  provider: EmailProvider;
  /** Motivo cuando `status` es `failed`; se registra, no se muestra al usuario final. */
  error?: string;
}

export interface SenderAddress {
  name: string;
  email: string;
}

/**
 * Separa "ERP <no-reply@x.cl>" en nombre y dirección. Brevo los exige por
 * separado; Resend acepta la forma combinada.
 */
export function parseSender(raw: string): SenderAddress {
  const match = raw.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (match && match[2]) {
    return { name: (match[1] || 'ERP').replace(/^"|"$/g, ''), email: match[2].trim() };
  }
  return { name: 'ERP', email: raw.trim() };
}

function getFromAddress(): string {
  return process.env.EMAIL_FROM ?? 'ERP <onboarding@resend.dev>';
}

export function getEmailProvider(): EmailProvider {
  if (process.env.BREVO_API_KEY) return 'brevo';
  if (process.env.RESEND_API_KEY) return 'resend';
  return 'none';
}

export function isEmailConfigured(): boolean {
  return getEmailProvider() !== 'none';
}

async function sendViaBrevo(input: SendEmailInput, apiKey: string): Promise<EmailResult> {
  const sender = parseSender(getFromAddress());
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender,
      to: [{ email: input.to }],
      subject: input.subject,
      htmlContent: input.html,
      textContent: input.text,
      ...(input.attachments && input.attachments.length > 0
        ? { attachment: input.attachments.map((a) => ({ name: a.filename, content: a.content.toString('base64') })) }
        : {}),
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error(`[email:brevo:fallo] ${response.status} al enviar a ${input.to}: ${detail}`);
    return { status: 'failed', provider: 'brevo', error: `${response.status}: ${detail}` };
  }
  return { status: 'sent', provider: 'brevo' };
}

async function sendViaResend(input: SendEmailInput, apiKey: string): Promise<EmailResult> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: getFromAddress(),
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      ...(input.attachments && input.attachments.length > 0
        ? { attachments: input.attachments.map((a) => ({ filename: a.filename, content: a.content.toString('base64') })) }
        : {}),
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error(`[email:resend:fallo] ${response.status} al enviar a ${input.to}: ${detail}`);
    return { status: 'failed', provider: 'resend', error: `${response.status}: ${detail}` };
  }
  return { status: 'sent', provider: 'resend' };
}

export async function sendEmail(input: SendEmailInput): Promise<EmailResult> {
  const provider = getEmailProvider();

  if (provider === 'none') {
    console.info(
      `[email:no-configurado] Para: ${input.to}\nAsunto: ${input.subject}\n${input.text}\n` +
        'Define BREVO_API_KEY (o RESEND_API_KEY) y EMAIL_FROM para enviar de verdad.'
    );
    return { status: 'logged', provider: 'none' };
  }

  try {
    if (provider === 'brevo') return await sendViaBrevo(input, process.env.BREVO_API_KEY!);
    return await sendViaResend(input, process.env.RESEND_API_KEY!);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[email:${provider}:fallo] excepción al enviar a ${input.to}: ${message}`);
    return { status: 'failed', provider, error: message };
  }
}

/**
 * URL base pública de la aplicación, para construir enlaces absolutos.
 *
 * En Vercel `VERCEL_PROJECT_PRODUCTION_URL` apunta al dominio estable de
 * producción; `VERCEL_URL` cambia en cada deploy y serviría un enlace que deja
 * de funcionar. `APP_URL` permite fijarlo a mano cuando hay dominio propio.
 */
export function getAppUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}
