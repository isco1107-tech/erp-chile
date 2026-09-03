import 'server-only';

/**
 * Bibliografía de referencia para el equipo ejecutivo virtual. Son criterios
 * y rangos GENERALES de finanzas/operaciones para pymes (no una norma exacta
 * ni específica de ninguna empresa) — su único uso es darle al modelo un
 * lente profesional para EVALUAR si una cifra real es saludable o no. Nunca
 * reemplazan ni contradicen la regla de cada rol de "nunca inventes datos que
 * no estén en el resumen entregado": estos rangos NO son datos de la empresa,
 * son criterio de referencia para interpretarlos.
 *
 * Mantenerlos en un solo lugar (en vez de repetidos en cada prompt) para que
 * ajustar un umbral no signifique tocar los 4 archivos de rol.
 */

export const CFO_KNOWLEDGE_BASE = [
  'Criterios de referencia (generales, no una norma exacta para toda empresa):',
  '- Liquidez de corto plazo: si las cuentas por cobrar totales son menores que las cuentas por pagar totales, hay riesgo real de descalce de caja aunque el negocio sea rentable en el papel.',
  '- Cobranza: cuentas por cobrar vencidas por sobre ~20-30% del total de cuentas por cobrar es una señal de alerta seria de gestión de cobranza.',
  '- Concentración de cartera: si los 3 principales deudores concentran más del 50% de las cuentas por cobrar totales, el riesgo de no pago está peligrosamente concentrado en pocos clientes.',
  '- El IVA débito de este resumen es el IVA de las ventas del período, NO la utilidad de la empresa. Lo que efectivamente se paga en el F29 es ese débito neteado contra el IVA crédito fiscal de las compras y cualquier remanente del mes anterior — este resumen no incluye ese crédito fiscal, así que el IVA débito informado puede ser mayor al monto final que la empresa realmente pagará al Fisco. Aun así, nunca debe gastarse como si fuera margen disponible sin antes reservarlo.',
  '- Una caída de ventas netas mes contra mes de más de ~15-20%, sin una explicación estacional evidente en los datos, amerita revisión prioritaria.',
  '- Margen bruto saludable de referencia por rubro (aproximado): Comercio 20-35%, Retail 20-35%, Distribución 10-20%, Servicios 40-60%, Manufactura liviana 25-40%. Compara SOLO contra el rango del rubro que viene indicado explícitamente en los datos como "Rubro declarado de la empresa" — nunca asumas ni inventes un rubro. Un margen muy por debajo de ese rango es señal de alerta; muy por sobre el rango no es un problema, pero vale la pena verificar que el dato esté bien calculado.',
].join('\n');

export const COO_KNOWLEDGE_BASE = [
  'Criterios de referencia (generales, no una norma exacta para toda empresa):',
  '- Rotación de inventario saludable en pyme de comercio/retail: entre 6 y 12 veces al año (renovar el stock cada 30-60 días aprox.). Rotar menos de 4 veces al año (cada 90+ días sin movimiento) es señal de sobre-stock y capital inmovilizado.',
  '- Quiebre de stock en un producto de alta rotación suele costar más (venta perdida + cliente insatisfecho) que el costo de mantener stock de seguridad razonable — por eso el stock mínimo configurado importa más en los productos que más se venden.',
  '- Principio de Pareto (80/20): en la mayoría de los catálogos, un 20% de los productos concentra cerca del 80% del valor de venta o de inventario. Vale la pena identificar ese grupo y priorizar que nunca tenga quiebre de stock.',
  '- Productos sin ninguna venta en 30-60-90 días son candidatos a revisar precio, promocionar o liquidar antes de que el capital inmovilizado siga creciendo.',
  '- Sobre-stock (stock muy por sobre el mínimo configurado, ej. más de 3 veces el mínimo) inmoviliza capital de trabajo igual que el quiebre de stock perjudica la venta — ambos extremos son ineficiencia operativa.',
].join('\n');

export const SALES_KNOWLEDGE_BASE = [
  'Criterios de referencia (generales, no una norma exacta para toda empresa):',
  '- Un margen de venta bajo 10% en comercio/retail suele no alcanzar a cubrir gastos operativos (arriendo, sueldos, etc.) aunque haya volumen de venta — no es solo "vender poco", puede ser "vender perdiendo".',
  '- Concentración de clientes: si un solo cliente concentra más de ~30-40% de las ventas del período, hay riesgo real de dependencia — perder ese cliente golpearía fuerte los ingresos.',
  '- Un precio de catálogo muy por sobre el promedio puede ser intencional (producto premium/diferenciado) o un error de carga — la señal estadística no reemplaza el criterio del dueño, solo marca la excepción para que la confirme.',
  '- Productos con alta rotación en unidades pero margen bajo valen la pena revisar en conjunto: mucho volumen a poco margen puede ser peor para la caja que menos volumen a mejor margen.',
].join('\n');

/** Rúbrica de priorización para el resumen ejecutivo del CEO: caja/riesgo financiero primero, luego riesgo operativo, luego oportunidad comercial — no por orden de llegada. */
export const CEO_PRIORITIZATION_RUBRIC = [
  'Criterio de priorización (úsalo para ordenar, no para inventar prioridades nuevas):',
  '1. Riesgo financiero inmediato (dinero vencido o por vencer, descalce de caja).',
  '2. Riesgo operativo (quiebre de stock en productos que se venden, sobre-stock relevante).',
  '3. Oportunidad comercial (qué vender más, qué precio revisar).',
  'Si hay varias alertas del mismo nivel, prioriza la de mayor monto/impacto en pesos.',
].join('\n');
