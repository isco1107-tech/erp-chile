/**
 * Plantillas de los correos transaccionales.
 *
 * HTML con estilos en línea y tablas: los clientes de correo (sobre todo
 * Outlook) ignoran hojas de estilo externas y buena parte de flexbox. Cada
 * correo lleva además su versión en texto plano, que es lo que ven los lectores
 * de pantalla y lo que evita que el mensaje caiga en spam por venir solo en HTML.
 *
 * A diferencia de `mailer.ts`, este módulo NO lleva `server-only`: son
 * funciones puras de string, sin secretos ni acceso a datos, y marcarlas así
 * solo las volvía imposibles de testear.
 */

import type { CandidateStatus } from '@prisma/client';
import { formatCurrency } from '@/lib/chile/tax';

const BRAND = '#1e3a5f';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout(options: { title: string; body: string; ctaLabel: string; ctaUrl: string; footer: string }): string {
  return `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="background:${BRAND};padding:20px 24px;">
              <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">${escapeHtml(options.title)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;color:#1f2933;font-size:15px;line-height:1.6;">
              ${options.body}
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                <tr>
                  <td style="background:${BRAND};border-radius:8px;">
                    <a href="${options.ctaUrl}" style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;">${escapeHtml(options.ctaLabel)}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 6px;color:#64748b;font-size:13px;">Si el botón no funciona, copia y pega este enlace:</p>
              <p style="margin:0;word-break:break-all;"><a href="${options.ctaUrl}" style="color:${BRAND};font-size:13px;">${options.ctaUrl}</a></p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.5;">
              ${options.footer}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export interface InvitationEmailInput {
  companyName: string;
  roleLabel: string;
  inviterName: string;
  acceptUrl: string;
  expiresInDays: number;
}

export function buildInvitationEmail(input: InvitationEmailInput): { subject: string; html: string; text: string } {
  const subject = `Te invitaron a ${input.companyName}`;

  const html = layout({
    title: `Invitación a ${input.companyName}`,
    body: `
      <p style="margin:0 0 12px;"><strong>${escapeHtml(input.inviterName)}</strong> te invitó a unirte a
      <strong>${escapeHtml(input.companyName)}</strong> con el rol de <strong>${escapeHtml(input.roleLabel)}</strong>.</p>
      <p style="margin:0;">Para entrar necesitas crear tu contraseña. El enlace ya viene asociado a este correo,
      así que no tienes que escribirlo de nuevo.</p>
    `,
    ctaLabel: 'Crear mi cuenta',
    ctaUrl: input.acceptUrl,
    footer: `Este enlace vence en ${input.expiresInDays} días y sirve una sola vez.<br>
      Si no esperabas esta invitación, puedes ignorar este mensaje: sin crear la contraseña no se activa ninguna cuenta.`,
  });

  const text = [
    `${input.inviterName} te invitó a unirte a ${input.companyName} con el rol de ${input.roleLabel}.`,
    '',
    'Para entrar necesitas crear tu contraseña en este enlace:',
    input.acceptUrl,
    '',
    `El enlace vence en ${input.expiresInDays} días y sirve una sola vez.`,
    'Si no esperabas esta invitación, ignora este mensaje.',
  ].join('\n');

  return { subject, html, text };
}

export interface PasswordResetEmailInput {
  userName: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export function buildPasswordResetEmail(input: PasswordResetEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = 'Recupera tu contraseña';

  const html = layout({
    title: 'Recuperar contraseña',
    body: `
      <p style="margin:0 0 12px;">Hola ${escapeHtml(input.userName)}, recibimos una solicitud para restablecer
      la contraseña de tu cuenta.</p>
      <p style="margin:0;">Elige una nueva contraseña desde el siguiente enlace.</p>
    `,
    ctaLabel: 'Elegir nueva contraseña',
    ctaUrl: input.resetUrl,
    footer: `Este enlace vence en ${input.expiresInMinutes} minutos y sirve una sola vez.<br>
      Si no pediste el cambio, ignora este correo: tu contraseña actual sigue siendo válida y nadie puede
      cambiarla sin abrir este enlace.`,
  });

  const text = [
    `Hola ${input.userName}, recibimos una solicitud para restablecer la contraseña de tu cuenta.`,
    '',
    'Elige una nueva contraseña en este enlace:',
    input.resetUrl,
    '',
    `El enlace vence en ${input.expiresInMinutes} minutos y sirve una sola vez.`,
    'Si no pediste el cambio, ignora este correo: tu contraseña actual sigue siendo válida.',
  ].join('\n');

  return { subject, html, text };
}

export interface AccreditationEmailInput {
  companyName: string;
  projectName: string;
  fullName: string;
  role: string;
  organization?: string | null;
  accessLevelLabel: string;
  badgeCode: string;
  qrImageUrl: string;
  verifyUrl: string;
  /** Color de acento de la plantilla de diseño elegida (hex). El fondo con imagen/marca de agua no se intenta reproducir en el correo — es frágil entre clientes — así que solo se traslada el color; el diseño completo vive en `verifyUrl`. */
  accentColor?: string;
}

/**
 * Carta de presentación con el QR de acreditación. El QR codifica `verifyUrl`
 * (no los datos en texto plano): quien controla el ingreso escanea y ve la
 * ficha real desde el servidor, así que una imagen copiada o un código
 * editado a mano no sirve para falsificar el acceso.
 */
export function buildAccreditationEmail(input: AccreditationEmailInput): { subject: string; html: string; text: string } {
  const subject = `Tu acreditación para ${input.projectName}`;
  const accent = input.accentColor && /^#[0-9a-fA-F]{6}$/.test(input.accentColor) ? input.accentColor : BRAND;

  const html = `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="background:${accent};padding:20px 24px;">
              <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">${escapeHtml(input.companyName)}</p>
              <p style="margin:2px 0 0;color:#cbd5e1;font-size:12px;">${escapeHtml(input.projectName)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;color:#1f2933;font-size:15px;line-height:1.6;text-align:center;">
              <p style="margin:0 0 16px;text-align:left;">Hola <strong>${escapeHtml(input.fullName)}</strong>, esta es tu credencial de acceso para
              <strong>${escapeHtml(input.projectName)}</strong>. Preséntala (en pantalla o impresa) al ingresar.</p>
              <img src="${input.qrImageUrl}" alt="Código QR de acreditación" width="220" height="220" style="display:block;margin:0 auto 16px;border:1px solid #e2e8f0;border-radius:8px;" />
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="text-align:left;font-size:13px;border-collapse:collapse;">
                <tr><td style="padding:4px 0;color:#64748b;width:40%;">Rol</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(input.role)}</td></tr>
                ${input.organization ? `<tr><td style="padding:4px 0;color:#64748b;">Empresa/Proveedor</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(input.organization)}</td></tr>` : ''}
                <tr><td style="padding:4px 0;color:#64748b;">Nivel de acceso</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(input.accessLevelLabel)}</td></tr>
                <tr><td style="padding:4px 0;color:#64748b;">Código</td><td style="padding:4px 0;font-family:monospace;">${escapeHtml(input.badgeCode)}</td></tr>
              </table>
              <a href="${input.verifyUrl}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:${accent};color:#ffffff;font-weight:600;font-size:13px;text-decoration:none;border-radius:8px;">Ver credencial con diseño</a>
              <p style="margin:16px 0 0;color:#64748b;font-size:12px;text-align:left;">Si el código QR no se ve en tu correo, verifica tu acreditación en:<br>
              <a href="${input.verifyUrl}" style="color:${accent};word-break:break-all;">${input.verifyUrl}</a></p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.5;">
              Este QR es personal e intransferible. Si no esperabas este correo, ignóralo.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `Credencial de acceso — ${input.projectName} (${input.companyName})`,
    '',
    `Nombre: ${input.fullName}`,
    `Rol: ${input.role}`,
    ...(input.organization ? [`Empresa/Proveedor: ${input.organization}`] : []),
    `Nivel de acceso: ${input.accessLevelLabel}`,
    `Código: ${input.badgeCode}`,
    '',
    'Verifica tu acreditación en:',
    input.verifyUrl,
    '',
    'Este QR es personal e intransferible.',
  ].join('\n');

  return { subject, html, text };
}

