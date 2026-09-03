import 'server-only';

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { formatCurrency } from '@/lib/chile/tax';
import { generateAgentJson } from '../services/gemini-agent';
import { COO_KNOWLEDGE_BASE } from '../knowledge-base';

/**
 * Rol COO: operaciones e inventario. Lee métricas REALES del ERP:
 *  - Stock crítico: mismo criterio que "Inventario crítico" en
 *    src/app/(dashboard)/dashboard/page.tsx (producto trackeable, con mínimo
 *    configurado, y stock actual bajo ese mínimo).
 *  - Sobre-stock: producto trackeable con mínimo configurado y stock actual
 *    por sobre `OVERSTOCK_MULTIPLIER` veces ese mínimo — capital inmovilizado,
 *    el extremo opuesto al quiebre de stock.
 *  - Valor de inventario a costo PMP, y concentración tipo Pareto (cuánto
 *    valor concentra el 20% de SKUs con más valor en bodega).
 *  - Señal de rotación: productos con al menos una salida por venta
 *    (`InventoryMovement.type = SALE_OUT`) en los últimos 30 días vs.
 *    productos con stock que NO tuvieron ninguna salida en esa ventana
 *    (candidatos a revisar si siguen vigentes en el catálogo).
 * Le pide a Gemini recomendaciones operativas concretas basadas SOLO en esos
 * datos, usando `COO_KNOWLEDGE_BASE` (rangos de referencia generales de
 * operaciones/inventario pyme) como lente profesional para interpretarlos —
 * nunca como datos de la empresa. `requiresApproval: false`: es informativo,
 * no dispara ninguna acción externa.
 */
const ROTATION_WINDOW_DAYS = 30;
const SAMPLE_SIZE = 5;
/** Cuántas veces el mínimo configurado dispara la alerta de "posible sobre-stock". */
const OVERSTOCK_MULTIPLIER = 3;
/** Fracción de SKUs (por valor) que se reporta como concentración tipo Pareto. */
const PARETO_SHARE = 0.2;

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
          title: { type: 'string', description: 'Título corto de la recomendación operativa (máximo 8 palabras), en español.' },
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
  'Eres el COO virtual (operaciones/inventario) de una pyme chilena, con criterio operativo profesional.',
  'Recibirás un resumen de datos REALES de inventario: cantidad total de SKUs activos, stock crítico, posible sobre-stock, valor de bodega y su concentración tipo Pareto, y productos sin movimiento reciente.',
  '',
  COO_KNOWLEDGE_BASE,
  '',
  'Analiza TODAS las variables del resumen en conjunto (no solo una) para proponer entre 2 y 5 recomendaciones operativas concretas y accionables — más cuando los datos lo justifiquen, sin rellenar con recomendaciones débiles solo por llegar a un número — en español simple.',
  'Usa los criterios de referencia solo para EVALUAR si una cifra real es saludable o preocupante — nunca los presentes como si fueran un dato de esta empresa, y nunca inventes nombres de productos, cifras ni plazos que no estén en el resumen.',
].join('\n');

