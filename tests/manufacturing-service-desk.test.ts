import { estimateOrderCost, findShortages, finishedCost, scaleBom, validateBom } from '@/lib/manufacturing/production';
import { allowedTransitions, canEditEstimate, canTransition, daysOpen, estimateTotals, PUBLIC_STEPS, publicStepIndex } from '@/lib/service/tickets';
import { bomSchema, completeProductionSchema } from '@/modules/manufacturing/schema';
import { serviceLinesSchema, serviceTicketSchema } from '@/modules/service-desk/schema';

/**
 * Ola 6 · Operaciones: recetas y órdenes de producción, y el ciclo de una
 * orden de servicio técnico con presupuesto aprobado por el cliente.
 */

describe('Producción: recetas', () => {
  const bom = [
    { productId: 'harina', quantity: 10 },
    { productId: 'azucar', quantity: 2.5 },
    { productId: 'huevo', quantity: 12 },
  ];

  it('escala la receta a la cantidad de la orden', () => {
    // La receta produce 40 unidades; se piden 100.
    expect(scaleBom(bom, 40, 100)).toEqual([
      { productId: 'harina', quantity: 25 },
      { productId: 'azucar', quantity: 6.25 },
      { productId: 'huevo', quantity: 30 },
    ]);
    // Sin ruido de punto flotante en fracciones.
    expect(scaleBom([{ productId: 'x', quantity: 0.1 }], 3, 1)[0].quantity).toBe(0.0333);
    expect(() => scaleBom(bom, 0, 10)).toThrow();
    expect(() => scaleBom(bom, 1, 0)).toThrow();
  });

  it('detecta insumos que no alcanzan en la bodega', () => {
    const required = scaleBom(bom, 40, 100);
    const shortages = findShortages(required, { harina: 30, azucar: 5, huevo: 30 });
    expect(shortages).toEqual([{ productId: 'azucar', required: 6.25, available: 5, missing: 1.25 }]);
    expect(findShortages(required, { harina: 25, azucar: 6.25, huevo: 30 })).toEqual([]);
    // Un insumo sin fila de stock cuenta como cero.
    expect(findShortages([{ productId: 'sal', quantity: 1 }], {})[0].missing).toBe(1);
  });

  it('costea el producto terminado: insumos al PMP + fabricación', () => {
    const required = scaleBom(bom, 40, 100);
    const estimate = estimateOrderCost(required, { harina: 1_200, azucar: 1_000, huevo: 150 }, 20_000, 100);
    expect(estimate.materials).toBe(25 * 1_200 + 6.25 * 1_000 + 30 * 150);
    expect(estimate.total).toBe(estimate.materials + 20_000);
    expect(estimate.unitCost).toBe(Math.round((estimate.total / 100) * 100) / 100);
    expect(finishedCost(1_000, 0, 3).unitCost).toBe(333.33);
    expect(finishedCost(1_000, -50, 1).total).toBe(1_000);
  });

  it('rechaza recetas que se consumen a sí mismas o repiten insumos', () => {
    expect(validateBom('torta', [{ productId: 'torta', quantity: 1 }])).toMatch(/propia receta/);
    expect(validateBom('torta', [{ productId: 'a', quantity: 1 }, { productId: 'a', quantity: 2 }])).toMatch(/repetido/);
    expect(validateBom('torta', [])).toMatch(/al menos un insumo/);
    expect(validateBom('torta', bom)).toBeNull();
  });

  it('valida las entradas de receta y de término de producción', () => {
    expect(bomSchema.safeParse({ productId: 'p', name: 'Torta', outputQuantity: 0, components: bom }).success).toBe(false);
    expect(bomSchema.safeParse({ productId: 'p', name: 'Torta', outputQuantity: 40, components: bom }).success).toBe(true);
    const done = completeProductionSchema.parse({ producedQuantity: 98 });
    expect(done).toEqual({ producedQuantity: 98, consumed: {}, additionalCost: 0 });
    expect(completeProductionSchema.safeParse({ producedQuantity: 1, additionalCost: 10.5 }).success).toBe(false);
  });
});

describe('Servicio técnico: ciclo de la orden', () => {
  it('no permite reparar sin presupuesto aprobado, salvo garantía', () => {
    expect(canTransition('DIAGNOSING', 'IN_REPAIR', { warranty: false })).toBe(false);
    expect(canTransition('DIAGNOSING', 'IN_REPAIR', { warranty: true })).toBe(true);
    expect(allowedTransitions('DIAGNOSING', { warranty: false })).toEqual(['WAITING_APPROVAL', 'READY', 'CANCELLED']);
  });

  it('sigue el flujo recibido → presupuesto → reparación → entrega', () => {
    const path = ['RECEIVED', 'DIAGNOSING', 'WAITING_APPROVAL', 'APPROVED', 'IN_REPAIR', 'READY', 'DELIVERED'] as const;
    for (let index = 1; index < path.length; index += 1) {
      expect(canTransition(path[index - 1], path[index], { warranty: false })).toBe(true);
    }
    // Un presupuesto rechazado deja el equipo listo para retiro.
    expect(canTransition('WAITING_APPROVAL', 'READY', { warranty: false })).toBe(true);
    // Entregado y anulado son finales.
    expect(allowedTransitions('DELIVERED', { warranty: false })).toEqual([]);
    expect(allowedTransitions('CANCELLED', { warranty: true })).toEqual([]);
    // Aparece otra falla durante la reparación: se vuelve a diagnóstico.
    expect(canTransition('IN_REPAIR', 'DIAGNOSING', { warranty: false })).toBe(true);
  });

  it('el presupuesto solo se edita mientras se diagnostica (o en garantía)', () => {
    expect(canEditEstimate('DIAGNOSING', false)).toBe(true);
    expect(canEditEstimate('WAITING_APPROVAL', false)).toBe(false);
    expect(canEditEstimate('APPROVED', false)).toBe(false);
    expect(canEditEstimate('IN_REPAIR', true)).toBe(true);
    expect(canEditEstimate('DELIVERED', true)).toBe(false);
  });

  it('calcula el presupuesto con IVA y los pasos que ve el cliente', () => {
    expect(estimateTotals([{ quantity: 1, unitPrice: 45_000 }, { quantity: 2, unitPrice: 12_500 }])).toEqual({ net: 70_000, iva: 13_300, total: 83_300 });
    expect(publicStepIndex('RECEIVED')).toBe(0);
    expect(publicStepIndex('APPROVED')).toBe(publicStepIndex('WAITING_APPROVAL'));
    expect(publicStepIndex('DELIVERED')).toBe(PUBLIC_STEPS.length - 1);
    expect(daysOpen(new Date('2026-09-01T12:00:00Z'), new Date('2026-09-04T11:00:00Z'))).toBe(2);
  });

  it('valida la recepción y las líneas del presupuesto', () => {
    expect(serviceTicketSchema.safeParse({ contactId: 'c', equipment: 'Notebook', reportedIssue: 'No enciende', priority: 'NORMAL' }).success).toBe(true);
    expect(serviceTicketSchema.safeParse({ contactId: 'c', equipment: 'N', reportedIssue: 'No enciende', priority: 'NORMAL' }).success).toBe(false);
    expect(serviceLinesSchema.safeParse([{ kind: 'LABOR', description: 'Cambio de pantalla', quantity: 1, unitPrice: 30_000 }]).success).toBe(true);
    expect(serviceLinesSchema.safeParse([{ kind: 'PART', description: 'Pantalla', quantity: 1, unitPrice: 10.5 }]).success).toBe(false);
  });
});
