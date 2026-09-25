import React from 'react';
import Link from 'next/link';
import type { DteType } from '@prisma/client';
import {
  CircleDollarSign,
  TrendingUp,
  TrendingDown,
  Percent,
  Boxes,
  PackageSearch,
  PackagePlus,
  ShoppingCart,
  Crown,
  CalendarRange,
  AlertTriangle,
  ClipboardCheck,
  Wallet,
  FileWarning,
  BadgeAlert,
  Truck,
  ScanBarcode,
  Users,
  Handshake,
  Ticket,
  Vote,
  Briefcase,
} from 'lucide-react';
import { getAuthContext, can } from '@/lib/auth/guards';
import { MODULES } from '@/lib/auth/modules';
import { prisma } from '@/lib/prisma';
import { formatCurrency } from '@/lib/chile/tax';
import { addMonthsSantiago, santiagoDateParts, startOfMonthSantiago, startOfTodaySantiago, startOfTomorrowSantiago } from '@/lib/chile/timezone';
import { KpiCard, type TrendDirection } from '@/components/ui/KpiCard';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { TAX_GLOSSARY } from '@/lib/chile/glossary';
import { ProgressRow } from '@/components/ui/ProgressRow';
import { ActionCard } from '@/components/ui/ActionCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { DashboardCharts } from '@/components/dashboard/DashboardCharts';
import { RecentSalesTable } from '@/components/dashboard/RecentSalesTable';
import { ContractsDashboardCard } from '@/components/contracts/ContractsDashboardCard';
import { getContractsOverview } from '@/modules/projects/services/contracts-overview.service';
import {
  findPendingPurchaseApprovals,
  findOverdueReceivables,
  findExpiringCandidateContracts,
  findMismatchedPurchases,
} from '@/modules/alerts/services/operational-alerts.service';
import { getExpirySummary } from '@/modules/inventory/services/lots.service';
import { getChequeSummary } from '@/modules/treasury/services/cheques.service';

const SALES_TYPES: DteType[] = ['FACTURA_33', 'FACTURA_EXENTA_34', 'BOLETA_39', 'NOTA_CREDITO_61', 'NOTA_DEBITO_56'];

const DTE_TYPE_LABELS: Partial<Record<DteType, string>> = {
  FACTURA_33: 'Factura afecta',
  FACTURA_EXENTA_34: 'Factura exenta',
  BOLETA_39: 'Boleta',
  NOTA_CREDITO_61: 'Nota de crédito',
  NOTA_DEBITO_56: 'Nota de débito',
};

/** Orden y colores literales del brief para series de gráficos (chart-1..5). */
const MIX_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

function documentSign(type: DteType): number {
  return type === 'NOTA_CREDITO_61' ? -1 : 1;
}

/**
 * Clave/etiqueta de mes por calendario chileno, no UTC — tanto para los
 * marcadores sintéticos de `monthlyBuckets` (que ahora se construyen con
 * `addMonthsSantiago`, así que ya son instantes de medianoche en Santiago)
 * como para `issueDate` real de un documento. Antes bucketeaba por UTC, lo
 * que desplazaba hasta ~4 horas las ventas cercanas al cambio de mes/día
 * hacia el mes equivocado (ver `src/lib/chile/timezone.ts`).
 */
function monthKey(date: Date): string {
  const { year, month } = santiagoDateParts(date);
  return `${year}-${String(month).padStart(2, '0')}`;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString('es-CL', { month: 'short', timeZone: 'America/Santiago' }).replace('.', '');
}

/** Saludo según la hora real en Chile (America/Santiago), no la del servidor. */
function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat('es-CL', { hour: 'numeric', hour12: false, timeZone: 'America/Santiago' }).format(new Date())
  );
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/**
 * Variación porcentual real contra el período anterior. Devuelve `null` (sin
 * fila de tendencia) cuando no hay base de comparación válida, en vez de
 * inventar un "+100%" cuando el mes anterior fue cero.
 */
function percentChange(current: number, previous: number): { direction: TrendDirection; text: string } | null {
  if (previous === 0) return null;
  const change = ((current - previous) / Math.abs(previous)) * 100;
  const direction: TrendDirection = change > 0.5 ? 'up' : change < -0.5 ? 'down' : 'neutral';
  const sign = change > 0 ? '+' : '';
  return { direction, text: `${sign}${change.toFixed(1)}%` };
}

