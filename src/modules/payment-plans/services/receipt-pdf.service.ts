import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { formatCurrency } from '@/lib/chile/tax';
import { formatRut } from '@/lib/chile/rut';
import { formatReceiptNumber } from '../online-payment-calc';

/**
 * Comprobante de pago en línea de cuotas (PDF, una página A4).
 *
 * NO es un documento tributario: no lleva folio SII ni timbre. Acredita que la
 * pasarela confirmó la transferencia y a qué cuotas se aplicó. Si la empresa
 * necesita boleta o factura por la mensualidad, se emite aparte desde Ventas.
 */

export interface InstallmentReceiptData {
  companyName: string;
  companyRut: string;
  receiptNumber: number;
  paidAt: Date;
  payerName: string;
  payerEmail: string;
  candidateName: string;
  candidateRutClean: string;
  projectName: string | null;
  items: Array<{ installmentNumber: number; amount: number }>;
  installmentCount: number;
  amount: number;
  providerLabel: string;
  providerPaymentId: string | null;
  payerBank: string | null;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const INK = rgb(0.07, 0.086, 0.12); // #12161f
const GOLD = rgb(0.86, 0.75, 0.46); // #dbc076
const MUTED = rgb(0.4, 0.42, 0.46);
const RULE = rgb(0.85, 0.86, 0.88);

/**
 * Las fuentes estándar de pdf-lib codifican en WinAnsi: un carácter fuera de
 * Latin-1 (emoji, comillas tipográficas pegadas desde el celular) hace lanzar
 * `drawText` y el comprobante no se generaría. Se reemplazan antes de dibujar.
 */
function safe(value: string): string {
  return value
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

function formatDateTimeCl(date: Date): string {
  return date.toLocaleString('es-CL', {
    timeZone: 'America/Santiago',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function buildInstallmentReceiptPdf(data: InstallmentReceiptData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Comprobante de pago ${formatReceiptNumber(data.receiptNumber)}`);
  pdf.setAuthor(data.companyName);
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Banda superior con la identidad del panel.
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 110, width: PAGE_WIDTH, height: 110, color: INK });
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 114, width: PAGE_WIDTH, height: 4, color: GOLD });
  page.drawText(safe(data.companyName), { x: MARGIN, y: PAGE_HEIGHT - 52, size: 18, font: bold, color: rgb(1, 1, 1) });
  page.drawText(`RUT ${formatRut(data.companyRut)}`, { x: MARGIN, y: PAGE_HEIGHT - 72, size: 10, font, color: rgb(0.8, 0.82, 0.86) });
  const title = 'COMPROBANTE DE PAGO';
  page.drawText(title, {
    x: PAGE_WIDTH - MARGIN - bold.widthOfTextAtSize(title, 12),
    y: PAGE_HEIGHT - 52,
    size: 12,
    font: bold,
    color: GOLD,
  });
  const number = formatReceiptNumber(data.receiptNumber);
  page.drawText(number, {
    x: PAGE_WIDTH - MARGIN - bold.widthOfTextAtSize(number, 16),
    y: PAGE_HEIGHT - 74,
    size: 16,
    font: bold,
    color: rgb(1, 1, 1),
  });

  let y = PAGE_HEIGHT - 160;

  const row = (label: string, value: string) => {
    page.drawText(label, { x: MARGIN, y, size: 10, font, color: MUTED });
    page.drawText(safe(value), { x: MARGIN + 150, y, size: 10.5, font: bold, color: INK });
    y -= 20;
  };

  row('Fecha de pago', formatDateTimeCl(data.paidAt));
  row('Candidata', data.candidateName);
  row('RUT candidata', formatRut(data.candidateRutClean));
  if (data.projectName) row('Certamen', data.projectName);
  row('Pagado por', data.payerName);
  row('Correo', data.payerEmail);
  row('Medio de pago', data.payerBank ? `${data.providerLabel} · ${data.payerBank}` : data.providerLabel);
  if (data.providerPaymentId) row('Id. de la transacción', data.providerPaymentId);

  // Detalle de cuotas.
  y -= 14;
  page.drawText('Detalle', { x: MARGIN, y, size: 12, font: bold, color: INK });
  y -= 18;
  page.drawLine({ start: { x: MARGIN, y: y + 6 }, end: { x: PAGE_WIDTH - MARGIN, y: y + 6 }, thickness: 1, color: RULE });
  page.drawText('Concepto', { x: MARGIN, y: y - 8, size: 9, font: bold, color: MUTED });
  const amountHeader = 'Monto';
  page.drawText(amountHeader, { x: PAGE_WIDTH - MARGIN - bold.widthOfTextAtSize(amountHeader, 9), y: y - 8, size: 9, font: bold, color: MUTED });
  y -= 28;

  for (const item of data.items) {
    const concept = `Cuota N° ${item.installmentNumber} de ${data.installmentCount}`;
    const amount = formatCurrency(item.amount);
    page.drawText(concept, { x: MARGIN, y, size: 10.5, font, color: INK });
    page.drawText(amount, { x: PAGE_WIDTH - MARGIN - font.widthOfTextAtSize(amount, 10.5), y, size: 10.5, font, color: INK });
    y -= 20;
  }

  page.drawLine({ start: { x: MARGIN, y: y + 8 }, end: { x: PAGE_WIDTH - MARGIN, y: y + 8 }, thickness: 1, color: RULE });
  y -= 12;
  const total = formatCurrency(data.amount);
  page.drawText('Total pagado', { x: MARGIN, y, size: 12, font: bold, color: INK });
  page.drawText(total, { x: PAGE_WIDTH - MARGIN - bold.widthOfTextAtSize(total, 14), y, size: 14, font: bold, color: INK });

  const footer = [
    'Este comprobante acredita la recepción del pago de las cuotas indicadas, confirmado por la pasarela de pago.',
    'No es un documento tributario (boleta o factura).',
  ];
  let footerY = MARGIN + 14;
  for (const line of footer) {
    page.drawText(line, { x: MARGIN, y: footerY, size: 8.5, font, color: MUTED });
    footerY -= 12;
  }

  return pdf.save();
}

export function receiptFilename(receiptNumber: number): string {
  return `comprobante-${String(receiptNumber).padStart(6, '0')}.pdf`;
}
