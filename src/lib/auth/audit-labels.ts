import type { AuditAction } from '@prisma/client';

export const ACTION_LABELS: Record<AuditAction, string> = {
  CREATE: 'Creación',
  UPDATE: 'Modificación',
  DELETE: 'Eliminación',
  ISSUE_DTE: 'Emisión DTE',
  CANCEL_DTE: 'Anulación DTE',
  STOCK_ADJUSTMENT: 'Ajuste de Stock',
  EXPORT: 'Exportación',
  DOWNLOAD: 'Descarga de archivo',
};

export const ACTION_BADGE_CLASS: Record<AuditAction, string> = {
  CREATE: 'bg-green-600/10 text-green-600',
  UPDATE: 'bg-blue-600/10 text-blue-600',
  DELETE: 'bg-destructive/10 text-destructive',
  ISSUE_DTE: 'bg-green-600/10 text-green-600',
  CANCEL_DTE: 'bg-destructive/10 text-destructive',
  STOCK_ADJUSTMENT: 'bg-amber-600/10 text-amber-600',
  EXPORT: 'bg-slate-600/10 text-slate-600',
  DOWNLOAD: 'bg-slate-600/10 text-slate-600',
};