export interface CandidateApplicationConfirmationEmailInput {
  fullName: string;
  projectName: string;
  companyName: string;
  folio: string;
}

/**
 * Confirmación a la postulante con su folio — a un correo externo, sin
 * cuenta ERP, así que igual que `buildPaymentReminderEmail` no reutiliza
 * `layout()` (pensado para acciones dentro de la app con botón de "Entrar").
 */
export function buildCandidateApplicationConfirmationEmail(input: CandidateApplicationConfirmationEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Recibimos tu postulación — ${input.projectName}`;

  const html = `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="background:${BRAND};padding:20px 24px;">
              <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">${escapeHtml(input.projectName)}</p>
              <p style="margin:2px 0 0;color:#cbd5e1;font-size:12px;">${escapeHtml(input.companyName)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;color:#1f2933;font-size:15px;line-height:1.6;">
              <p style="margin:0 0 12px;">Hola <strong>${escapeHtml(input.fullName)}</strong>, recibimos tu postulación correctamente.</p>
              <p style="margin:0 0 16px;">Tu número de folio es:</p>
              <p style="margin:0 0 16px;padding:14px 18px;background:#f8fafc;border:1px solid #e2e8f0;text-align:center;font-size:22px;font-weight:700;letter-spacing:0.5px;">${escapeHtml(input.folio)}</p>
              <p style="margin:0;">Guárdalo como comprobante. La organización revisará tu postulación y se pondrá en contacto contigo directamente si corresponde avanzar a la siguiente etapa.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.5;">
              Si no realizaste esta postulación, ignora este mensaje.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `Hola ${input.fullName}, recibimos tu postulación a ${input.projectName} (${input.companyName}).`,
    '',
    `Tu número de folio es: ${input.folio}`,
    '',
    'Guárdalo como comprobante. La organización se pondrá en contacto contigo si corresponde avanzar a la siguiente etapa.',
  ].join('\n');

  return { subject, html, text };
}

export interface NewCandidateApplicationNoticeEmailInput {
  projectName: string;
  folio: string;
  comuna: string;
  dashboardUrl: string;
}

/**
 * Aviso interno a la organización de que llegó una postulación nueva — a
 * diferencia del correo anterior, va a alguien CON cuenta ERP, así que sí
 * reutiliza `layout()` con su botón de "Entrar al sistema".
 */