export default async function DashboardPage() {
  const context = await getAuthContext();
  const contracted = MODULES.filter((mod) => context.features[mod.key]);
  const canReadSales = can(context, 'sales:read');
  const canReadInventory = can(context, 'products:read');
  const canReadCosts = can(context, 'products:costs');

  const now = new Date();
  const currentMonth = startOfMonthSantiago(now);
  const nextMonth = addMonthsSantiago(now, 1);
  const previousMonth = addMonthsSantiago(now, -1);
  const trendStart = addMonthsSantiago(now, -11);

  // Ventana completa de 12 meses para agregar KPIs y el gráfico de tendencia
  // — SIN `take`: un límite acá (antes `take: 1000`, ordenado desc) descarta
  // silenciosamente los documentos más antiguos de la ventana en cualquier
  // empresa con más de 1.000 documentos emitidos en el año, subestimando los
  // meses iniciales del gráfico. `select` liviano (sin `contact`, sin más
  // campos de `items` que los que entran al costo) porque esta consulta ya
  // no está acotada y puede traer varios miles de filas en empresas grandes.
  const salesAggregationQuery = canReadSales && context.features.hasDteBilling
    ? prisma.salesDocument.findMany({
        where: {
          companyId: context.companyId,
          status: 'ISSUED',
          dteType: { in: SALES_TYPES },
          issueDate: { gte: trendStart, lt: nextMonth },
        },
        select: {
          dteType: true,
          issueDate: true,
          netAmount: true,
          exemptAmount: true,
          ivaAmount: true,
          items: { select: { quantity: true, unitCostPMP: true } },
        },
      })
    : Promise.resolve([]);

  // Tabla de "ventas recientes": solo necesita las últimas 5, con datos del
  // contacto — separada de la agregación de arriba para no cargar `contact`
  // en las miles de filas que esa consulta puede traer.
  const recentSalesQuery = canReadSales && context.features.hasDteBilling
    ? prisma.salesDocument.findMany({
        where: {
          companyId: context.companyId,
          status: 'ISSUED',
          dteType: { in: SALES_TYPES },
        },
        select: {
          id: true,
          dteType: true,
          folio: true,
          status: true,
          issueDate: true,
          totalAmount: true,
          contact: { select: { razonSocial: true } },
        },
        orderBy: { issueDate: 'desc' },
        take: 5,
      })
    : Promise.resolve([]);

  const [salesDocuments, latestSales, inventoryStocks, contactCount, productCount] = await Promise.all([
    salesAggregationQuery,
    recentSalesQuery,
    canReadInventory && context.features.hasInventory
      ? prisma.stock.findMany({
          where: { companyId: context.companyId },
          include: { product: true, warehouse: true },
        })
      : Promise.resolve([]),
    can(context, 'contacts:read') ? prisma.contact.count({ where: { companyId: context.companyId } }) : Promise.resolve(0),
    canReadInventory && context.features.hasInventory
      ? prisma.product.count({ where: { companyId: context.companyId } })
      : Promise.resolve(0),
  ]);

  // Cobros pendientes de certámenes: sin esto, una cuota o un pagaré vencido
  // no aparece en NINGÚN lado del panel para el staff interno (el único
  // aviso hoy es el correo automático al cliente/candidata, ver
  // `overdue-reminder-cron.service.ts`) — el dashboard principal solo
  // miraba ventas/inventario.
  const [overdueInstallments, overduePromissoryNotes] = await Promise.all([
    context.features.hasInstallmentPlans && can(context, 'paymentplans:read')
      ? prisma.paymentPlanInstallment.aggregate({
          where: { companyId: context.companyId, paymentStatus: { not: 'PAID' }, dueDate: { lt: now }, paymentPlan: { status: 'ACTIVE' } },
          _count: { _all: true },
          _sum: { amount: true, paidAmount: true },
        })
      : Promise.resolve(null),
    context.features.hasPromissoryNotes && can(context, 'promissorynotes:read')
      ? prisma.promissoryNote.aggregate({
          where: { companyId: context.companyId, status: 'ACTIVE', dueDate: { lt: now } },
          _count: { _all: true },
          _sum: { amount: true, paidAmount: true },
        })
      : Promise.resolve(null),
  ]);

  // "Alertas de hoy": mismos finders que ya usa el correo diario
  // (`operational-alerts.service.ts`), reusados acá para que el staff vea el
  // mismo conteo EN VIVO al entrar al panel, sin esperar al correo de las
  // 12:00 UTC. `findLowStockProducts` no se reusa acá a propósito (hace un
  // query extra por producto para sugerir proveedor, pensado para una vez al
  // día por correo, no para cada carga del dashboard) — el stock bajo se
  // cuenta con `criticalStock` más abajo, que ya sale de un query que esta
  // página hace de todas formas.
  // Checklist de contratos firmados (candidatas + auspicios): mismo servicio
  // que /dashboard/contracts, solo con lo que este usuario puede ver.
  const contractsScope = {
    candidates: context.features.hasCandidates && can(context, 'candidates:read'),
    sponsors: context.features.hasSponsorships && can(context, 'sponsorships:read'),
  };
  const [pendingApprovals, overdueReceivables, expiringContracts, mismatchedPurchases, contractsOverview, expiry, chequeSummary] = await Promise.all([
    context.features.hasPurchases && can(context, 'purchases:read') ? findPendingPurchaseApprovals(context.companyId) : Promise.resolve([]),
    context.features.hasTreasury && can(context, 'treasury:read') ? findOverdueReceivables(context.companyId) : Promise.resolve([]),
    context.features.hasCandidates && can(context, 'candidates:read') ? findExpiringCandidateContracts(context.companyId) : Promise.resolve([]),
    context.features.hasPurchases && can(context, 'purchases:read') ? findMismatchedPurchases(context.companyId) : Promise.resolve([]),
    contractsScope.candidates || contractsScope.sponsors ? getContractsOverview(context.companyId, contractsScope) : Promise.resolve(null),
    context.features.hasInventory && can(context, 'products:read') ? getExpirySummary(context.companyId, now) : Promise.resolve(null),
    context.features.hasTreasury && can(context, 'treasury:read') ? getChequeSummary(context.companyId, now) : Promise.resolve(null),
  ]);

  // Indicadores por módulo: cada empresa contrata un subconjunto distinto de
  // módulos (certamen, distribuidora, retail...), así que ningún indicador de
  // acá es fijo — todos se calculan solo si el módulo está contratado Y el
  // usuario tiene el permiso de lectura correspondiente, mismo criterio que
  // el resto de la página. La idea es que, sea cual sea la mezcla de módulos
  // de una empresa, el dashboard igual muestre sus métricas importantes en
  // vez de depender de que Ventas/Inventario estén activos.
  // Antes `new Date(now.getFullYear(), now.getMonth(), now.getDate())`: usa
  // la hora LOCAL del proceso Node, que en producción suele correr en UTC —
  // "hoy" para el widget de ventas POS terminaba siendo el día calendario en
  // UTC, no en Chile.
  const todayStart = startOfTodaySantiago(now);
  const todayEnd = startOfTomorrowSantiago(now);

  const canReadPurchases = context.features.hasPurchases && can(context, 'purchases:read');
  const canReadTreasury = context.features.hasTreasury && can(context, 'treasury:read');
  const canOperatePos = context.features.hasPos && can(context, 'pos:operate');
  const canReadCandidates = context.features.hasCandidates && can(context, 'candidates:read');
  const canReadSponsorships = context.features.hasSponsorships && can(context, 'sponsorships:read');
  const canReadTicketing = context.features.hasTicketing && can(context, 'ticketing:read');
  const canReadPublicVoting = context.features.hasPublicVoting && can(context, 'publicvoting:read');
  const canReadProjects = context.features.hasEventProjects && can(context, 'projects:read');

  const [
    purchasesMonthAgg,
    receivablesAgg,
    payablesAgg,
    posTodayAgg,
    candidatesActiveCount,
    candidatesPendingCount,
    sponsorshipsAgg,
    ticketingAgg,
    votingAgg,
    activeProjectsCount,
  ] = await Promise.all([
    canReadPurchases
      ? prisma.purchaseDocument.aggregate({
          where: { companyId: context.companyId, status: 'ISSUED', issueDate: { gte: currentMonth, lt: nextMonth } },
          _sum: { netAmount: true },
        })
      : Promise.resolve(null),
    canReadTreasury
      ? prisma.salesDocument.aggregate({
          where: { companyId: context.companyId, status: 'ISSUED', paymentStatus: { not: 'PAID' }, dteType: { not: 'GUIA_DESPACHO_52' } },
          _sum: { totalAmount: true, paidAmount: true },
        })
      : Promise.resolve(null),
    canReadTreasury
      ? prisma.purchaseDocument.aggregate({
          where: { companyId: context.companyId, status: 'ISSUED', paymentStatus: { not: 'PAID' } },
          _sum: { totalAmount: true, paidAmount: true },
        })
      : Promise.resolve(null),
    canOperatePos
      ? prisma.salesDocument.aggregate({
          where: { companyId: context.companyId, status: 'ISSUED', cashShiftId: { not: null }, issueDate: { gte: todayStart, lt: todayEnd } },
          _sum: { totalAmount: true },
        })
      : Promise.resolve(null),
    canReadCandidates
      ? prisma.candidate.count({ where: { companyId: context.companyId, status: { notIn: ['WITHDRAWN', 'REJECTED'] } } })
      : Promise.resolve(null),
    canReadCandidates
      ? prisma.candidate.count({ where: { companyId: context.companyId, status: { in: ['APPLICANT', 'UNDER_REVIEW'] } } })
      : Promise.resolve(null),
    canReadSponsorships
      ? prisma.sponsorshipContract.aggregate({ where: { companyId: context.companyId }, _sum: { paidAmount: true } })
      : Promise.resolve(null),
    canReadTicketing
      ? prisma.ticketSale.aggregate({ where: { companyId: context.companyId, paymentStatus: 'PAID' }, _sum: { totalAmount: true, quantity: true } })
      : Promise.resolve(null),
    canReadPublicVoting
      ? prisma.voteOrder.aggregate({ where: { companyId: context.companyId, paymentStatus: 'PAID' }, _sum: { totalAmount: true, voteCount: true } })
      : Promise.resolve(null),
    canReadProjects
      ? prisma.project.count({ where: { companyId: context.companyId, status: { in: ['PLANNING', 'IN_PROGRESS'] } } })
      : Promise.resolve(null),
  ]);

  const overdueInstallmentsAmount = overdueInstallments
    ? (overdueInstallments._sum.amount ?? 0) - (overdueInstallments._sum.paidAmount ?? 0)
    : 0;
  const overdueInstallmentsCount = overdueInstallments?._count._all ?? 0;
  const overduePromissoryAmount = overduePromissoryNotes
    ? (overduePromissoryNotes._sum.amount ?? 0) - (overduePromissoryNotes._sum.paidAmount ?? 0)
    : 0;
  const overduePromissoryCount = overduePromissoryNotes?._count._all ?? 0;
  const showOverdueCard = overdueInstallments !== null || overduePromissoryNotes !== null;

  const monthlyBuckets = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(trendStart.getUTCFullYear(), trendStart.getUTCMonth() + index, 1));
    return { key: monthKey(date), label: monthLabel(date), netSales: 0, costOfSales: 0 };
  });
  const bucketByKey = new Map(monthlyBuckets.map((bucket) => [bucket.key, bucket]));

  let monthNetSales = 0;
  let monthVat = 0;
  let monthCost = 0;
  let monthRevenue = 0;
  let prevMonthNetSales = 0;
  let prevMonthCost = 0;
  let prevMonthRevenue = 0;
  let currentMonthDocCount = 0;
  const mixCounts = new Map<DteType, number>();

  for (const document of salesDocuments) {
    const sign = documentSign(document.dteType);
    const bucket = bucketByKey.get(monthKey(document.issueDate));
    const revenue = sign * (document.netAmount + document.exemptAmount);
    const cost = sign * document.items.reduce((sum, item) => sum + Math.round(item.quantity * item.unitCostPMP), 0);
    if (bucket) {
      bucket.netSales += revenue;
      bucket.costOfSales += cost;
    }
    if (document.issueDate >= currentMonth && document.issueDate < nextMonth) {
      monthNetSales += sign * document.netAmount;
      monthVat += sign * document.ivaAmount;
      monthCost += cost;
      monthRevenue += revenue;
      currentMonthDocCount += 1;
      mixCounts.set(document.dteType, (mixCounts.get(document.dteType) ?? 0) + 1);
    } else if (document.issueDate >= previousMonth && document.issueDate < currentMonth) {
      prevMonthNetSales += sign * document.netAmount;
      prevMonthCost += cost;
      prevMonthRevenue += revenue;
    }
  }

  const margin = monthRevenue - monthCost;
  const marginPercentage = monthRevenue === 0 ? 0 : (margin / monthRevenue) * 100;
  const prevMargin = prevMonthRevenue - prevMonthCost;

  const salesTrend = percentChange(monthNetSales, prevMonthNetSales);
  const marginTrend = percentChange(margin, prevMargin);

  const inventoryValue = inventoryStocks.reduce(
    (sum, stock) => sum + Math.round(stock.quantity * stock.product.costPricePMP),
    0
  );
  const criticalStockAll = inventoryStocks
    .filter((stock) => stock.product.isTrackable && stock.quantity <= stock.product.minStock && stock.product.minStock > 0)
    .sort((a, b) => a.quantity - b.quantity);
  const criticalStock = criticalStockAll.slice(0, 5);

  const mixData = SALES_TYPES.filter((type) => (mixCounts.get(type) ?? 0) > 0).map((type, index) => ({
    name: DTE_TYPE_LABELS[type] ?? type,
    value: mixCounts.get(type) ?? 0,
    color: MIX_COLORS[index % MIX_COLORS.length],
  }));

  // Primer nombre de pila para el saludo — un nombre legal completo ("Ana
  // María Pérez Soto") se siente robótico repetido entero cada vez que se
  // entra al dashboard.
  const capitalizedName = context.name.trim().split(/\s+/)[0] || context.email.split('@')[0];

  const hasSalesModule = canReadSales && context.features.hasDteBilling;
  const hasInventoryModule = canReadInventory && context.features.hasInventory;
  const hasCostsModule = canReadCosts && context.features.hasPmpCosting;

  // Cada tarjeta lleva un `group` (dominio de negocio) para que el grid de
  // abajo pueda insertar encabezados discretos entre secciones en vez de
  // mostrar una sola pared de 15+ tarjetas sin jerarquia cuando una empresa
  // tiene todos los modulos contratados -- el orden de push no cambia (sigue
  // siendo el orden condicional original), solo se le agrega la etiqueta de
  // agrupacion.
  const kpis: Array<{ key: string; node: React.ReactNode; group: string }> = [];
  if (hasSalesModule) {
    kpis.push({
      key: 'ventas-netas',
      group: 'Ventas y costos',
      node: (
        <KpiCard
          label="Ventas netas del mes"
          value={formatCurrency(monthNetSales)}
          icon={CircleDollarSign}
          tone="accent"
          trend={salesTrend?.text}
          trendDirection={salesTrend?.direction}
        />
      ),
    });
    kpis.push({
      key: 'iva-debito',
      group: 'Ventas y costos',
      node: (
        <KpiCard
          label="IVA débito del mes"
          labelExtra={<InfoTooltip text={TAX_GLOSSARY.debitoFiscal} />}
          value={formatCurrency(monthVat)}
          icon={Percent}
          tone="warning"
        />
      ),
    });
  }
  if (hasCostsModule && hasSalesModule) {
    kpis.push({
      key: 'margen-pmp',
      group: 'Ventas y costos',
      node: (
        <KpiCard
          label="Margen PMP del mes"
          labelExtra={<InfoTooltip text={TAX_GLOSSARY.pmp} />}
          value={`${marginPercentage.toFixed(1)}%`}
          icon={TrendingUp}
          tone="success"
          trend={marginTrend?.text}
          trendDirection={marginTrend?.direction}
        />
      ),
    });
  }
  if (hasCostsModule && hasInventoryModule) {
    kpis.push({
      key: 'valor-bodega',
      group: 'Ventas y costos',
      node: <KpiCard label="Valor de bodega" value={formatCurrency(inventoryValue)} icon={Boxes} tone="info" />,
    });
  }
  if (canReadPurchases && purchasesMonthAgg) {
    kpis.push({
      key: 'compras-mes',
      group: 'Compras y tesorería',
      node: <KpiCard label="Compras netas del mes" value={formatCurrency(purchasesMonthAgg._sum.netAmount ?? 0)} icon={Truck} tone="warning" />,
    });
  }
  if (canReadTreasury && receivablesAgg) {
    const total = (receivablesAgg._sum.totalAmount ?? 0) - (receivablesAgg._sum.paidAmount ?? 0);
    kpis.push({ key: 'cxc-total', group: 'Compras y tesorería', node: <KpiCard label="Cuentas por cobrar" value={formatCurrency(total)} icon={Wallet} tone="accent" /> });
  }
  if (canReadTreasury && payablesAgg) {
    const total = (payablesAgg._sum.totalAmount ?? 0) - (payablesAgg._sum.paidAmount ?? 0);
    kpis.push({ key: 'cxp-total', group: 'Compras y tesorería', node: <KpiCard label="Cuentas por pagar" value={formatCurrency(total)} icon={TrendingDown} tone="warning" /> });
  }
  if (canOperatePos && posTodayAgg) {
    kpis.push({
      key: 'pos-hoy',
      group: 'Punto de venta',
      node: <KpiCard label="Ventas POS de hoy" value={formatCurrency(posTodayAgg._sum.totalAmount ?? 0)} icon={ScanBarcode} tone="success" />,
    });
  }
  if (canReadCandidates && candidatesActiveCount !== null) {
    kpis.push({
      key: 'candidatas-activas',
      group: 'Candidatas',
      node: <KpiCard label="Candidatas activas" value={String(candidatesActiveCount)} icon={Crown} tone="accent" />,
    });
  }
  if (canReadCandidates && candidatesPendingCount !== null && candidatesPendingCount > 0) {
    kpis.push({
      key: 'postulaciones-pendientes',
      group: 'Candidatas',
      node: <KpiCard label="Postulaciones por revisar" value={String(candidatesPendingCount)} icon={Users} tone="warning" />,
    });
  }
  if (canReadSponsorships && sponsorshipsAgg) {
    kpis.push({
      key: 'auspicios-recaudado',
      group: 'Auspicios y entradas',
      node: <KpiCard label="Recaudado en auspicios" value={formatCurrency(sponsorshipsAgg._sum.paidAmount ?? 0)} icon={Handshake} tone="success" />,
    });
  }
  if (canReadTicketing && ticketingAgg) {
    kpis.push({
      key: 'entradas-ingresos',
      group: 'Auspicios y entradas',
      // Wallet (no Ticket) para el monto: mismo criterio que ya usan los
      // propios dashboards de Ticketing/Voting (TicketingDashboardClient,
      // VotingDashboardClient) para "Ingresos confirmados" -- el icono de
      // dominio (Ticket/Vote) queda reservado para los conteos, no para plata.
      node: <KpiCard label="Ingresos por entradas" value={formatCurrency(ticketingAgg._sum.totalAmount ?? 0)} icon={Wallet} tone="success" />,
    });
    kpis.push({
      key: 'entradas-vendidas',
      group: 'Auspicios y entradas',
      node: <KpiCard label="Entradas vendidas" value={String(ticketingAgg._sum.quantity ?? 0)} icon={Ticket} tone="info" />,
    });
  }
  if (canReadPublicVoting && votingAgg) {
    kpis.push({
      key: 'votacion-recaudado',
      group: 'Votación',
      // tone="success" (no "accent") para cuadrar con el resto de tarjetas
      // "recaudado/ingresos" del panel (auspicios, entradas) -- antes quedaba
      // como la unica excepcion en accent sin ninguna razon semantica.
      // Icono Wallet, mismo criterio que "Ingresos por entradas" arriba.
      node: <KpiCard label="Recaudado en votación" value={formatCurrency(votingAgg._sum.totalAmount ?? 0)} icon={Wallet} tone="success" />,
    });
    kpis.push({
      key: 'votos-pagados',
      group: 'Votación',
      node: <KpiCard label="Votos pagados" value={String(votingAgg._sum.voteCount ?? 0)} icon={Vote} tone="info" />,
    });
  }
  if (canReadProjects && activeProjectsCount !== null) {
    kpis.push({
      key: 'proyectos-activos',
      group: 'Proyectos',
      node: <KpiCard label="Proyectos activos" value={String(activeProjectsCount)} icon={Briefcase} tone="info" />,
    });
  }

  // Agrupacion visual por dominio: con todos los modulos contratados esta
  // lista puede pasar de 15 tarjetas en un unico grid plano, sin ninguna
  // jerarquia entre "Ventas", "Candidatas", "Votación", etc. Se arman
  // secciones consecutivas (el orden de kpis ya sigue el orden de negocio)
  // y solo se muestran los encabezados cuando hay mas de un dominio -- una
  // empresa tipica con 2-3 modulos sigue viendo el mismo grid limpio de
  // siempre. El indice global se preserva para no romper el desfase de
  // entrada (100 + index * 40ms) que ya existia.
  const kpiGroups: Array<{ label: string; items: Array<{ key: string; node: React.ReactNode; index: number }> }> = [];
  kpis.forEach((kpi, index) => {
    const last = kpiGroups[kpiGroups.length - 1];
    if (last && last.label === kpi.group) {
      last.items.push({ key: kpi.key, node: kpi.node, index });
    } else {
      kpiGroups.push({ label: kpi.group, items: [{ key: kpi.key, node: kpi.node, index }] });
    }
  });
  const showKpiGroupHeaders = kpiGroups.length > 1;

  // Acción sugerida: una sola tarjeta, la más relevante para esta empresa en
  // este momento. Antes solo consideraba Ventas/Inventario — una empresa de
  // certámenes (Candidatas, Proyectos) sin esos dos módulos nunca veía nada
  // acá, cayendo directo al estado "activa un módulo" aunque sí tuviera
  // módulos contratados y pagados.
  type SuggestedAction = { title: string; description: string; actionLabel: string; href: string; icon: typeof ShoppingCart };
  let suggestedAction: SuggestedAction | null = null;
  if (criticalStockAll.length > 0 && hasInventoryModule && can(context, 'inventory:write')) {
    suggestedAction = {
      title: 'Reponer stock crítico',
      description: `${criticalStockAll.length} producto${criticalStockAll.length === 1 ? '' : 's'} bajo el mínimo de bodega`,
      actionLabel: 'Ir a inventario',
      href: '/dashboard/inventory?openStockForm=1',
      icon: PackagePlus,
    };
  } else if (context.features.hasDteBilling && can(context, 'sales:write')) {
    suggestedAction = {
      title: 'Emitir nueva venta',
      description: 'Generar una factura o boleta electrónica',
      actionLabel: 'Nueva venta',
      href: '/dashboard/sales/new',
      icon: ShoppingCart,
    };
  } else if (context.features.hasCandidates && can(context, 'candidates:write')) {
    suggestedAction = {
      title: 'Registrar una candidata',
      description: 'Crear la ficha de una nueva postulante',
      actionLabel: 'Nueva candidata',
      href: '/dashboard/candidates/new',
      icon: Crown,
    };
  } else if (context.features.hasEventProjects && can(context, 'projects:write')) {
    suggestedAction = {
      title: 'Crear un proyecto',
      description: 'Armar el centro de costo de tu próximo certamen o evento',
      actionLabel: 'Nuevo proyecto',
      href: '/dashboard/projects/new',
      icon: CalendarRange,
    };
  }

  const hasAnyContent = contracted.length > 0;

  // Chips de "Alertas de hoy": mismas categorías que el correo diario de
  // `operational-alerts.service.ts`, en vivo. Solo aparecen las que tienen
  // algo que mostrar — un dashboard con 5 chips en cero todos los días es
  // ruido, no información.
  const todayAlerts: Array<{ key: string; count: number; label: string; href: string; icon: typeof AlertTriangle; tone: 'danger' | 'warning' }> = [];
  if (criticalStockAll.length > 0) {
    todayAlerts.push({ key: 'stock', count: criticalStockAll.length, label: `producto${criticalStockAll.length === 1 ? '' : 's'} bajo stock mínimo`, href: '/dashboard/inventory', icon: PackageSearch, tone: 'danger' });
  }
  if (expiry && expiry.expiredLots > 0) {
    todayAlerts.push({ key: 'lots-expired', count: expiry.expiredLots, label: `lote${expiry.expiredLots === 1 ? '' : 's'} vencido${expiry.expiredLots === 1 ? '' : 's'} con saldo`, href: '/dashboard/inventory/lots', icon: PackageSearch, tone: 'danger' });
  }
  if (expiry && expiry.soonLots > 0) {
    todayAlerts.push({ key: 'lots-soon', count: expiry.soonLots, label: `lote${expiry.soonLots === 1 ? '' : 's'} por vencer en 30 días`, href: '/dashboard/inventory/lots', icon: PackageSearch, tone: 'warning' });
  }
  if (chequeSummary && chequeSummary.dueNowCount > 0) {
    todayAlerts.push({ key: 'cheques', count: chequeSummary.dueNowCount, label: `cheque${chequeSummary.dueNowCount === 1 ? '' : 's'} para depositar`, href: '/dashboard/treasury/cheques', icon: Wallet, tone: 'warning' });
  }
  if (chequeSummary && chequeSummary.bouncedCount > 0) {
    todayAlerts.push({ key: 'cheques-bounced', count: chequeSummary.bouncedCount, label: `cheque${chequeSummary.bouncedCount === 1 ? '' : 's'} protestado${chequeSummary.bouncedCount === 1 ? '' : 's'} por recuperar`, href: '/dashboard/treasury/cheques', icon: FileWarning, tone: 'danger' });
  }
  if (pendingApprovals.length > 0) {
    todayAlerts.push({ key: 'approvals', count: pendingApprovals.length, label: `compra${pendingApprovals.length === 1 ? '' : 's'} esperando aprobación`, href: '/dashboard/purchases', icon: ClipboardCheck, tone: 'warning' });
  }
  if (mismatchedPurchases.length > 0) {
    todayAlerts.push({ key: 'mismatch', count: mismatchedPurchases.length, label: `compra${mismatchedPurchases.length === 1 ? '' : 's'} con diferencia sin resolver`, href: '/dashboard/purchases', icon: FileWarning, tone: 'danger' });
  }
  if (overdueReceivables.length > 0) {
    todayAlerts.push({ key: 'receivables', count: overdueReceivables.length, label: `cuenta${overdueReceivables.length === 1 ? '' : 's'} por cobrar vencida${overdueReceivables.length === 1 ? '' : 's'}`, href: '/dashboard/treasury/cxc', icon: Wallet, tone: 'warning' });
  }
  if (expiringContracts.length > 0) {
    todayAlerts.push({ key: 'contracts', count: expiringContracts.length, label: `contrato${expiringContracts.length === 1 ? '' : 's'} de imagen por vencer`, href: '/dashboard/candidates', icon: BadgeAlert, tone: 'warning' });
  }
  if (contractsOverview && contractsOverview.summary.stale > 0) {
    const stale = contractsOverview.summary.stale;
    todayAlerts.push({ key: 'contracts-stale', count: stale, label: `contrato${stale === 1 ? '' : 's'} sin firmar hace más de una semana`, href: '/dashboard/contracts', icon: FileWarning, tone: 'warning' });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 duration-500 animate-in fade-in slide-in-from-top-2">
        <div>
          <h1 className="text-2xl font-semibold text-foreground" data-tutorial="module-header">
            {greeting()}, {capitalizedName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {context.companyName} · Plan {context.planName}
            {context.companyStatus === 'TRIAL' ? ' · período de prueba' : ''}
          </p>
        </div>
      </div>

      {/* Alertas de hoy: mismo dato que el correo diario, en vivo — ver
          `todayAlerts` más arriba. Ausente por completo si no hay nada que
          avisar, para no acostumbrar a la gente a ignorar la fila. */}
      {todayAlerts.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2.5 rounded-lg border border-warning/25 bg-warning-soft/40 p-3 pl-4 duration-500 animate-in fade-in slide-in-from-top-2"
          style={{ animationDelay: '75ms', animationFillMode: 'backwards' }}
        >
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground">
            <AlertTriangle className="size-3.5 text-warning" strokeWidth={2} />
            Hoy
          </span>
          <div className="flex flex-1 flex-wrap gap-2">
            {todayAlerts.map((alert) => (
              <Link
                key={alert.key}
                href={alert.href}
                className={`inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-card ring-1 ring-border transition-all duration-150 hover:-translate-y-0.5 hover:shadow-hover ${alert.tone === 'danger' ? 'hover:ring-danger/40' : 'hover:ring-warning/40'}`}
              >
                <alert.icon className={`size-3.5 ${alert.tone === 'danger' ? 'text-danger' : 'text-warning'}`} strokeWidth={2} />
                <span className="font-semibold tabular-nums">{alert.count}</span>
                {alert.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {!hasAnyContent && (
        <div className="rounded-lg border border-border bg-card shadow-card">
          <EmptyState
            title="Todavía no tienes ningún módulo contratado"
            description="Contacta a tu administrador o a soporte para activar los módulos que tu empresa necesita."
            className="py-16"
          />
        </div>
      )}

      {/* KPIs — cada tarjeta entra con un leve desfase (40ms * índice) en vez
          de todas a la vez: un detalle barato (CSS puro, sin JS ni layout
          shift) que hace que el panel se sienta vivo en la primera carga sin
          molestar en las siguientes (no se repite al navegar entre pestañas
          del mismo layout, solo al montar esta página). */}
      {kpis.length > 0 && (
        <div className="space-y-5">
          {kpiGroups.map((group) => (
            <section key={group.label} className="space-y-2.5">
              {showKpiGroupHeaders && (
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h2>
              )}
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
                {group.items.map((kpi) => (
                  <div
                    key={kpi.key}
                    className="duration-500 animate-in fade-in slide-in-from-bottom-2"
                    style={{ animationDelay: `${100 + kpi.index * 40}ms`, animationFillMode: 'backwards' }}
                  >
                    {kpi.node}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Cobros pendientes de certámenes (cuotas/pagarés vencidos) — visible
          para cualquier empresa con esos módulos, tenga o no ventas/inventario. */}
      {showOverdueCard && (
        <section className="rounded-lg border border-border bg-card p-5 shadow-card">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-danger-soft">
              <AlertTriangle className="size-4 text-danger" strokeWidth={1.75} />
            </span>
            <h3 className="text-sm font-semibold text-foreground">Cobros vencidos</h3>
          </div>
          {overdueInstallmentsCount === 0 && overduePromissoryCount === 0 ? (
            <p className="text-sm text-muted-foreground">Sin cuotas ni pagarés vencidos por ahora.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {overdueInstallments !== null && (
                <Link href="/dashboard/payment-plans" className="rounded-lg border border-border p-3 hover:bg-muted/50">
                  <p className="text-xs text-muted-foreground">Cuotas vencidas</p>
                  <p className="text-lg font-semibold text-foreground">{formatCurrency(overdueInstallmentsAmount)}</p>
                  <p className="text-xs text-muted-foreground">{overdueInstallmentsCount} cuota{overdueInstallmentsCount === 1 ? '' : 's'}</p>
                </Link>
              )}
              {overduePromissoryNotes !== null && (
                <Link href="/dashboard/promissory-notes" className="rounded-lg border border-border p-3 hover:bg-muted/50">
                  <p className="text-xs text-muted-foreground">Pagarés vencidos</p>
                  <p className="text-lg font-semibold text-foreground">{formatCurrency(overduePromissoryAmount)}</p>
                  <p className="text-xs text-muted-foreground">{overduePromissoryCount} pagaré{overduePromissoryCount === 1 ? '' : 's'}</p>
                </Link>
              )}
            </div>
          )}
        </section>
      )}

      {/* Checklist de contratos firmados: avance por certamen y lo pendiente. */}
      {contractsOverview && contractsOverview.summary.total > 0 && <ContractsDashboardCard overview={contractsOverview} />}

      {/* Gráfico de barras + donut (Client Component: recharts no puede vivir en el Server Component, ver DashboardCharts.tsx) */}
      {hasSalesModule && (
        <DashboardCharts monthlyBuckets={monthlyBuckets} mixData={mixData} currentMonthDocCount={currentMonthDocCount} />
      )}

      {/* Tabla reciente + actividad */}
      {(hasSalesModule || hasInventoryModule) && (
        <section className="grid grid-cols-12 gap-5">
          {hasSalesModule && (
            <div className={hasInventoryModule ? 'col-span-12 lg:col-span-7' : 'col-span-12'}>
              <RecentSalesTable documents={latestSales} />
            </div>
          )}

          {hasInventoryModule && (
            <div className={hasSalesModule ? 'col-span-12 lg:col-span-5' : 'col-span-12'}>
              <div className="rounded-lg border border-border bg-card p-5 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Inventario crítico</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {productCount} productos catalogados · {contactCount} contactos registrados
                    </p>
                  </div>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-danger-soft">
                    <PackageSearch className="size-5 text-danger" strokeWidth={1.75} />
                  </span>
                </div>

                <div className="mt-5 space-y-4">
                  {criticalStock.length > 0 ? (
                    criticalStock.map((stock) => (
                      <ProgressRow
                        key={stock.id}
                        label={`${stock.product.sku} — ${stock.product.name}`}
                        value={stock.product.minStock > 0 ? (stock.quantity / stock.product.minStock) * 100 : 0}
                        color="var(--danger)"
                      />
                    ))
                  ) : (
                    <EmptyState title="Sin productos bajo el mínimo" description="Todo el catálogo está sobre su stock mínimo de bodega." />
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Acción destacada + módulos contratados */}
      <section className="grid grid-cols-12 gap-5">
        {suggestedAction && (
          <div className="col-span-12 md:col-span-4">
            <ActionCard
              title={suggestedAction.title}
              description={suggestedAction.description}
              actionLabel={suggestedAction.actionLabel}
              href={suggestedAction.href}
              icon={suggestedAction.icon}
            />
          </div>
        )}

        <div className={suggestedAction ? 'col-span-12 md:col-span-8' : 'col-span-12'}>
          <div className="rounded-lg border border-border bg-card p-5 shadow-card">
            <h3 className="text-base font-semibold text-foreground">Módulos contratados</h3>
            {contracted.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {contracted.map((mod) => (
                  <span
                    key={mod.key}
                    className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-foreground"
                  >
                    <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                    {mod.label}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Sin módulos contratados. Contacta a tu administrador.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
