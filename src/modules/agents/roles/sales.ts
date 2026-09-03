import 'server-only';

import { z } from 'zod';
import type { DteType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { formatCurrency } from '@/lib/chile/tax';
import { getCompanySettings } from '@/lib/services/company.service';
import { generateAgentJson } from '../services/gemini-agent';
import { INDUSTRY_LABELS } from '../services/business-metrics.service';
import { SALES_KNOWLEDGE_BASE } from '../knowledge-base';

/**
 * Rol comercial (Ventas): basado 100% en datos propios de venta, NUNCA en
 * redes sociales ni datos de competidores externos (decisión de producto no
 * negociable: scraping externo es frágil y sin fuente confiable). Agrupa
 * `SalesDocumentItem` de los últimos 30 días por producto para encontrar los
 * más vendidos y los de mejor/peor margen (cruzando contra
 * `Product.costPricePMP`), y usa `CompanySettings.industryType` solo como
 * contexto general de rubro — nunca como dato de mercado inventado.
 *
 * También revisa el PRECIO DE CATÁLOGO completo (no solo lo vendido): compara
 * `Product.netPrice` contra `Product.costPricePMP` de cada producto activo
 * para detectar precios posiblemente mal puestos — margen casi nulo/negativo
 * (se está vendiendo casi al costo o perdiendo plata) o muy por sobre el
 * promedio del catálogo (podría ser intencional, pero vale la pena que el
 * dueño lo confirme). Es una comparación puramente interna contra el propio
 * catálogo, nunca contra un "precio de mercado" inventado.
 */
const LOOKBACK_DAYS = 30;
const TOP_N = 5;
/** Bajo este % de margen de catálogo, se marca como "posible precio mal puesto (muy bajo)". */
const LOW_MARGIN_THRESHOLD = 10;
/** Cuántas veces el margen promedio del catálogo dispara la alerta de "posible precio alto". */
const HIGH_MARGIN_MULTIPLIER = 2;
const TOP_CUSTOMERS_COUNT = 3;
const SALES_DOCUMENT_TYPES: DteType[] = ['FACTURA_33', 'FACTURA_EXENTA_34', 'BOLETA_39', 'NOTA_CREDITO_61', 'NOTA_DEBITO_56'];

function documentSign(type: DteType): number {
  return type === 'NOTA_CREDITO_61' ? -1 : 1;
}

const recommendationSchema = z.object({ title: z.string().min(1), detail: z.string().min(1) });
const recommendationsSchema = z.object({ recommendations: z.array(recommendationSchema).min(2).max(5) });

const RECOMMENDATIONS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    recommendations: {
      type: 'array',
      minItems: 2,
      maxItems: 5,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Título corto de la recomendación comercial (máximo 8 palabras), en español.' },
          detail: {
            type: 'string',
            description:
              'Explicación concreta y accionable (1-3 frases), en español simple, basada SOLO en los datos entregados. Si corresponde, indica contra qué criterio de referencia se está evaluando.',
          },
        },
        required: ['title', 'detail'],
      },
    },
  },
  required: ['recommendations'],
} as const;

const SYSTEM_PROMPT = [
  'Eres el responsable comercial (Ventas) virtual de una pyme chilena, con criterio comercial profesional.',
  'Recibirás un resumen de datos REALES de venta de los últimos 30 días (productos más vendidos, mejor y peor margen, concentración de ventas por cliente), una revisión del precio de TODO el catálogo activo contra su costo (productos con margen sospechosamente bajo o alto respecto al promedio de la propia empresa), y el rubro de la empresa como contexto general.',
  '',
  SALES_KNOWLEDGE_BASE,
  '',
  'Analiza TODAS las variables del resumen en conjunto (no solo una) para proponer entre 2 y 5 recomendaciones concretas y accionables — más cuando los datos lo justifiquen, sin rellenar con recomendaciones débiles solo por llegar a un número — en español simple, sobre qué vender más, qué precio de catálogo conviene revisar, o qué riesgo de concentración de clientes vale la pena gestionar.',
  'Usa los criterios de referencia solo para EVALUAR si una cifra real es saludable o preocupante — nunca los presentes como si fueran un dato de esta empresa. Nunca inventes datos de competidores, redes sociales ni tendencias de mercado que no tengas — no tienes acceso a esa información. El rubro es solo contexto general. La comparación de precios es SIEMPRE contra el propio catálogo de la empresa, nunca contra un precio de mercado que no conoces.',
].join('\n');