export function buildNewCandidateApplicationNoticeEmail(input: NewCandidateApplicationNoticeEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Nueva postulación — ${input.projectName} (${input.folio})`;

  const html = layout({
    title: 'Nueva postulación recibida',
    body: `
      <p style="margin:0 0 12px;">Llegó una nueva postulación para <strong>${escapeHtml(input.projectName)}</strong>.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:13px;margin:0 0 12px;">
        <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Folio</td><td style="font-weight:600;">${escapeHtml(input.folio)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Comuna</td><td style="font-weight:600;">${escapeHtml(input.comuna)}</td></tr>
      </table>
      <p style="margin:0;">Revísala desde el panel de Candidatas.</p>
    `,
    ctaLabel: 'Ver postulaciones',
    ctaUrl: input.dashboardUrl,
    footer: 'Este es un aviso automático de nueva postulación.',
  });

  const text = [
    `Nueva postulación para ${input.projectName}`,
    `Folio: ${input.folio}`,
    `Comuna: ${input.comuna}`,
    '',
    `Revísala en: ${input.dashboardUrl}`,
  ].join('\n');

  return { subject, html, text };
}

export interface PaymentReminderDocument {
  dteLabel: string;
  folio: number | null;
  dueDate: Date | null;
  amount: number;
}

export interface PaymentReminderEmailInput {
  companyName: string;
  companyRut: string;
  companyPhone?: string | null;
  customerName: string;
  documents: PaymentReminderDocument[];
  totalDue: number;
}

/**
 * A diferencia de las anteriores, este correo va a un CLIENTE externo (no a un
 * usuario del ERP): no tiene sentido un botón "Entrar al sistema", así que no
 * reutiliza `layout()` (pensado para acciones dentro de la app) sino un cuerpo
 * propio, más simple, en el mismo lenguaje visual.
 */
export function buildPaymentReminderEmail(input: PaymentReminderEmailInput): { subject: string; html: string; text: string } {
  const subject =
    input.documents.length === 1
      ? `Recordatorio de pago — ${input.documents[0]!.dteLabel} N° ${input.documents[0]!.folio ?? '-'}`
      : `Recordatorio de pago — ${input.documents.length} documentos pendientes`;

  const rows = input.documents
    .map((doc) => {
      const due = doc.dueDate ? doc.dueDate.toLocaleDateString('es-CL') : 'Sin vencimiento';
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(doc.dteLabel)} N° ${doc.folio ?? '-'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(due)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${escapeHtml(formatCurrency(doc.amount))}</td>
      </tr>`;
    })
    .join('');

  const html = `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="background:${BRAND};padding:20px 24px;">
              <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">${escapeHtml(input.companyName)}</p>
              <p style="margin:2px 0 0;color:#cbd5e1;font-size:12px;">RUT ${escapeHtml(input.companyRut)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;color:#1f2933;font-size:15px;line-height:1.6;">
              <p style="margin:0 0 12px;">Estimado(a) <strong>${escapeHtml(input.customerName)}</strong>,</p>
              <p style="margin:0 0 16px;">Le escribimos para recordarle que tiene ${input.documents.length === 1 ? 'el siguiente documento pendiente de pago' : 'los siguientes documentos pendientes de pago'} con nosotros:</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
                <tr style="background:#f8fafc;">
                  <th style="padding:6px 8px;text-align:left;color:#64748b;">Documento</th>
                  <th style="padding:6px 8px;text-align:left;color:#64748b;">Vencimiento</th>
                  <th style="padding:6px 8px;text-align:right;color:#64748b;">Monto</th>
                </tr>
                ${rows}
              </table>
              <p style="margin:16px 0 0;font-size:16px;"><strong>Total pendiente: ${escapeHtml(formatCurrency(input.totalDue))}</strong></p>
              <p style="margin:16px 0 0;">Si ya realizó este pago, puede ignorar este mensaje. Ante cualquier duda, no dude en responder este correo${input.companyPhone ? ` o contactarnos al ${escapeHtml(input.companyPhone)}` : ''}.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.5;">
              Este es un recordatorio automático enviado por ${escapeHtml(input.companyName)}.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `${input.companyName} (RUT ${input.companyRut})`,
    '',
    `Estimado(a) ${input.customerName},`,
    '',
    `Le recordamos ${input.documents.length === 1 ? 'el siguiente documento pendiente de pago' : 'los siguientes documentos pendientes de pago'}:`,
    ...input.documents.map(
      (doc) =>
        `- ${doc.dteLabel} N° ${doc.folio ?? '-'} — vence ${doc.dueDate ? doc.dueDate.toLocaleDateString('es-CL') : 'sin vencimiento'} — ${formatCurrency(doc.amount)}`
    ),
    '',
    `Total pendiente: ${formatCurrency(input.totalDue)}`,
    '',
    'Si ya realizó este pago, puede ignorar este mensaje.',
  ].join('\n');

  return { subject, html, text };
}

export interface InstallmentReminderDocument {
  installmentNumber: number;
  installmentCount: number;
  dueDate: Date;
  amount: number;
  penaltyApplied: number;
}

export interface InstallmentReminderEmailInput {
  companyName: string;
  companyRut: string;
  companyPhone?: string | null;
  customerName: string;
  installments: InstallmentReminderDocument[];
  totalDue: number;
}

/**
 * Recordatorio de cuotas vencidas de un plan de pago — mismo formato que
 * `buildPaymentReminderEmail` (cliente externo, sin cuenta ERP, sin botón
 * "Entrar al sistema"), adaptado a `{cuota N de M, vencimiento, monto, multa
 * aplicada}` en vez de folios de documento tributario.
 */
export function buildInstallmentReminderEmail(input: InstallmentReminderEmailInput): { subject: string; html: string; text: string } {
  const subject =
    input.installments.length === 1
      ? `Recordatorio de pago — Cuota ${input.installments[0]!.installmentNumber} de ${input.installments[0]!.installmentCount}`
      : `Recordatorio de pago — ${input.installments.length} cuotas pendientes`;

  const rows = input.installments
    .map((inst) => {
      const due = inst.dueDate.toLocaleDateString('es-CL');
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">Cuota ${inst.installmentNumber} de ${inst.installmentCount}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(due)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${escapeHtml(formatCurrency(inst.amount))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${inst.penaltyApplied > 0 ? escapeHtml(formatCurrency(inst.penaltyApplied)) : '—'}</td>
      </tr>`;
    })
    .join('');

  const html = `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="background:${BRAND};padding:20px 24px;">
              <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">${escapeHtml(input.companyName)}</p>
              <p style="margin:2px 0 0;color:#cbd5e1;font-size:12px;">RUT ${escapeHtml(input.companyRut)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;color:#1f2933;font-size:15px;line-height:1.6;">
              <p style="margin:0 0 12px;">Estimado(a) <strong>${escapeHtml(input.customerName)}</strong>,</p>
              <p style="margin:0 0 16px;">Le escribimos para recordarle que tiene ${input.installments.length === 1 ? 'la siguiente cuota pendiente de pago' : 'las siguientes cuotas pendientes de pago'} de su plan de pago:</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
                <tr style="background:#f8fafc;">
                  <th style="padding:6px 8px;text-align:left;color:#64748b;">Cuota</th>
                  <th style="padding:6px 8px;text-align:left;color:#64748b;">Vencimiento</th>
                  <th style="padding:6px 8px;text-align:right;color:#64748b;">Monto</th>
                  <th style="padding:6px 8px;text-align:right;color:#64748b;">Multa aplicada</th>
                </tr>
                ${rows}
              </table>
              <p style="margin:16px 0 0;font-size:16px;"><strong>Total pendiente: ${escapeHtml(formatCurrency(input.totalDue))}</strong></p>
              <p style="margin:16px 0 0;">Si ya realizó este pago, puede ignorar este mensaje. Ante cualquier duda, no dude en responder este correo${input.companyPhone ? ` o contactarnos al ${escapeHtml(input.companyPhone)}` : ''}.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.5;">
              Este es un recordatorio automático enviado por ${escapeHtml(input.companyName)}.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `${input.companyName} (RUT ${input.companyRut})`,
    '',
    `Estimado(a) ${input.customerName},`,
    '',
    `Le recordamos ${input.installments.length === 1 ? 'la siguiente cuota pendiente de pago' : 'las siguientes cuotas pendientes de pago'}:`,
    ...input.installments.map(
      (inst) =>
        `- Cuota ${inst.installmentNumber} de ${inst.installmentCount} — vence ${inst.dueDate.toLocaleDateString('es-CL')} — ${formatCurrency(inst.amount)}${inst.penaltyApplied > 0 ? ` (incluye multa de ${formatCurrency(inst.penaltyApplied)})` : ''}`
    ),
    '',
    `Total pendiente: ${formatCurrency(input.totalDue)}`,
    '',
    'Si ya realizó este pago, puede ignorar este mensaje.',
  ].join('\n');

  return { subject, html, text };
}

export interface OperationalAlertLowStockRow {
  sku: string;
  name: string;
  totalStock: number;
  minStock: number;
  /** Cantidad sugerida a reponer (hasta el doble del mínimo) — `undefined` si no se pudo calcular. */
  suggestedQuantity?: number;
  /** Último proveedor al que se le compró este producto, o `null` si nunca se ha comprado. */
  suggestedSupplier?: string | null;
  lastUnitCost?: number | null;
}

export interface OperationalAlertPendingApprovalRow {
  folio: string;
  contactName: string;
  totalAmount: number;
  daysPending: number;
}

export interface OperationalAlertOverdueReceivableRow {
  folio: string;
  contactName: string;
  pendingAmount: number;
  daysOverdue: number;
}

export interface OperationalAlertExpiringContractRow {
  candidateName: string;
  documentTitle: string;
  /** Negativo si ya venció. */
  daysUntilExpiry: number;
}

export interface OperationalAlertMismatchedPurchaseRow {
  folio: string;
  contactName: string;
  totalAmount: number;
  matchNotes: string;
}

export interface OperationalAlertEmailInput {
  companyName: string;
  lowStock: OperationalAlertLowStockRow[];
  pendingApprovals: OperationalAlertPendingApprovalRow[];
  overdueReceivables: OperationalAlertOverdueReceivableRow[];
  expiringContracts: OperationalAlertExpiringContractRow[];
  mismatchedPurchases: OperationalAlertMismatchedPurchaseRow[];
  dashboardUrl: string;
}

/** Correo diario de operación: productos bajo su stock mínimo, compras que
 * llevan días esperando aprobación o con mismatch de 3 vías sin resolver,
 * cuentas por cobrar vencidas y contratos de imagen por vencer. Pensado como
 * destino de `runOperationalAlertsCron` — ver
 * `src/modules/alerts/services/operational-alerts.service.ts` — pero el
 * mismo endpoint que lo dispara también devuelve los datos crudos en JSON,
 * así que una automatización externa (n8n) puede reusarlos para postear en
 * Slack en vez de (o además de) este correo. */
export function buildOperationalAlertEmail(input: OperationalAlertEmailInput): { subject: string; html: string; text: string } {
  const issueCount =
    input.lowStock.length +
    input.pendingApprovals.length +
    input.overdueReceivables.length +
    input.expiringContracts.length +
    input.mismatchedPurchases.length;
  const subject = `Alerta operativa — ${issueCount} punto${issueCount === 1 ? '' : 's'} que revisar`;

  const stockRows = input.lowStock
    .map(
      (row) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(row.sku)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(row.name)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${row.totalStock}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${row.minStock}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${row.suggestedQuantity ?? '—'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${row.suggestedSupplier ? escapeHtml(row.suggestedSupplier) : '<span style="color:#94a3b8;">sin compras previas</span>'}</td>
      </tr>`
    )
    .join('');

  const approvalRows = input.pendingApprovals
    .map(
      (row) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(row.folio)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(row.contactName)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${escapeHtml(formatCurrency(row.totalAmount))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${row.daysPending} día${row.daysPending === 1 ? '' : 's'}</td>
      </tr>`
    )
    .join('');

  const receivableRows = input.overdueReceivables
    .map(
      (row) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(row.folio)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(row.contactName)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${escapeHtml(formatCurrency(row.pendingAmount))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${row.daysOverdue} día${row.daysOverdue === 1 ? '' : 's'}</td>
      </tr>`
    )
    .join('');

  const contractRows = input.expiringContracts
    .map(
      (row) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(row.candidateName)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(row.documentTitle)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${row.daysUntilExpiry < 0 ? `Vencido hace ${-row.daysUntilExpiry} día(s)` : `En ${row.daysUntilExpiry} día(s)`}</td>
      </tr>`
    )
    .join('');

  const mismatchRows = input.mismatchedPurchases
    .map(
      (row) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(row.folio)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(row.contactName)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${escapeHtml(formatCurrency(row.totalAmount))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(row.matchNotes)}</td>
      </tr>`
    )
    .join('');

  const html = `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="background:${BRAND};padding:20px 24px;">
              <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">${escapeHtml(input.companyName)}</p>
              <p style="margin:2px 0 0;color:#cbd5e1;font-size:12px;">Alerta operativa diaria</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;color:#1f2933;font-size:15px;line-height:1.6;">
              ${
                input.lowStock.length > 0
                  ? `<p style="margin:0 0 8px;font-weight:600;">Stock bajo el mínimo (${input.lowStock.length})</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;margin-bottom:20px;">
                <tr style="background:#f8fafc;">
                  <th style="padding:6px 8px;text-align:left;color:#64748b;">SKU</th>
                  <th style="padding:6px 8px;text-align:left;color:#64748b;">Producto</th>
                  <th style="padding:6px 8px;text-align:right;color:#64748b;">Stock actual</th>
                  <th style="padding:6px 8px;text-align:right;color:#64748b;">Mínimo</th>
                  <th style="padding:6px 8px;text-align:right;color:#64748b;">Sugerido</th>
                  <th style="padding:6px 8px;text-align:left;color:#64748b;">Proveedor habitual</th>
                </tr>
                ${stockRows}
              </table>`
                  : ''
              }
              ${
                input.pendingApprovals.length > 0
                  ? `<p style="margin:0 0 8px;font-weight:600;">Compras esperando aprobación (${input.pendingApprovals.length})</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
                <tr style="background:#f8fafc;">
                  <th style="padding:6px 8px;text-align:left;color:#64748b;">Folio</th>
                  <th style="padding:6px 8px;text-align:left;color:#64748b;">Proveedor</th>
                  <th style="padding:6px 8px;text-align:right;color:#64748b;">Monto</th>
                  <th style="padding:6px 8px;text-align:right;color:#64748b;">Esperando</th>
                </tr>
                ${approvalRows}
              </table>`
                  : ''
              }
              ${
                input.mismatchedPurchases.length > 0
                  ? `<p style="margin:0 0 8px;font-weight:600;">Compras con diferencia sin resolver (${input.mismatchedPurchases.length})</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;margin-bottom:20px;">
                <tr style="background:#f8fafc;">
                  <th style="padding:6px 8px;text-align:left;color:#64748b;">Folio</th>
                  <th style="padding:6px 8px;text-align:left;color:#64748b;">Proveedor</th>
                  <th style="padding:6px 8px;text-align:right;color:#64748b;">Monto</th>
                  <th style="padding:6px 8px;text-align:left;color:#64748b;">Diferencia</th>
                </tr>
                ${mismatchRows}
              </table>`
                  : ''
              }
              ${
                input.overdueReceivables.length > 0
                  ? `<p style="margin:0 0 8px;font-weight:600;">Cuentas por cobrar vencidas (${input.overdueReceivables.length})</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;margin-bottom:20px;">
                <tr style="background:#f8fafc;">
                  <th style="padding:6px 8px;text-align:left;color:#64748b;">Folio</th>
                  <th style="padding:6px 8px;text-align:left;color:#64748b;">Cliente</th>
                  <th style="padding:6px 8px;text-align:right;color:#64748b;">Saldo</th>
                  <th style="padding:6px 8px;text-align:right;color:#64748b;">Vencido hace</th>
                </tr>
                ${receivableRows}
              </table>`
                  : ''
              }
              ${
                input.expiringContracts.length > 0
                  ? `<p style="margin:0 0 8px;font-weight:600;">Contratos de imagen por vencer (${input.expiringContracts.length})</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
                <tr style="background:#f8fafc;">
                  <th style="padding:6px 8px;text-align:left;color:#64748b;">Candidata</th>
                  <th style="padding:6px 8px;text-align:left;color:#64748b;">Documento</th>
                  <th style="padding:6px 8px;text-align:right;color:#64748b;">Vencimiento</th>
                </tr>
                ${contractRows}
              </table>`
                  : ''
              }
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.5;">
              Alerta automática diaria de ${escapeHtml(input.companyName)}. <a href="${input.dashboardUrl}" style="color:${BRAND};">Ir al panel</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `${input.companyName} — Alerta operativa diaria`,
    '',
    ...(input.lowStock.length > 0
      ? [
          `Stock bajo el mínimo (${input.lowStock.length}):`,
          ...input.lowStock.map(
            (row) =>
              `- ${row.sku} ${row.name}: ${row.totalStock} disponibles (mínimo ${row.minStock})` +
              (row.suggestedQuantity ? ` — reponer ${row.suggestedQuantity}${row.suggestedSupplier ? ` a ${row.suggestedSupplier}` : ' (sin compras previas)'}` : '')
          ),
          '',
        ]
      : []),
    ...(input.pendingApprovals.length > 0
      ? [
          `Compras esperando aprobación (${input.pendingApprovals.length}):`,
          ...input.pendingApprovals.map(
            (row) => `- Folio ${row.folio} — ${row.contactName} — ${formatCurrency(row.totalAmount)} — ${row.daysPending} día(s) esperando`
          ),
          '',
        ]
      : []),
    ...(input.mismatchedPurchases.length > 0
      ? [
          `Compras con diferencia sin resolver (${input.mismatchedPurchases.length}):`,
          ...input.mismatchedPurchases.map(
            (row) => `- Folio ${row.folio} — ${row.contactName} — ${formatCurrency(row.totalAmount)} — ${row.matchNotes}`
          ),
          '',
        ]
      : []),
    ...(input.overdueReceivables.length > 0
      ? [
          `Cuentas por cobrar vencidas (${input.overdueReceivables.length}):`,
          ...input.overdueReceivables.map(
            (row) => `- Folio ${row.folio} — ${row.contactName} — ${formatCurrency(row.pendingAmount)} — vencido hace ${row.daysOverdue} día(s)`
          ),
          '',
        ]
      : []),
    ...(input.expiringContracts.length > 0
      ? [
          `Contratos de imagen por vencer (${input.expiringContracts.length}):`,
          ...input.expiringContracts.map(
            (row) =>
              `- ${row.candidateName} — ${row.documentTitle} — ${row.daysUntilExpiry < 0 ? `vencido hace ${-row.daysUntilExpiry} día(s)` : `en ${row.daysUntilExpiry} día(s)`}`
          ),
          '',
        ]
      : []),
    `Panel: ${input.dashboardUrl}`,
  ].join('\n');

  return { subject, html, text };
}

export interface ContractSignedNoticeEmailInput {
  candidateName: string;
  documentTitle: string;
  dashboardUrl: string;
}

/** Aviso al staff de que una firma electrónica (ZapSign) se completó — antes
 * el webhook de ZapSign actualizaba el documento y ahí terminaba, sin avisar
 * a nadie; había que entrar al panel a enterarse. */
export function buildContractSignedNoticeEmail(input: ContractSignedNoticeEmailInput): { subject: string; html: string; text: string } {
  const subject = `Firma completada — ${input.documentTitle} de ${input.candidateName}`;

  const html = layout({
    title: 'Firma electrónica completada',
    body: `<p style="margin:0 0 12px;"><strong>${escapeHtml(input.candidateName)}</strong> firmó electrónicamente el documento
    <strong>${escapeHtml(input.documentTitle)}</strong>. El PDF firmado ya quedó guardado en su ficha.</p>`,
    ctaLabel: 'Ver ficha de la candidata',
    ctaUrl: input.dashboardUrl,
    footer: 'Aviso automático al completarse una firma electrónica.',
  });

  const text = [
    `Firma completada — ${input.documentTitle} de ${input.candidateName}`,
    '',
    `${input.candidateName} firmó electrónicamente "${input.documentTitle}". El PDF firmado ya quedó guardado en su ficha.`,
    '',
    `Ver ficha: ${input.dashboardUrl}`,
  ].join('\n');

  return { subject, html, text };
}

export interface SponsorshipPaymentConfirmationEmailInput {
  contactName: string;
  projectName: string;
  companyName: string;
  tierLabel: string;
  paidAmount: number;
  isBarter: boolean;
}

/** Confirmación de pago de un contrato de auspicio — mismo criterio que
 * `buildTicketConfirmationEmail`/`buildVoteConfirmationEmail`: se dispara al
 * confirmar el pago (`updateSponsorshipPayment`), no al crear el contrato.
 * Puramente informativo (sin botón de acción), por eso no usa `layout()`. */
export function buildSponsorshipPaymentConfirmationEmail(
  input: SponsorshipPaymentConfirmationEmailInput
): { subject: string; html: string; text: string } {
  const subject = `Confirmamos el pago de tu auspicio — ${input.projectName}`;

  const html = `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="background:${BRAND};padding:20px 24px;">
              <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">${escapeHtml(input.companyName)}</p>
              <p style="margin:2px 0 0;color:#cbd5e1;font-size:12px;">${escapeHtml(input.projectName)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;color:#1f2933;font-size:15px;line-height:1.6;">
              <p style="margin:0 0 16px;">Hola <strong>${escapeHtml(input.contactName)}</strong>, confirmamos la recepción del pago de tu
              auspicio a <strong>${escapeHtml(input.projectName)}</strong>. ¡Gracias por tu apoyo!</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-collapse:collapse;">
                <tr><td style="padding:4px 0;color:#64748b;width:40%;">Nivel de auspicio</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(input.tierLabel)}</td></tr>
                <tr><td style="padding:4px 0;color:#64748b;">Monto pagado</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(formatCurrency(input.paidAmount))}</td></tr>
                ${input.isBarter ? '<tr><td style="padding:4px 0;color:#64748b;">Canje</td><td style="padding:4px 0;font-weight:600;">Incluye componente en canje, según lo acordado</td></tr>' : ''}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.5;">
              Si no reconoces este auspicio, contáctanos respondiendo este correo.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `Pago de auspicio confirmado — ${input.projectName} (${input.companyName})`,
    '',
    `Contacto: ${input.contactName}`,
    `Nivel de auspicio: ${input.tierLabel}`,
    `Monto pagado: ${formatCurrency(input.paidAmount)}`,
    ...(input.isBarter ? ['Incluye componente en canje, según lo acordado en el contrato.'] : []),
    '',
    'Gracias por tu apoyo.',
  ].join('\n');

  return { subject, html, text };
}

