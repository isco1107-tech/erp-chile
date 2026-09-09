import { prisma } from '@/lib/prisma';

export type AutomationRunStatus = 'ok' | 'stale' | 'never';

export interface ScheduledAutomationRow {
  key: string;
  label: string;
  description: string;
  frequencyLabel: string;
  lastRunAt: Date | null;
  status: AutomationRunStatus;
  /** Texto corto derivado de `metadata` del último `AuditLog` (ej. "2 puntos detectados, 3 correos enviados"). */
  lastRunSummary: string | null;
}

/**
 * Cada cron de este archivo escribe su propio "latido" en `AuditLog`
 * (SIEMPRE, con o sin incidentes — ver el comentario en
 * `operational-alerts.service.ts`) bajo un `entity` fijo. Esta función solo
 * relee la fila más reciente de cada uno; no hay una tabla nueva de
 * monitoreo, se reusa el mismo audit trail que ya existía.
 */
const SCHEDULED_AUTOMATIONS: Array<{
  key: string;
  entity: string;
  label: string;
  description: string;
  frequencyLabel: string;
  /** Si pasan más de estas horas desde la última corrida, se marca `stale` — la corrida pudo fallar silenciosamente o el cron de Vercel pudo dejar de estar configurado. */
  staleAfterHours: number;
  summarize: (metadata: Record<string, unknown> | null) => string | null;
}> = [
  {
    key: 'operational-alerts',
    entity: 'OperationalAlert',
    label: 'Alertas operativas diarias',
    description: 'Stock bajo mínimo, compras pendientes de aprobar o con diferencia, cuentas por cobrar vencidas y contratos por vencer.',
    frequencyLabel: 'Todos los días, 12:00 UTC',
    staleAfterHours: 36,
    summarize: (m) => {
      if (!m) return null;
      const total =
        num(m.lowStockCount) + num(m.pendingApprovalsCount) + num(m.overdueReceivablesCount) + num(m.expiringContractsCount) + num(m.mismatchedPurchasesCount);
      return total === 0 ? 'Sin incidentes' : `${total} punto(s) detectado(s), ${num(m.recipientCount)} destinatario(s) avisado(s)`;
    },
  },
  {
    key: 'monthly-closing',
    entity: 'MonthlyClosing',
    label: 'Cierre mensual (F29 + cuadraturas)',
    description: 'Calcula el Formulario 29 del mes recién cerrado y las cuadraturas contables, y las manda por correo.',
    frequencyLabel: 'Día 5 de cada mes, 08:00 UTC',
    staleAfterHours: 24 * 40,
    summarize: (m) => {
      if (!m) return null;
      const outOfBalance = num(m.checksOutOfBalance);
      return outOfBalance === 0 ? 'Todo cuadrado' : `${outOfBalance} cuadratura(s) con diferencia`;
    },
  },
  {
    key: 'weekly-report',
    entity: 'WeeklyReport',
    label: 'Reporte semanal (libro Excel)',
    description: 'Ventas, compras, inventario y kardex valorizado de los últimos 7 días, adjunto en Excel.',
    frequencyLabel: 'Todos los lunes, 08:00 UTC',
    staleAfterHours: 24 * 10,
    summarize: (m) => (m ? `${num(m.recipientCount)} destinatario(s)` : null),
  },
];

function num(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

export async function getScheduledAutomationsHealth(companyId: string): Promise<ScheduledAutomationRow[]> {
  return Promise.all(
    SCHEDULED_AUTOMATIONS.map(async (def) => {
      const lastRun = await prisma.auditLog.findFirst({
        where: { companyId, entity: def.entity },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, metadata: true },
      });

      let status: AutomationRunStatus = 'never';
      if (lastRun) {
        const hoursSince = (Date.now() - lastRun.createdAt.getTime()) / (60 * 60 * 1000);
        status = hoursSince > def.staleAfterHours ? 'stale' : 'ok';
      }

      return {
        key: def.key,
        label: def.label,
        description: def.description,
        frequencyLabel: def.frequencyLabel,
        lastRunAt: lastRun?.createdAt ?? null,
        status,
        lastRunSummary: lastRun ? def.summarize(lastRun.metadata as Record<string, unknown> | null) : null,
      };
    })
  );
}