interface ProductPerformance {
  label: string;
  quantitySold: number;
  revenue: number;
  marginPercent: number;
}

export async function runSalesAgent(companyId: string): Promise<string> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - LOOKBACK_DAYS);

  const [settings, items, periodDocuments] = await Promise.all([
    getCompanySettings(companyId),
    prisma.salesDocumentItem.findMany({
      where: { companyId, document: { status: 'ISSUED', issueDate: { gte: since } } },
      select: { sku: true, description: true, productId: true, quantity: true, subtotal: true, unitCostPMP: true },
    }),
    prisma.salesDocument.findMany({
      where: { companyId, status: 'ISSUED', dteType: { in: SALES_DOCUMENT_TYPES }, issueDate: { gte: since } },
      select: { contactId: true, netAmount: true, dteType: true, contact: { select: { razonSocial: true } } },
    }),
  ]);

  // Concentración de ventas por cliente: cuánto de los ingresos netos del
  // período concentran los TOP_CUSTOMERS_COUNT principales clientes — señal
  // de riesgo de dependencia, independiente del análisis por producto.
  const revenueByCustomer = new Map<string, { razonSocial: string; revenue: number }>();
  let periodNetRevenue = 0;
  for (const doc of periodDocuments) {
    const signedAmount = documentSign(doc.dteType) * doc.netAmount;
    periodNetRevenue += signedAmount;
    const entry = revenueByCustomer.get(doc.contactId) ?? { razonSocial: doc.contact.razonSocial, revenue: 0 };
    entry.revenue += signedAmount;
    revenueByCustomer.set(doc.contactId, entry);
  }
  const topCustomers = Array.from(revenueByCustomer.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, TOP_CUSTOMERS_COUNT);
  const topCustomersRevenue = topCustomers.reduce((sum, c) => sum + c.revenue, 0);
  const topCustomersConcentrationPercent = periodNetRevenue === 0 ? 0 : (topCustomersRevenue / periodNetRevenue) * 100;

  // Precio de catálogo vs. costo, sobre TODOS los productos activos (no solo
  // los vendidos en el período) — es la única forma de detectar un producto
  // mal cotizado que todavía no se ha vendido nunca.
  const catalogProducts = await prisma.product.findMany({
    where: { companyId, isTrackable: true },
    select: { sku: true, name: true, netPrice: true, costPricePMP: true },
  });

  const priced = catalogProducts
    .filter((p) => p.netPrice > 0)
    .map((p) => ({
      label: `${p.name} (${p.sku})`,
      netPrice: p.netPrice,
      cost: p.costPricePMP,
      marginPercent: ((p.netPrice - p.costPricePMP) / p.netPrice) * 100,
    }));

  const avgMargin = priced.length > 0 ? priced.reduce((sum, p) => sum + p.marginPercent, 0) / priced.length : 0;

  const lowMarginProducts = priced
    .filter((p) => p.marginPercent < LOW_MARGIN_THRESHOLD)
    .sort((a, b) => a.marginPercent - b.marginPercent)
    .slice(0, 5);
  const highMarginProducts =
    avgMargin > 0
      ? priced
          .filter((p) => p.marginPercent > avgMargin * HIGH_MARGIN_MULTIPLIER)
          .sort((a, b) => b.marginPercent - a.marginPercent)
          .slice(0, 5)
      : [];

  const pricingLines: string[] = [];
  if (priced.length > 0) {
    pricingLines.push(`Margen promedio del catálogo activo (${priced.length} productos con precio y costo cargados): ${avgMargin.toFixed(1)}%.`);
    if (lowMarginProducts.length > 0) {
      pricingLines.push(
        `Posible precio mal puesto (margen bajo, menor a ${LOW_MARGIN_THRESHOLD}% — puede estar vendiéndose casi al costo o perdiendo plata): ${lowMarginProducts
          .map((p) => `${p.label} (precio ${formatCurrency(p.netPrice)}, costo ${formatCurrency(p.cost)}, margen ${p.marginPercent.toFixed(1)}%)`)
          .join(', ')}.`
      );
    }
    if (highMarginProducts.length > 0) {
      pricingLines.push(
        `Margen muy por sobre el promedio del catálogo (verificar si es intencional): ${highMarginProducts
          .map((p) => `${p.label} (margen ${p.marginPercent.toFixed(1)}%)`)
          .join(', ')}.`
      );
    }
  }

  if (items.length === 0 && pricingLines.length === 0) {
    return `Sin ventas emitidas en los últimos ${LOOKBACK_DAYS} días y sin productos con precio/costo cargados: no hay datos suficientes para proponer recomendaciones.`;
  }

  const byProduct = new Map<string, { label: string; quantitySold: number; revenue: number; cost: number }>();
  for (const item of items) {
    const key = item.productId ?? item.sku ?? item.description;
    const label = item.description || item.sku || 'Producto sin descripción';
    const entry = byProduct.get(key) ?? { label, quantitySold: 0, revenue: 0, cost: 0 };
    entry.quantitySold += item.quantity;
    entry.revenue += item.subtotal;
    entry.cost += Math.round(item.quantity * item.unitCostPMP);
    byProduct.set(key, entry);
  }

  const performances: ProductPerformance[] = Array.from(byProduct.values()).map((p) => ({
    label: p.label,
    quantitySold: p.quantitySold,
    revenue: p.revenue,
    marginPercent: p.revenue === 0 ? 0 : ((p.revenue - p.cost) / p.revenue) * 100,
  }));

  const topSellers = [...performances].sort((a, b) => b.quantitySold - a.quantitySold).slice(0, TOP_N);
  const bestMargin = [...performances].sort((a, b) => b.marginPercent - a.marginPercent).slice(0, 3);
  const worstMargin = [...performances].sort((a, b) => a.marginPercent - b.marginPercent).slice(0, 3);

  const lines: string[] = [];
  lines.push(`Rubro de la empresa: ${INDUSTRY_LABELS[settings.industryType]}`);
  if (topSellers.length > 0) {
    lines.push(
      `Productos más vendidos (últimos ${LOOKBACK_DAYS} días): ${topSellers
        .map((p) => `${p.label} (${p.quantitySold} unidades, ${formatCurrency(p.revenue)}, margen ${p.marginPercent.toFixed(1)}%)`)
        .join(', ')}`
    );
    lines.push(
      `Mejor margen: ${bestMargin.map((p) => `${p.label} (margen ${p.marginPercent.toFixed(1)}%, ${p.quantitySold} unidades)`).join(', ')}`
    );
    lines.push(
      `Peor margen: ${worstMargin.map((p) => `${p.label} (margen ${p.marginPercent.toFixed(1)}%, ${p.quantitySold} unidades)`).join(', ')}`
    );
  } else {
    lines.push(`Sin ventas emitidas en los últimos ${LOOKBACK_DAYS} días.`);
  }
  if (topCustomers.length > 0) {
    lines.push(
      `Ventas netas del período: ${formatCurrency(periodNetRevenue)}. Principales clientes: ${topCustomers
        .map((c) => `${c.razonSocial} (${formatCurrency(c.revenue)})`)
        .join(', ')} — concentran el ${topCustomersConcentrationPercent.toFixed(1)}% de las ventas netas del período`
    );
  }
  lines.push(...pricingLines);
  const summary = lines.join('\n');

  const { recommendations } = await generateAgentJson(SYSTEM_PROMPT, summary, RECOMMENDATIONS_JSON_SCHEMA, (raw) =>
    recommendationsSchema.parse(raw)
  );

  await prisma.agentTask.createMany({
    data: recommendations.map((rec) => ({
      companyId,
      role: 'SALES',
      title: rec.title,
      description: rec.detail,
      requiresApproval: false,
      payload: { basedOnSnapshot: summary },
    })),
  });

  return `Se generaron ${recommendations.length} recomendación(es) comercial(es) a partir de ${performances.length} producto(s) vendidos en los últimos ${LOOKBACK_DAYS} días y ${priced.length} producto(s) del catálogo revisados por precio vs. costo.`;
}
