import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { AuthContext } from '@/lib/auth/guards';
import type { AnalyticsModule, AnalyticsSnapshot, DailyMetric } from '@/lib/analytics/types';
import { analyzeSales } from '@/lib/analytics/science';
import { santiagoDateParts, santiagoMidnightUtc, startOfTodaySantiago } from '@/lib/chile/timezone';

const calendar = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' });
function shiftDay(date: Date, offset: number): Date {
  const { year, month, day } = santiagoDateParts(date);
  const shifted = new Date(Date.UTC(year, month - 1, day + offset));
  return santiagoMidnightUtc(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}
type GroupedDay = { date: string; amount: bigint; documents: bigint };

/** Agrega en Postgres: el navegador recibe como máximo 90 puntos y 30 eventos,
 * nunca documentos, usuarios, sueldos ni metadatos de auditoría completos. */
export async function analyticsSnapshot(context: AuthContext, module: AnalyticsModule, requestedDays: 7 | 30 | 90): Promise<AnalyticsSnapshot> {
  const now = new Date();
  const today = startOfTodaySantiago(now);
  const days = module === 'science' ? 90 : requestedDays;
  const start = shiftDay(today, module === 'science' ? -days : -(days - 1));
  // El panel incluye hoy hasta el instante de lectura. El modelo usa días completos.
  const end = module === 'science' ? today : now;
  const previousStart = shiftDay(start, -days);
  const has = (permission: AuthContext['permissions'][number]) => context.permissions.includes(permission);
  const sources = {
    sales: has('sales:read') || has('pos:close'),
    purchases: has('purchases:read'),
    treasury: has('treasury:read'),
    inventory: has('products:read'),
  };
  const companyId = context.companyId;
  const raw = await prisma.$transaction(async (tx) => {
    // Prisma DateTime se guarda como timestamp sin zona en UTC; convertir
    // explícitamente ANTES de agrupar evita que medianoche dependa del host.
    const sales = sources.sales ? await tx.$queryRaw<GroupedDay[]>(Prisma.sql`
      SELECT to_char("issueDate" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Santiago', 'YYYY-MM-DD') AS date,
        SUM((CASE WHEN "dteType" = 'NOTA_CREDITO_61' THEN -1 ELSE 1 END) * ("netAmount"::bigint + "exemptAmount")) AS amount,
        COUNT(*) AS documents
      FROM "SalesDocument"
      WHERE "companyId" = ${companyId} AND status = 'ISSUED'
        AND "dteType" IN ('FACTURA_33', 'FACTURA_EXENTA_34', 'BOLETA_39', 'BOLETA_EXENTA_41', 'NOTA_CREDITO_61', 'NOTA_DEBITO_56')
        AND "issueDate" >= ${module === 'science' ? start : previousStart} AND "issueDate" < ${end}
      GROUP BY 1 ORDER BY 1
    `) : [];
    const purchases = sources.purchases && module === 'analytics' ? await tx.$queryRaw<GroupedDay[]>(Prisma.sql`
      SELECT to_char("issueDate" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Santiago', 'YYYY-MM-DD') AS date,
        SUM((CASE WHEN "documentType" = 'NOTA_CREDITO' THEN -1 ELSE 1 END) * ("netAmount"::bigint + "exemptAmount")) AS amount,
        COUNT(*) AS documents
      FROM "PurchaseDocument"
      WHERE "companyId" = ${companyId} AND status = 'ISSUED'
        AND "documentType" IN ('FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO')
        AND "issueDate" >= ${start} AND "issueDate" < ${end}
      GROUP BY 1 ORDER BY 1
    `) : [];
    const payments = sources.treasury && module === 'analytics' ? await tx.$queryRaw<Array<{ date: string; type: string; amount: bigint }>>(Prisma.sql`
      SELECT to_char("paymentDate" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Santiago', 'YYYY-MM-DD') AS date,
        type, SUM(amount::bigint) AS amount FROM "Payment"
      WHERE "companyId" = ${companyId} AND "paymentDate" >= ${start} AND "paymentDate" < ${end}
      GROUP BY 1, 2 ORDER BY 1
    `) : [];
    const firstSale = sources.sales && module === 'science' ? await tx.salesDocument.aggregate({
      where: { companyId, status: 'ISSUED', dteType: { in: ['FACTURA_33', 'FACTURA_EXENTA_34', 'BOLETA_39', 'BOLETA_EXENTA_41', 'NOTA_CREDITO_61', 'NOTA_DEBITO_56'] }, issueDate: { lt: end } },
      _min: { issueDate: true },
    }) : null;
    const receivable = sources.sales && module === 'analytics' ? await tx.$queryRaw<Array<{ amount: bigint }>>(Prisma.sql`
      SELECT COALESCE(SUM(GREATEST("totalAmount"::bigint - "paidAmount", 0)), 0) AS amount FROM "SalesDocument"
      WHERE "companyId" = ${companyId} AND status = 'ISSUED' AND "issueDate" < ${now}
      AND "dteType" IN ('FACTURA_33', 'FACTURA_EXENTA_34', 'BOLETA_39', 'BOLETA_EXENTA_41', 'NOTA_DEBITO_56')
    `) : null;
    const payable = sources.purchases && module === 'analytics' ? await tx.$queryRaw<Array<{ amount: bigint }>>(Prisma.sql`
      SELECT COALESCE(SUM(GREATEST("totalAmount"::bigint - "paidAmount", 0)), 0) AS amount FROM "PurchaseDocument"
      WHERE "companyId" = ${companyId} AND status = 'ISSUED' AND "issueDate" < ${now}
      AND "documentType" IN ('FACTURA', 'NOTA_DEBITO')
    `) : null;
    const operations: AnalyticsSnapshot['operations'] = [];
    if (module === 'analytics') {
      if (sources.inventory) {
        const stock = await tx.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
          SELECT COUNT(*) AS count FROM (
            SELECT p.id FROM "Product" p LEFT JOIN "Stock" s ON s."productId" = p.id AND s."companyId" = ${companyId}
            WHERE p."companyId" = ${companyId} AND p."isActive" = true AND p."isTrackable" = true
            GROUP BY p.id, p."minStock" HAVING COALESCE(SUM(s.quantity), 0) <= p."minStock"
          ) AS low_stock
        `);
        operations.push({ key: 'stock', label: 'Productos en mínimo o agotados', value: Number(stock[0]?.count ?? 0), href: '/dashboard/inventory' });
      }
      if (has('pos:close')) operations.push({ key: 'pos', label: 'Cajas abiertas', value: await tx.cashShift.count({ where: { companyId, status: 'OPEN' } }), href: '/dashboard/pos' });
      if (has('crm:read')) operations.push({ key: 'crm', label: 'Oportunidades abiertas', value: await tx.opportunity.count({ where: { companyId, stage: { notIn: ['WON', 'LOST'] } } }), href: '/dashboard/crm' });
      if (has('tasks:read')) operations.push({ key: 'tasks', label: 'Tareas pendientes', value: await tx.teamTask.count({ where: { companyId, status: { in: ['TODO', 'DOING'] } } }), href: '/dashboard/tasks' });
      if (has('manufacturing:read')) operations.push({ key: 'production', label: 'Órdenes en producción', value: await tx.productionOrder.count({ where: { companyId, status: { in: ['PLANNED', 'IN_PROGRESS'] } } }), href: '/dashboard/manufacturing' });
      if (has('service:read')) operations.push({ key: 'service', label: 'Servicios sin entregar', value: await tx.serviceTicket.count({ where: { companyId, status: { notIn: ['DELIVERED', 'CANCELLED'] } } }), href: '/dashboard/service' });
      if (has('projects:read')) operations.push({ key: 'projects', label: 'Eventos y proyectos abiertos', value: await tx.project.count({ where: { companyId, status: { in: ['PLANNING', 'IN_PROGRESS'] } } }), href: '/dashboard/projects' });
      if (has('payroll:read')) operations.push({ key: 'people', label: 'Trabajadores activos', value: await tx.employee.count({ where: { companyId, status: 'ACTIVE' } }), href: '/dashboard/hr' });
      if (has('quality:read')) operations.push({ key: 'quality', label: 'Inspecciones fallidas del período', value: await tx.qualityInspection.count({ where: { companyId, status: 'FAILED', createdAt: { gte: start, lt: end } } }), href: '/dashboard/quality' });
      if (has('store:read')) operations.push({ key: 'store', label: 'Pedidos pagados sin entregar', value: await tx.storeOrder.count({ where: { companyId, status: 'OPEN', paymentStatus: 'PAID', fulfillmentStatus: { not: 'DELIVERED' } } }), href: '/dashboard/store' });
    }
    const activity = module === 'analytics' && has('audit:read') ? await tx.auditLog.findMany({
      where: { companyId, createdAt: { gte: start, lt: now } },
      select: { id: true, entity: true, action: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 30,
    }) : [];
    return { sales, purchases, payments, firstSale, receivable, payable, operations, activity };
  }, { isolationLevel: 'RepeatableRead', timeout: 15000 });

  const salesMap = new Map(raw.sales.map((row) => [row.date, row]));
  const purchasesMap = new Map(raw.purchases.map((row) => [row.date, Number(row.amount)]));
  const paymentMap = new Map(raw.payments.map((row) => [`${row.date}:${row.type}`, Number(row.amount)]));
  const daily: DailyMetric[] = Array.from({ length: days }, (_, index) => {
    const date = calendar.format(shiftDay(start, index));
    return { date, netSales: Number(salesMap.get(date)?.amount ?? 0), documents: Number(salesMap.get(date)?.documents ?? 0), purchases: purchasesMap.get(date) ?? 0, income: paymentMap.get(`${date}:INCOME`) ?? 0, expense: paymentMap.get(`${date}:EXPENSE`) ?? 0 };
  });
  const sum = (key: keyof Omit<DailyMetric, 'date'>) => daily.reduce((total, row) => total + row[key], 0);
  const startKey = calendar.format(start);
  return {
    companyId, companyName: context.companyName, generatedAt: now.toISOString(), timezone: 'America/Santiago', days, sources, daily,
    totals: {
      netSales: sources.sales ? sum('netSales') : null,
      previousNetSales: sources.sales ? raw.sales.filter((row) => row.date < startKey).reduce((total, row) => total + Number(row.amount), 0) : null,
      purchases: sources.purchases && module === 'analytics' ? sum('purchases') : null,
      income: sources.treasury && module === 'analytics' ? sum('income') : null,
      expense: sources.treasury && module === 'analytics' ? sum('expense') : null,
      documents: sources.sales ? sum('documents') : null,
      receivable: raw.receivable ? Number(raw.receivable[0]?.amount ?? 0) : null,
      payable: raw.payable ? Number(raw.payable[0]?.amount ?? 0) : null,
    },
    operations: raw.operations,
    activity: raw.activity.map((row) => ({ id: row.id, entity: row.entity, action: row.action, at: row.createdAt.toISOString() })),
    science: module === 'science' ? analyzeSales(daily, raw.firstSale?._min.issueDate ? calendar.format(raw.firstSale._min.issueDate) : null) : null,
  };
}