export async function runCooAgent(companyId: string): Promise<string> {
  const windowStart = new Date();
  windowStart.setUTCDate(windowStart.getUTCDate() - ROTATION_WINDOW_DAYS);

  const [stocks, recentSaleMovements] = await Promise.all([
    prisma.stock.findMany({ where: { companyId }, include: { product: true } }),
    prisma.inventoryMovement.findMany({
      where: { companyId, type: 'SALE_OUT', createdAt: { gte: windowStart } },
      select: { productId: true },
      distinct: ['productId'],
    }),
  ]);

  const soldProductIds = new Set(recentSaleMovements.map((m) => m.productId));

  const totalSkuCount = new Set(stocks.map((s) => s.productId)).size;
  const inventoryValue = stocks.reduce((sum, stock) => sum + Math.round(stock.quantity * stock.product.costPricePMP), 0);

  const criticalStocks = stocks
    .filter((stock) => stock.product.isTrackable && stock.product.minStock > 0 && stock.quantity <= stock.product.minStock)
    .sort((a, b) => a.quantity - b.quantity);

  const overstockStocks = stocks
    .filter(
      (stock) =>
        stock.product.isTrackable && stock.product.minStock > 0 && stock.quantity > stock.product.minStock * OVERSTOCK_MULTIPLIER
    )
    .sort((a, b) => b.quantity * b.product.costPricePMP - a.quantity * a.product.costPricePMP);

  const staleStocks = stocks
    .filter((stock) => stock.product.isTrackable && stock.quantity > 0 && !soldProductIds.has(stock.productId))
    .sort((a, b) => b.quantity * b.product.costPricePMP - a.quantity * a.product.costPricePMP);

  if (criticalStocks.length === 0 && staleStocks.length === 0 && overstockStocks.length === 0) {
    return 'Sin señales de inventario crítico, sobre-stock ni productos sin rotación en la ventana analizada.';
  }

  // Concentración tipo Pareto: cuánto valor de inventario concentra el
  // PARETO_SHARE (20%) de las filas de stock con mayor valor.
  const byValueDesc = [...stocks].sort(
    (a, b) => b.quantity * b.product.costPricePMP - a.quantity * a.product.costPricePMP
  );
  const paretoCount = Math.max(1, Math.round(byValueDesc.length * PARETO_SHARE));
  const paretoValue = byValueDesc
    .slice(0, paretoCount)
    .reduce((sum, s) => sum + Math.round(s.quantity * s.product.costPricePMP), 0);
  const paretoPercent = inventoryValue === 0 ? 0 : (paretoValue / inventoryValue) * 100;

  const lines: string[] = [];
  lines.push(`Cantidad total de SKUs con stock: ${totalSkuCount}`);
  lines.push(`Valor total de inventario (a costo PMP): ${formatCurrency(inventoryValue)}`);
  if (byValueDesc.length > 0) {
    lines.push(
      `Concentración de valor: el ${((paretoCount / byValueDesc.length) * 100).toFixed(0)}% de los SKUs con más valor (${paretoCount} de ${byValueDesc.length}) concentra el ${paretoPercent.toFixed(1)}% del valor total de inventario`
    );
  }
  lines.push(`Productos con stock bajo el mínimo configurado: ${criticalStocks.length}`);
  if (criticalStocks.length > 0) {
    lines.push(
      `Ejemplos de stock crítico: ${criticalStocks
        .slice(0, SAMPLE_SIZE)
        .map((s) => `${s.product.sku} — ${s.product.name} (stock ${s.quantity}, mínimo ${s.product.minStock})`)
        .join('; ')}`
    );
  }
  lines.push(`Productos con posible sobre-stock (más de ${OVERSTOCK_MULTIPLIER}x el mínimo configurado): ${overstockStocks.length}`);
  if (overstockStocks.length > 0) {
    lines.push(
      `Ejemplos de sobre-stock: ${overstockStocks
        .slice(0, SAMPLE_SIZE)
        .map((s) => `${s.product.sku} — ${s.product.name} (stock ${s.quantity}, mínimo ${s.product.minStock}, valor ${formatCurrency(Math.round(s.quantity * s.product.costPricePMP))})`)
        .join('; ')}`
    );
  }
  lines.push(`Productos con stock que no tuvieron ninguna venta en los últimos ${ROTATION_WINDOW_DAYS} días: ${staleStocks.length}`);
  if (staleStocks.length > 0) {
    lines.push(
      `Ejemplos sin rotación reciente: ${staleStocks
        .slice(0, SAMPLE_SIZE)
        .map((s) => `${s.product.sku} — ${s.product.name} (stock ${s.quantity}, valor ${formatCurrency(Math.round(s.quantity * s.product.costPricePMP))})`)
        .join('; ')}`
    );
  }
  const summary = lines.join('\n');

  const { recommendations } = await generateAgentJson(SYSTEM_PROMPT, summary, RECOMMENDATIONS_JSON_SCHEMA, (raw) =>
    recommendationsSchema.parse(raw)
  );

  await prisma.agentTask.createMany({
    data: recommendations.map((rec) => ({
      companyId,
      role: 'COO',
      title: rec.title,
      description: rec.detail,
      requiresApproval: false,
      payload: { basedOnSnapshot: summary },
    })),
  });

  return `Se generaron ${recommendations.length} recomendación(es) operativa(s) a partir de ${criticalStocks.length} producto(s) en stock crítico, ${overstockStocks.length} en posible sobre-stock y ${staleStocks.length} sin rotación reciente.`;
}