export interface AccountLockedNoticeEmailInput {
  lockedUserName: string;
  lockedUserEmail: string;
  lockoutMinutes: number;
  maxAttempts: number;
}

/** Aviso a Dueños/Administradores cuando una cuenta del equipo se bloquea
 * por 5 intentos de contraseña seguidos — antes esto solo quedaba en
 * `User.loginLockedUntil`, invisible salvo revisando la base a mano. No es
 * necesariamente un ataque (puede ser la propia persona olvidando su
 * contraseña), por eso el tono es informativo, no de alarma. */
export function buildAccountLockedNoticeEmail(input: AccountLockedNoticeEmailInput): { subject: string; html: string; text: string } {
  const subject = `Cuenta bloqueada por intentos fallidos — ${input.lockedUserEmail}`;

  const html = `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="background:${BRAND};padding:20px 24px;">
              <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">Aviso de seguridad</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;color:#1f2933;font-size:15px;line-height:1.6;">
              <p style="margin:0 0 12px;">La cuenta de <strong>${escapeHtml(input.lockedUserName)}</strong>
              (${escapeHtml(input.lockedUserEmail)}) quedó bloqueada por ${input.maxAttempts} intentos de contraseña incorrecta seguidos.
              Se desbloquea sola en ${input.lockoutMinutes} minutos.</p>
              <p style="margin:0;color:#64748b;font-size:13px;">Si esta persona no reconoce estos intentos, podría ser alguien tratando de
              adivinar su contraseña — conviene avisarle y, si tiene dudas, cambiarla apenas se desbloquee.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `Aviso de seguridad`,
    '',
    `La cuenta de ${input.lockedUserName} (${input.lockedUserEmail}) quedó bloqueada por ${input.maxAttempts} intentos de contraseña incorrecta seguidos.`,
    `Se desbloquea sola en ${input.lockoutMinutes} minutos.`,
    '',
    'Si esta persona no reconoce estos intentos, podría ser alguien tratando de adivinar su contraseña.',
  ].join('\n');

  return { subject, html, text };
}

export interface AgentDigestEmailInput {
  companyName: string;
  priorities: string[];
  dashboardUrl: string;
}

/** Resumen ejecutivo diario del agente CEO virtual (módulo `hasCrm`) — antes
 * de esto, las 2-3 prioridades que el CEO condensa del trabajo de
 * CFO/COO/Ventas solo se veían entrando al dashboard de agentes; si nadie
 * entraba, ese trabajo quedaba invisible. */
export function buildAgentDigestEmail(input: AgentDigestEmailInput): { subject: string; html: string; text: string } {
  const subject = `Prioridades de hoy — ${input.companyName}`;

  const items = input.priorities.map((p) => `<li style="margin:0 0 8px;">${escapeHtml(p)}</li>`).join('');

  const html = layout({
    title: 'Resumen ejecutivo del día',
    body: `<p style="margin:0 0 12px;">Tu equipo ejecutivo virtual (CFO, COO, Ventas y CEO) revisó los datos del negocio y
    priorizó lo siguiente:</p>
    <ol style="margin:0 0 16px;padding-left:20px;">${items}</ol>`,
    ctaLabel: 'Ver todas las recomendaciones',
    ctaUrl: input.dashboardUrl,
    footer: 'Resumen automático diario del módulo de Inteligencia de Negocio.',
  });

  const text = [
    `Prioridades de hoy — ${input.companyName}`,
    '',
    ...input.priorities.map((p, i) => `${i + 1}. ${p}`),
    '',
    `Ver todas las recomendaciones: ${input.dashboardUrl}`,
  ].join('\n');

  return { subject, html, text };
}

export interface CandidateStatusChangeEmailInput {
  fullName: string;
  projectName: string;
  companyName: string;
  status: CandidateStatus;
}

/** Paleta de la página pública de postulación (`prompt-modulo-postulaciones.md`,
 * Sección 5): noche índigo + champán/oro viejo para la celebración, para que el
 * correo se sienta parte del mismo certamen y no un aviso de sistema genérico. */
const PAGEANT_INDIGO = '#101638';
const PAGEANT_GOLD = '#A8823F';

const CELEBRATION_COPY: Partial<Record<CandidateStatus, { badge: string; headline: string; paragraph: string }>> = {
  CALLED_TO_CASTING: {
    badge: 'Casting',
    headline: '¡Felicitaciones, pasaste a casting!',
    paragraph:
      'Revisamos tu postulación y queremos verte en persona: quedaste citada a la instancia de casting. ' +
      'La organización te contactará pronto por teléfono o correo con la fecha, hora y lugar exactos.',
  },
  OFFICIAL_CANDIDATE: {
    badge: 'Candidata oficial',
    headline: '¡Felicitaciones, eres candidata oficial!',
    paragraph:
      'Tu postulación fue seleccionada: pasas a ser candidata oficial del certamen. Nos pondremos en contacto ' +
      'contigo para coordinar los próximos pasos — ensayos, talleres y la documentación del proceso.',
  },
  FINALIST: {
    badge: 'Finalista',
    headline: '¡Felicitaciones, eres finalista!',
    paragraph:
      'Avanzaste a la ronda final. Estás entre las candidatas que competirán por la corona — te contactaremos ' +
      'con todos los detalles de esta etapa.',
  },
  WINNER: {
    badge: 'Ganadora',
    headline: '¡Felicitaciones, eres la ganadora!',
    paragraph:
      'Tu camino en el certamen culminó de la mejor forma posible. Nos pondremos en contacto contigo de ' +
      'inmediato para coordinar todo lo que sigue.',
  },
};

function buildCandidateCelebrationEmail(
  input: CandidateStatusChangeEmailInput,
  copy: { badge: string; headline: string; paragraph: string }
): { subject: string; html: string; text: string } {
  const subject = `${copy.headline} — ${input.projectName}`;

  const html = `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="background:${PAGEANT_INDIGO};padding:28px 24px;text-align:center;">
              <p style="margin:0 0 8px;display:inline-block;padding:4px 12px;border:1px solid ${PAGEANT_GOLD};color:${PAGEANT_GOLD};font-size:11px;letter-spacing:1px;text-transform:uppercase;">${escapeHtml(copy.badge)}</p>
              <p style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">${escapeHtml(copy.headline)}</p>
              <p style="margin:6px 0 0;color:#cbd5e1;font-size:13px;">${escapeHtml(input.projectName)} · ${escapeHtml(input.companyName)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;color:#1f2933;font-size:15px;line-height:1.6;">
              <p style="margin:0 0 12px;">Hola <strong>${escapeHtml(input.fullName)}</strong>,</p>
              <p style="margin:0;">${escapeHtml(copy.paragraph)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.5;">
              Este correo confirma un cambio de estado en tu postulación a ${escapeHtml(input.projectName)}.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `${copy.headline} — ${input.projectName}`,
    '',
    `Hola ${input.fullName},`,
    '',
    copy.paragraph,
  ].join('\n');

  return { subject, html, text };
}

function buildCandidateRejectedEmail(input: CandidateStatusChangeEmailInput): { subject: string; html: string; text: string } {
  const subject = `Gracias por participar en ${input.projectName}`;

  const html = `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="background:${BRAND};padding:20px 24px;">
              <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">${escapeHtml(input.projectName)}</p>
              <p style="margin:2px 0 0;color:#cbd5e1;font-size:12px;">${escapeHtml(input.companyName)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;color:#1f2933;font-size:15px;line-height:1.6;">
              <p style="margin:0 0 12px;">Hola <strong>${escapeHtml(input.fullName)}</strong>,</p>
              <p style="margin:0 0 12px;">Queremos agradecerte sinceramente por haber postulado a <strong>${escapeHtml(input.projectName)}</strong> y por el
              tiempo que dedicaste a todo el proceso.</p>
              <p style="margin:0 0 12px;">En esta oportunidad tu postulación no continuará a la siguiente etapa. Fue un proceso muy
              competitivo y valoramos mucho tu interés en participar.</p>
              <p style="margin:0;">Te invitamos a estar atenta a futuras convocatorias.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.5;">
              Este correo confirma un cambio de estado en tu postulación a ${escapeHtml(input.projectName)}.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `Gracias por participar en ${input.projectName}`,
    '',
    `Hola ${input.fullName},`,
    '',
    `Queremos agradecerte sinceramente por haber postulado a ${input.projectName} y por el tiempo que dedicaste a todo el proceso.`,
    '',
    'En esta oportunidad tu postulación no continuará a la siguiente etapa. Fue un proceso muy competitivo y valoramos mucho tu interés en participar.',
    '',
    'Te invitamos a estar atenta a futuras convocatorias.',
  ].join('\n');

  return { subject, html, text };
}

/**
 * Punto único de decisión de qué correo (si corresponde alguno) dispara un
 * cambio de estado de candidata. Devuelve `null` para estados que no
 * necesitan aviso a la postulante: `APPLICANT` (ya cubierto por
 * `buildCandidateApplicationConfirmationEmail` al momento de postular),
 * `UNDER_REVIEW` (estado interno, sin novedad que comunicar) y `WITHDRAWN`
 * (la propia candidata se retiró; no tiene sentido agradecerle su
 * participación como si la hubiéramos descartado nosotros).
 */
export function buildCandidateStatusChangeEmail(
  input: CandidateStatusChangeEmailInput
): { subject: string; html: string; text: string } | null {
  const celebration = CELEBRATION_COPY[input.status];
  if (celebration) return buildCandidateCelebrationEmail(input, celebration);
  if (input.status === 'REJECTED') return buildCandidateRejectedEmail(input);
  return null;
}

export interface VoteConfirmationEmailInput {
  projectName: string;
  companyName: string;
  candidateName: string;
  voteCount: number;
  totalAmount: number;
}

/** Confirmación de pago de votos — mismo criterio que
 * `buildTicketConfirmationEmail` (se dispara al confirmar el pago, no al
 * enviar el formulario: una orden `UNPAID` no es un voto real todavía, ver
 * `getVoteLeaderboard`), pero sin QR porque un voto no es una entrada física
 * que alguien deba presentar. */
export function buildVoteConfirmationEmail(input: VoteConfirmationEmailInput): { subject: string; html: string; text: string } {
  const subject = `Confirmamos tu voto por ${input.candidateName} — ${input.projectName}`;

  const html = `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="background:${BRAND};padding:20px 24px;">
              <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">${escapeHtml(input.companyName)}</p>
              <p style="margin:2px 0 0;color:#cbd5e1;font-size:12px;">${escapeHtml(input.projectName)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;color:#1f2933;font-size:15px;line-height:1.6;">
              <p style="margin:0 0 16px;">Confirmamos tu pago. ¡Gracias por apoyar a
              <strong>${escapeHtml(input.candidateName)}</strong>!</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-collapse:collapse;">
                <tr><td style="padding:4px 0;color:#64748b;width:40%;">Candidata</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(input.candidateName)}</td></tr>
                <tr><td style="padding:4px 0;color:#64748b;">Votos</td><td style="padding:4px 0;font-weight:600;">${input.voteCount}</td></tr>
                <tr><td style="padding:4px 0;color:#64748b;">Total pagado</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(formatCurrency(input.totalAmount))}</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.5;">
              Si no realizaste esta compra, ignora este mensaje.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `Voto confirmado — ${input.projectName} (${input.companyName})`,
    '',
    `Candidata: ${input.candidateName}`,
    `Votos: ${input.voteCount}`,
    `Total pagado: ${formatCurrency(input.totalAmount)}`,
    '',
    'Si no realizaste esta compra, ignora este mensaje.',
  ].join('\n');

  return { subject, html, text };
}

