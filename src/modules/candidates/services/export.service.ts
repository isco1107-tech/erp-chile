import ExcelJS from 'exceljs';
import { CANDIDATE_STATUS_LABELS } from '../schema';
import { listCandidatesForExport, type CandidateListFilters } from './candidates.service';
import { formatRut } from '@/lib/chile/rut';

const BRAND = 'FF1E3A5F';

/**
 * Exportación de postulaciones filtradas a Excel (Sección 6: "sin
 * fotografías" — deliberadamente no incluye ninguna columna de archivo/URL).
 * Mismo patrón visual que `reports/services/workbook.service.ts`.
 */
export async function buildCandidateApplicationsWorkbook(companyId: string, filters: CandidateListFilters): Promise<Buffer> {
  const candidates = await listCandidatesForExport(companyId, filters);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Postulaciones', { views: [{ state: 'frozen', ySplit: 1 }] });

  ws.columns = [
    { header: 'Folio', key: 'folio', width: 16 },
    { header: 'Certamen', key: 'project', width: 24 },
    { header: 'Nombre completo', key: 'fullName', width: 28 },
    { header: 'RUT', key: 'rut', width: 14 },
    { header: 'Fecha de nacimiento', key: 'birthDate', width: 16 },
    { header: 'Email', key: 'email', width: 26 },
    { header: 'Teléfono', key: 'phone', width: 16 },
    { header: 'Comuna', key: 'comuna', width: 18 },
    { header: 'Estado', key: 'status', width: 18 },
    { header: 'Motivo descarte', key: 'motivoDescarte', width: 26 },
    { header: 'Fecha postulación', key: 'createdAt', width: 18 },
  ];

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 26;

  for (const c of candidates) {
    ws.addRow({
      folio: c.folio ?? '—',
      project: `${c.project.name} (${c.project.code})`,
      fullName: c.fullName,
      rut: formatRut(c.rut),
      birthDate: c.birthDate.toLocaleDateString('es-CL'),
      email: c.email ?? '',
      phone: c.phone ?? '',
      comuna: c.comuna ?? '',
      status: CANDIDATE_STATUS_LABELS[c.status],
      motivoDescarte: c.motivoDescarte ?? '',
      createdAt: c.createdAt.toLocaleString('es-CL'),
    });
  }

  if (candidates.length > 0) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
