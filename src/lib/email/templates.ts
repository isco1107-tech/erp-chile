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
