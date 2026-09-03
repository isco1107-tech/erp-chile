import 'server-only';

import ExcelJS from 'exceljs';
import type { AuditLog } from '@prisma/client';
import { ACTION_LABELS } from '@/lib/auth/audit-labels';

const BRAND = 'FF1E3A5F';
const BAND = 'FFF7F9FC';

/**
 * Workbook de un solo sheet para la bitácora de auditoría. Antes solo se podía
 * ver en pantalla (tabla filtrada, sin exportar) — para revisión de
 * cumplimiento o compartir con un contador/auditor externo hace falta poder
 * sacarla de la aplicación. Reutiliza `exceljs` (ya en uso para los Reportes
 * Excel) en vez de `xlsx`, vetado por CLAUDE.md.
 */
export async function buildAuditLogWorkbook(logs: AuditLog[], companyName: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ERP Chile';
  wb.created = new Date();

  const ws = wb.addWorksheet('Bitácora de auditoría', { views: [{ state: 'frozen', ySplit: 1 }] });

  ws.columns = [
    { header: 'Fecha y hora', key: 'fecha', width: 20 },
    { header: 'Usuario', key: 'usuario', width: 28 },
    { header: 'Acción', key: 'accion', width: 18 },
    { header: 'Módulo / Entidad', key: 'entidad', width: 22 },
    { header: 'ID de entidad', key: 'entidadId', width: 24 },
    { header: 'Detalle', key: 'detalle', width: 60 },
  ];

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 28;

  for (const log of logs) {
    ws.addRow({
      fecha: new Date(log.createdAt).toLocaleString('es-CL'),
      usuario: log.userEmail,
      accion: ACTION_LABELS[log.action] ?? log.action,
      entidad: `${log.entity} #${log.entityId.slice(0, 8)}`,
      entidadId: log.entityId,
      detalle: log.metadata ? JSON.stringify(log.metadata) : '',
    });
  }

  if (logs.length > 0) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };
    for (let r = 2; r <= logs.length + 1; r++) {
      if (r % 2 === 0) ws.getRow(r).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } };
    }
  }

  ws.getColumn('detalle').alignment = { wrapText: false };

  const meta = wb.addWorksheet('Información');
  meta.columns = [{ width: 24 }, { width: 40 }];
  meta.addRow(['Empresa', companyName]);
  meta.addRow(['Generado', new Date().toLocaleString('es-CL')]);
  meta.addRow(['Total de eventos', logs.length]);
  meta.getRow(1).font = { bold: true };
  meta.getRow(2).font = { bold: true };
  meta.getRow(3).font = { bold: true };

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
