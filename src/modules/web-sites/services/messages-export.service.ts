import 'server-only';

import ExcelJS from 'exceljs';
import { DESTINATION_INFO, PURPOSE_LABELS } from '@/lib/web-sites/forms';
import { messagesForExport, type MessageFilter } from './web-site-forms.service';

const BRAND = 'FF12161F';

/**
 * Bandeja de formularios a Excel: una fila por envío, con sitio, formulario,
 * propósito, dónde quedó en el ERP y una columna por cada pregunta (las
 * mismas preguntas de distintos formularios comparten columna por su texto).
 * Mismo patrón visual que el resto de las exportaciones del sistema.
 */
export async function buildMessagesWorkbook(companyId: string, filter: MessageFilter): Promise<Buffer> {
  const rows = await messagesForExport(companyId, filter);

  // Columnas de respuestas en el orden en que aparecen, sin repetir los datos de contacto.
  const answerColumns: string[] = [];
  for (const row of rows) {
    for (const answer of row.answers) {
      if (answer.role === 'name' || answer.role === 'email' || answer.role === 'phone') continue;
      if (!answerColumns.includes(answer.label)) answerColumns.push(answer.label);
    }
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Formularios', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Fecha', key: 'createdAt', width: 18 },
    { header: 'Sitio', key: 'site', width: 24 },
    { header: 'Formulario', key: 'form', width: 26 },
    { header: 'Propósito', key: 'purpose', width: 18 },
    { header: 'Etiqueta', key: 'tag', width: 16 },
    { header: 'Nombre', key: 'name', width: 26 },
    { header: 'Correo', key: 'email', width: 28 },
    { header: 'Teléfono', key: 'phone', width: 16 },
    ...answerColumns.map((label, index) => ({ header: label.slice(0, 100), key: `a${index}`, width: Math.min(40, Math.max(14, label.length + 2)) })),
    { header: 'Dónde quedó en el ERP', key: 'routed', width: 36 },
    { header: 'Nota', key: 'note', width: 36 },
    { header: 'Estado', key: 'status', width: 12 },
  ];

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 26;

  const date = (d: Date) => d.toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  for (const row of rows) {
    const values: Record<string, string> = {
      createdAt: date(row.createdAt),
      site: row.siteName,
      form: row.formTitle,
      purpose: PURPOSE_LABELS[row.purpose],
      tag: row.tag ?? '',
      name: row.name,
      email: row.email ?? '',
      phone: row.phone ?? '',
      routed: row.routedKind && row.routedKind !== 'inbox' ? DESTINATION_INFO[row.routedKind].where : 'Solo bandeja del sitio',
      note: row.routeNote ?? '',
      status: row.archivedAt ? 'Archivado' : row.readAt ? 'Leído' : 'Sin leer',
    };
    for (const answer of row.answers) {
      const index = answerColumns.indexOf(answer.label);
      if (index >= 0) values[`a${index}`] = answer.value;
    }
    // Texto del visitante: nunca se interpreta como fórmula de Excel.
    for (const [key, value] of Object.entries(values)) if (/^[=+\-@\t\r]/.test(value)) values[key] = `'${value}`;
    ws.addRow(values);
  }

  ws.eachRow((excelRow, index) => {
    if (index > 1) excelRow.alignment = { vertical: 'top', wrapText: true };
  });
  if (rows.length > 0) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
