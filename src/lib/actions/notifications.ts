'use server';

import { can, getAuthContext, authErrorMessage } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { formatCurrency } from '@/lib/chile/tax';
import { getCxCSummary } from '@/modules/treasury/services/treasury.service';
import { listPendingApprovals } from '@/modules/purchases/services/purchases.service';
import { getTotalUnreadCount } from '@/modules/messaging/services/messaging.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  return toFriendlyErrorMessage(error);
}

export interface NotificationItem {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  href: string;
}

export interface NotificationSummary {
  items: NotificationItem[];
}

/**
 * Centro de notificaciones: junta señales que antes vivían dispersas en
 * pantallas distintas (CxC vencidas, stock crítico, compras por aprobar,
 * recomendaciones de los agentes IA) para que no dependan de que el usuario
 * recuerde visitar cada módulo. Cada fuente se filtra por el mismo permiso y
 * feature flag que ya protege esa pantalla — un usuario sin `treasury:read`
 * nunca ve el monto de CxC, aunque exista.
 */
export async function getNotificationSummaryAction(): Promise<ActionResult<NotificationSummary>> {
  try {
    const context = await getAuthContext();
    const items: NotificationItem[] = [];

    if (context.features.hasTreasury && can(context, 'treasury:read')) {
      const cxc = await getCxCSummary(context.companyId);
      if (cxc.overdueAmount > 0) {
        items.push({
          id: 'cxc-overdue',
          severity: 'critical',
          title: 'Cuentas por cobrar vencidas',
          description: `${formatCurrency(cxc.overdueAmount)} en documentos vencidos`,
          href: '/dashboard/treasury/cxc',
        });
      }
    }

    if (context.features.hasInventory && can(context, 'products:read')) {
      // Mismo criterio que "Inventario crítico" del Dashboard y del agente COO
      // (src/app/(dashboard)/dashboard/page.tsx, src/modules/agents/roles/coo.ts):
      // producto trackeable, con mínimo configurado, stock actual bajo ese
      // mínimo. Es una comparación entre columnas de tablas distintas —no
      // expresable en un `where` de Prisma— así que se filtra en memoria.
      const stocks = await prisma.stock.findMany({
        where: { companyId: context.companyId, product: { isTrackable: true, minStock: { gt: 0 } } },
        select: { quantity: true, product: { select: { minStock: true } } },
      });
      const criticalCount = stocks.filter((s) => s.quantity <= s.product.minStock).length;
      if (criticalCount > 0) {
        items.push({
          id: 'stock-critical',
          severity: 'warning',
          title: 'Stock crítico',
          description: `${criticalCount} producto(s) bajo el mínimo configurado`,
          href: '/dashboard/inventory',
        });
      }
    }

    if (context.features.hasPurchases && can(context, 'purchases:approve')) {
      const pending = await listPendingApprovals(context.companyId);
      if (pending.length > 0) {
        items.push({
          id: 'purchases-pending',
          severity: 'warning',
          title: 'Compras pendientes de aprobación',
          description: `${pending.length} documento(s) esperando aprobación`,
          href: '/dashboard/purchases',
        });
      }
    }

    if (can(context, 'messaging:use')) {
      const unread = await getTotalUnreadCount(context.companyId, context.id);
      if (unread > 0) {
        items.push({
          id: 'messaging-unread',
          severity: 'info',
          title: 'Mensajes sin leer',
          description: `${unread} mensaje(s) nuevo(s) en tu mensajería interna`,
          href: '/dashboard/messaging',
        });
      }
    }

    if (context.features.hasCrm && can(context, 'agents:view')) {
      const pendingTasks = await prisma.agentTask.count({
        where: { companyId: context.companyId, status: 'PENDING' },
      });
      if (pendingTasks > 0) {
        items.push({
          id: 'agent-tasks',
          severity: 'info',
          title: 'Recomendaciones de los agentes IA',
          description: `${pendingTasks} recomendación(es) sin revisar`,
          href: '/dashboard/agents',
        });
      }
    }

    return { success: true, data: { items } };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
