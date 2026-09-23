import 'server-only';

import ExcelJS from 'exceljs';
import { SPONSORSHIP_TIER_LABELS } from '@/modules/sponsorships/schema';
import { DEAL_TYPE_LABELS, PRIORITY_LABELS, STAGE_LABELS, type PipelineFilters } from '../schema';
import { listAllOpportunities } from './crm.service';

const BRAND = 'FF12161F';
const CLP_FORMAT = '"$"#,##0';

/**
 * Embudo comercial a Excel (todas las oportunidades que calzan con los
 * filtros, abiertas y cerradas). Montos como números con formato CLP — no
 * como texto — para que la planilla se pueda sumar y filtrar. Mismo patrón
 * visual que el resto de exportaciones del sistema.
 */
export async function buildOpportunitiesWorkbook(companyId: string, filters: PipelineFilters & { ownerUserId?: string }): Promise<Buffer> {
  const opportunities = await listAllOpportunities(companyId, filters);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Oportunidades', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Oportunidad', key: 'title', width: 36 },
    { header: 'Tipo de negocio', key: 'dealType', width: 22 },
    { header: 'Etapa', key: 'stage', width: 18 },
    { header: 'Cliente / prospecto', key: 'party', width: 30 },
    { header: 'Persona de contacto', key: 'person', width: 26 },
    { header: 'Certamen', key: 'project', width: 24 },
    { header: 'Plan / nivel', key: 'tier', width: 22 },
    { header: 'Monto neto', key: 'amount', width: 16 },
    { header: 'Canje valorizado', key: 'barter', width: 16 },
    { header: 'Probabilidad', key: 'probability', width: 12 },
    { header: 'Ponderado', key: 'weighted', width: 16 },
    { header: 'Cierre esperado', key: 'expectedClose', width: 16 },
    { header: 'Prioridad', key: 'priority', width: 12 },
    { header: 'Origen', key: 'source', width: 20 },
    { header: 'Responsable', key: 'owner', width: 22 },
    { header: 'Etiquetas', key: 'tags', width: 24 },
    { header: 'Motivo de pérdida', key: 'lostReason', width: 28 },
    { header: 'Creada', key: 'createdAt', width: 14 },
    { header: 'Cerrada', key: 'closedAt', width: 14 },
  ];

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 26;

  const date = (d: Date | null) => (d ? d.toLocaleDateString('es-CL', { timeZone: 'America/Santiago' }) : '');

  for (const o of opportunities) {
    ws.addRow({
      title: o.title,
      dealType: DEAL_TYPE_LABELS[o.dealType],
      stage: STAGE_LABELS[o.stage],
      party: o.contact ? `${o.contact.razonSocial} (${o.contact.rut})` : (o.prospectName ?? ''),
      person: o.person ? `${o.person.fullName}${o.person.jobTitle ? ` — ${o.person.jobTitle}` : ''}` : '',
      project: o.project ? `${o.project.name} (${o.project.code})` : '',
      tier: o.package ? o.package.name : o.sponsorshipTier ? SPONSORSHIP_TIER_LABELS[o.sponsorshipTier] : '',
      amount: o.amount,
      barter: o.barterValuation,
      probability: o.probability / 100,
      weighted: Math.round((o.amount * o.probability) / 100),
      expectedClose: date(o.expectedCloseDate),
      priority: PRIORITY_LABELS[o.priority],
      source: o.source ?? '',
      owner: o.owner?.name ?? '',
      tags: o.tags.join(', '),
      lostReason: o.lostReason ?? '',
      createdAt: date(o.createdAt),
      closedAt: date(o.closedAt),
    });
  }

  for (const key of ['amount', 'barter', 'weighted']) ws.getColumn(key).numFmt = CLP_FORMAT;
  ws.getColumn('probability').numFmt = '0%';
  if (opportunities.length > 0) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