export interface TicketConfirmationEmailInput {
  buyerName: string;
  projectName: string;
  companyName: string;
  ticketTypeName: string;
  quantity: number;
  totalAmount: number;
  qrImageUrl: string;
}

/**
 * Confirmación de pago de entrada con el QR de acceso — mismo criterio que
 * `buildAccreditationEmail`: el QR es una URL `<img src>` estable, nunca un
 * `data:` URI (Gmail y otros clientes lo descartan en silencio, ver el
 * comentario en `app/api/verify/accreditation/[token]/qr/route.ts`).
 */
export function buildTicketConfirmationEmail(input: TicketConfirmationEmailInput): { subject: string; html: string; text: string } {
  const subject = `Tu entrada para ${input.projectName} — pago confirmado`;

  const html = `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="background:${BRAND};padding:20px 24px;">
              <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">${escapeHtml(input.companyName)}</p>
              <p style="margin:2px 0 0;color:#cbd5e1;font-size:12px;">${escapeHtml(input.projectName)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;color:#1f2933;font-size:15px;line-height:1.6;text-align:center;">
              <p style="margin:0 0 16px;text-align:left;">Hola <strong>${escapeHtml(input.buyerName)}</strong>, confirmamos tu pago. Presenta este código QR
              (en pantalla o impreso) al ingresar a <strong>${escapeHtml(input.projectName)}</strong>.</p>
              <img src="${input.qrImageUrl}" alt="Código QR de la entrada" width="220" height="220" style="display:block;margin:0 auto 16px;border:1px solid #e2e8f0;border-radius:8px;" />
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="text-align:left;font-size:13px;border-collapse:collapse;">
                <tr><td style="padding:4px 0;color:#64748b;width:40%;">Tipo de entrada</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(input.ticketTypeName)}</td></tr>
                <tr><td style="padding:4px 0;color:#64748b;">Cantidad</td><td style="padding:4px 0;font-weight:600;">${input.quantity}</td></tr>
                <tr><td style="padding:4px 0;color:#64748b;">Total pagado</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(formatCurrency(input.totalAmount))}</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.5;">
              Este QR es personal e intransferible. Si no realizaste esta compra, ignora este mensaje.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `Entrada confirmada — ${input.projectName} (${input.companyName})`,
    '',
    `Comprador: ${input.buyerName}`,
    `Tipo de entrada: ${input.ticketTypeName}`,
    `Cantidad: ${input.quantity}`,
    `Total pagado: ${formatCurrency(input.totalAmount)}`,
    '',
    'Presenta el código QR adjunto (revisa la versión HTML de este correo) al ingresar.',
  ].join('\n');

  return { subject, html, text };
}

export interface MonthlyClosingCheckRow {
  label: string;
  expected: number;
  actual: number;
  difference: number;
  inBalance: boolean;
}

export interface MonthlyClosingEmailInput {
  companyName: string;
  year: number;
  month: number;
  netSales: number;
  debitVat: number;
  creditVat: number;
  previousRemanent: number;
  remanentCredit: number;
  ppmAmount: number;
  determinedTax: number;
  honorariumRetentionAmount: number;
  checks: MonthlyClosingCheckRow[];
  dashboardUrl: string;
}

const MONTH_NAMES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * Cierre mensual: resumen del F29 del período recién cerrado más las
 * cuadraturas contables (`runReconciliationWithF29` en
 * `reconciliation.service.ts`) — antes ambos motores existían pero nadie los
 * disparaba salvo corriendo un test a mano; este correo es el punto de
 * entrega. Las cuadraturas fuera de rango se destacan en rojo: una
 * diferencia entre el libro mayor y la fuente operativa (kardex, CxC/CxP,
 * F29) es evidencia de un error real en alguno de los dos cálculos.
 */
export function buildMonthlyClosingEmail(input: MonthlyClosingEmailInput): { subject: string; html: string; text: string } {
  const periodLabel = `${MONTH_NAMES_ES[input.month - 1]} ${input.year}`;
  const outOfBalance = input.checks.filter((c) => !c.inBalance);
  const subject =
    outOfBalance.length > 0
      ? `Cierre de ${periodLabel} — ${outOfBalance.length} cuadratura${outOfBalance.length === 1 ? '' : 's'} con diferencia`
      : `Cierre de ${periodLabel} — F29 calculado, todo cuadrado`;

  const checkRows = input.checks
    .map(
      (c) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(c.label)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${escapeHtml(formatCurrency(c.expected))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${escapeHtml(formatCurrency(c.actual))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;color:${c.inBalance ? '#16a34a' : '#dc2626'};font-weight:${c.inBalance ? '400' : '700'};">${c.inBalance ? 'OK' : escapeHtml(formatCurrency(c.difference))}</td>
      </tr>`
    )
    .join('');

  const html = `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="background:${BRAND};padding:20px 24px;">
              <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">${escapeHtml(input.companyName)}</p>
              <p style="margin:2px 0 0;color:#cbd5e1;font-size:12px;">Cierre de ${periodLabel}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;color:#1f2933;font-size:15px;line-height:1.6;">
              <p style="margin:0 0 8px;font-weight:600;">Formulario 29 (${periodLabel})</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-collapse:collapse;margin-bottom:20px;">
                <tr><td style="padding:4px 0;color:#64748b;width:60%;">Ventas netas</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(formatCurrency(input.netSales))}</td></tr>
                <tr><td style="padding:4px 0;color:#64748b;">Débito fiscal (IVA ventas)</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(formatCurrency(input.debitVat))}</td></tr>
                <tr><td style="padding:4px 0;color:#64748b;">Crédito fiscal (IVA compras)</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(formatCurrency(input.creditVat))}</td></tr>
                <tr><td style="padding:4px 0;color:#64748b;">Remanente mes anterior</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(formatCurrency(input.previousRemanent))}</td></tr>
                <tr><td style="padding:4px 0;color:#64748b;">Remanente a próximo mes</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(formatCurrency(input.remanentCredit))}</td></tr>
                <tr><td style="padding:4px 0;color:#64748b;">PPM</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(formatCurrency(input.ppmAmount))}</td></tr>
                <tr><td style="padding:4px 0;color:#64748b;">Retención de honorarios</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(formatCurrency(input.honorariumRetentionAmount))}</td></tr>
                <tr><td style="padding:8px 0 0;font-weight:700;">Impuesto determinado</td><td style="padding:8px 0 0;text-align:right;font-weight:700;font-size:15px;">${escapeHtml(formatCurrency(input.determinedTax))}</td></tr>
              </table>
              ${
                input.checks.length > 0
                  ? `<p style="margin:0 0 8px;font-weight:600;">Cuadraturas contables${outOfBalance.length > 0 ? ` — ${outOfBalance.length} con diferencia` : ''}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
                <tr style="background:#f8fafc;">
                  <th style="padding:6px 8px;text-align:left;color:#64748b;">Cuenta</th>
                  <th style="padding:6px 8px;text-align:right;color:#64748b;">Esperado</th>
                  <th style="padding:6px 8px;text-align:right;color:#64748b;">Libro mayor</th>
                  <th style="padding:6px 8px;text-align:right;color:#64748b;">Diferencia</th>
                </tr>
                ${checkRows}
              </table>`
                  : `<p style="margin:0;color:#64748b;font-size:13px;">Sin cuentas contables mapeadas todavía — el F29 de arriba se calculó igual, pero las cuadraturas contables requieren configurar el plan de cuentas.</p>`
              }
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.5;">
              Cierre automático mensual de ${escapeHtml(input.companyName)}. <a href="${input.dashboardUrl}" style="color:${BRAND};">Ir al panel</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `${input.companyName} — Cierre de ${periodLabel}`,
    '',
    'Formulario 29:',
    `- Ventas netas: ${formatCurrency(input.netSales)}`,
    `- Débito fiscal: ${formatCurrency(input.debitVat)}`,
    `- Crédito fiscal: ${formatCurrency(input.creditVat)}`,
    `- Remanente mes anterior: ${formatCurrency(input.previousRemanent)}`,
    `- Remanente a próximo mes: ${formatCurrency(input.remanentCredit)}`,
    `- PPM: ${formatCurrency(input.ppmAmount)}`,
    `- Retención de honorarios: ${formatCurrency(input.honorariumRetentionAmount)}`,
    `- Impuesto determinado: ${formatCurrency(input.determinedTax)}`,
    '',
    ...(input.checks.length > 0
      ? [
          `Cuadraturas contables${outOfBalance.length > 0 ? ` — ${outOfBalance.length} con diferencia` : ' — todo cuadrado'}:`,
          ...input.checks.map(
            (c) =>
              `- ${c.label}: esperado ${formatCurrency(c.expected)}, libro mayor ${formatCurrency(c.actual)}${c.inBalance ? ' (OK)' : ` — DIFERENCIA de ${formatCurrency(c.difference)}`}`
          ),
          '',
        ]
      : ['Sin cuentas contables mapeadas todavía — configura el plan de cuentas para activar las cuadraturas.', '']),
    `Panel: ${input.dashboardUrl}`,
  ].join('\n');

  return { subject, html, text };
}
