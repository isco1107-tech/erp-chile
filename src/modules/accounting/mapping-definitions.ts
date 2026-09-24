import type { AccountType } from '@prisma/client';

/**
 * Qué significa cada clave semántica que usa el motor de asientos y qué tipos
 * de cuenta tienen sentido para ella. Datos puros: lo usan la pantalla
 * "Cuentas del sistema" (cliente) y el servicio que valida el cambio.
 *
 * Cambiar un mapeo NO reescribe asientos pasados: afecta solo a los que se
 * generen desde ese momento.
 */

export type MappingGroup = 'money' | 'sales' | 'purchases' | 'taxes' | 'people' | 'events' | 'results';

export const MAPPING_GROUP_LABELS: Record<MappingGroup, string> = {
  money: 'Dinero',
  sales: 'Clientes y ventas',
  purchases: 'Proveedores, compras e inventario',
  taxes: 'Impuestos',
  people: 'Personas (sueldos, honorarios y rendiciones)',
  events: 'Cobros sin documento tributario',
  results: 'Patrimonio y resultados',
};

export interface MappingDefinition {
  key: string;
  label: string;
  description: string;
  group: MappingGroup;
  allowedTypes: AccountType[];
}

export const MAPPING_DEFINITIONS: MappingDefinition[] = [
  { key: 'CAJA', label: 'Caja', description: 'Donde entra y sale el efectivo cuando la caja no tiene cuenta contable propia.', group: 'money', allowedTypes: ['ASSET'] },
  { key: 'BANCO', label: 'Banco', description: 'Transferencias, tarjetas y cheques cuando el banco no tiene cuenta contable propia.', group: 'money', allowedTypes: ['ASSET'] },

  { key: 'CLIENTES', label: 'Clientes', description: 'Ventas a crédito por cobrar.', group: 'sales', allowedTypes: ['ASSET'] },
  { key: 'VENTAS_AFECTAS', label: 'Ventas afectas', description: 'Neto de facturas y boletas afectas a IVA.', group: 'sales', allowedTypes: ['REVENUE'] },
  { key: 'VENTAS_EXENTAS', label: 'Ventas exentas', description: 'Ventas y servicios exentos de IVA.', group: 'sales', allowedTypes: ['REVENUE'] },
  { key: 'COSTO_VENTAS', label: 'Costo de ventas', description: 'Costo PMP de lo vendido.', group: 'sales', allowedTypes: ['COST', 'EXPENSE'] },
  { key: 'ANTICIPOS_CLIENTES', label: 'Anticipos de clientes', description: 'Pagos de clientes por sobre el saldo de su documento, hasta devolverlos o aplicarlos.', group: 'sales', allowedTypes: ['LIABILITY'] },

  { key: 'PROVEEDORES', label: 'Proveedores', description: 'Facturas de compra por pagar.', group: 'purchases', allowedTypes: ['LIABILITY'] },
  { key: 'EXISTENCIAS', label: 'Existencias', description: 'Valor del inventario.', group: 'purchases', allowedTypes: ['ASSET'] },
  { key: 'GASTOS_OPERACIONALES', label: 'Gastos operacionales', description: 'Compras de servicios y gastos sin producto de inventario.', group: 'purchases', allowedTypes: ['EXPENSE', 'COST'] },
  { key: 'DIFERENCIA_INVENTARIO', label: 'Diferencias de inventario', description: 'Ajustes de stock (mermas y sobrantes).', group: 'purchases', allowedTypes: ['COST', 'EXPENSE'] },
  { key: 'DIFERENCIA_CAJA', label: 'Diferencias de caja', description: 'Faltantes y sobrantes al cerrar un turno de caja.', group: 'purchases', allowedTypes: ['EXPENSE', 'COST', 'REVENUE'] },
  { key: 'GASTOS_FINANCIEROS', label: 'Gastos bancarios y financieros', description: 'Comisiones, mantención de cuenta e intereses registrados desde la conciliación bancaria.', group: 'money', allowedTypes: ['EXPENSE', 'COST'] },
  { key: 'OTROS_INGRESOS', label: 'Otros ingresos', description: 'Abonos del banco que no son ventas (intereses ganados, reintegros), registrados desde la conciliación.', group: 'money', allowedTypes: ['REVENUE'] },

  { key: 'IVA_DEBITO', label: 'IVA débito fiscal', description: 'IVA de tus ventas.', group: 'taxes', allowedTypes: ['LIABILITY'] },
  { key: 'IVA_CREDITO', label: 'IVA crédito fiscal', description: 'IVA de tus compras.', group: 'taxes', allowedTypes: ['ASSET'] },
  { key: 'IVA_POR_PAGAR', label: 'IVA por pagar', description: 'Saldo de IVA a enterar en el F29.', group: 'taxes', allowedTypes: ['LIABILITY'] },
  { key: 'PPM_POR_RECUPERAR', label: 'PPM por recuperar', description: 'Pagos provisionales mensuales.', group: 'taxes', allowedTypes: ['ASSET'] },
  { key: 'RETENCION_HONORARIOS', label: 'Retención de honorarios', description: 'Retención de boletas de honorarios por enterar en el F29.', group: 'taxes', allowedTypes: ['LIABILITY'] },
  { key: 'IMPUESTO_UNICO_POR_PAGAR', label: 'Impuesto único por pagar', description: 'Impuesto único retenido a trabajadores, se paga en el F29.', group: 'taxes', allowedTypes: ['LIABILITY'] },

  { key: 'REMUNERACIONES_GASTO', label: 'Remuneraciones (gasto)', description: 'Total de haberes del mes al cerrar remuneraciones.', group: 'people', allowedTypes: ['EXPENSE', 'COST'] },
  { key: 'APORTES_PATRONALES', label: 'Aportes patronales', description: 'SIS, seguro de cesantía del empleador, mutual y aporte del empleador.', group: 'people', allowedTypes: ['EXPENSE', 'COST'] },
  { key: 'REMUNERACIONES_POR_PAGAR', label: 'Remuneraciones por pagar', description: 'Líquidos del mes hasta que se pagan.', group: 'people', allowedTypes: ['LIABILITY'] },
  { key: 'COTIZACIONES_POR_PAGAR', label: 'Cotizaciones por pagar', description: 'Planilla Previred del mes hasta que se paga.', group: 'people', allowedTypes: ['LIABILITY'] },
  { key: 'ANTICIPOS_PERSONAL', label: 'Anticipos al personal', description: 'Anticipos de sueldo entregados, se descuentan en la liquidación.', group: 'people', allowedTypes: ['ASSET'] },
  { key: 'DESCUENTOS_PERSONAL', label: 'Descuentos al personal por enterar', description: 'Otros descuentos retenidos en la liquidación.', group: 'people', allowedTypes: ['LIABILITY'] },
  { key: 'HONORARIOS_GASTO', label: 'Honorarios (gasto)', description: 'Monto bruto de las boletas de honorarios recibidas.', group: 'people', allowedTypes: ['EXPENSE', 'COST'] },
  { key: 'HONORARIOS_POR_PAGAR', label: 'Honorarios por pagar', description: 'Líquido de las boletas hasta que se pagan.', group: 'people', allowedTypes: ['LIABILITY'] },
  { key: 'GASTOS_RENDIDOS', label: 'Gastos rendidos', description: 'Gastos aprobados en rendiciones del personal.', group: 'people', allowedTypes: ['EXPENSE', 'COST'] },
  { key: 'RENDICIONES_POR_PAGAR', label: 'Rendiciones por pagar', description: 'Lo aprobado hasta que se reembolsa.', group: 'people', allowedTypes: ['LIABILITY'] },

  {
    key: 'COBROS_POR_DOCUMENTAR',
    label: 'Cobros por documentar',
    description:
      'Cuotas, entradas, votos, auspicios y pagarés cobrados sin boleta o factura. Por defecto es un pasivo transitorio; si tu contador lo decide, puede apuntar a una cuenta de ingresos.',
    group: 'events',
    allowedTypes: ['LIABILITY', 'REVENUE'],
  },

  { key: 'RESULTADOS_ACUMULADOS', label: 'Resultados acumulados', description: 'Destino del resultado al cierre anual.', group: 'results', allowedTypes: ['EQUITY'] },
  { key: 'RESULTADO_EJERCICIO', label: 'Resultado del ejercicio', description: 'Resultado del año en curso.', group: 'results', allowedTypes: ['EQUITY'] },
];

export function mappingDefinition(key: string): MappingDefinition | undefined {
  return MAPPING_DEFINITIONS.find((definition) => definition.key === key);
}
