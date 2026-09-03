import type { AccountNature, AccountType, CashFlowCategory, CostBehavior, IndustryType } from '@prisma/client';
import type { TxClient } from './services/journal.service';

/**
 * Plan de cuentas base para pyme chilena (PROMPT_ERP_V2.md, Fase B.4).
 *
 * Es un punto de partida editable por la empresa, no un estándar cerrado: los
 * campos de clasificación (`costBehavior`, `cashFlowCategory`, `isCurrent`)
 * llevan valores razonables por defecto, pensados para que el punto de
 * equilibrio y el flujo de efectivo tengan algo sensato que mostrar desde el
 * primer día, no una verdad contable definitiva.
 */

export interface ChartAccountSeed {
  code: string;
  name: string;
  parentCode: string | null;
  type: AccountType;
  nature: AccountNature;
  isPostable: boolean;
  isCurrent: boolean | null;
  costBehavior: CostBehavior;
  cashFlowCategory: CashFlowCategory;
  /** Clave de `AccountMapping` que el motor de asientos va a resolver, si aplica. */
  mappingKey?: string;
}

export const CHART_OF_ACCOUNTS: ChartAccountSeed[] = [
  // ACTIVO
  { code: '1', name: 'Activo', parentCode: null, type: 'ASSET', nature: 'DEBIT', isPostable: false, isCurrent: null, costBehavior: 'NONE', cashFlowCategory: 'NONE' },
  { code: '11', name: 'Activo Corriente', parentCode: '1', type: 'ASSET', nature: 'DEBIT', isPostable: false, isCurrent: true, costBehavior: 'NONE', cashFlowCategory: 'NONE' },
  { code: '1101', name: 'Caja', parentCode: '11', type: 'ASSET', nature: 'DEBIT', isPostable: true, isCurrent: true, costBehavior: 'NONE', cashFlowCategory: 'NONE', mappingKey: 'CAJA' },
  { code: '1102', name: 'Banco', parentCode: '11', type: 'ASSET', nature: 'DEBIT', isPostable: true, isCurrent: true, costBehavior: 'NONE', cashFlowCategory: 'NONE', mappingKey: 'BANCO' },
  { code: '1103', name: 'Clientes', parentCode: '11', type: 'ASSET', nature: 'DEBIT', isPostable: true, isCurrent: true, costBehavior: 'NONE', cashFlowCategory: 'OPERATING', mappingKey: 'CLIENTES' },
  { code: '1104', name: 'Documentos por cobrar', parentCode: '11', type: 'ASSET', nature: 'DEBIT', isPostable: true, isCurrent: true, costBehavior: 'NONE', cashFlowCategory: 'OPERATING' },
  { code: '1105', name: 'IVA Crédito Fiscal', parentCode: '11', type: 'ASSET', nature: 'DEBIT', isPostable: true, isCurrent: true, costBehavior: 'NONE', cashFlowCategory: 'OPERATING', mappingKey: 'IVA_CREDITO' },
  { code: '1106', name: 'PPM por recuperar', parentCode: '11', type: 'ASSET', nature: 'DEBIT', isPostable: true, isCurrent: true, costBehavior: 'NONE', cashFlowCategory: 'OPERATING', mappingKey: 'PPM_POR_RECUPERAR' },
  { code: '1107', name: 'Existencias', parentCode: '11', type: 'ASSET', nature: 'DEBIT', isPostable: true, isCurrent: true, costBehavior: 'NONE', cashFlowCategory: 'OPERATING', mappingKey: 'EXISTENCIAS' },
  { code: '1108', name: 'Anticipos a proveedores', parentCode: '11', type: 'ASSET', nature: 'DEBIT', isPostable: true, isCurrent: true, costBehavior: 'NONE', cashFlowCategory: 'OPERATING' },
  { code: '12', name: 'Activo No Corriente', parentCode: '1', type: 'ASSET', nature: 'DEBIT', isPostable: false, isCurrent: false, costBehavior: 'NONE', cashFlowCategory: 'NONE' },
  { code: '1201', name: 'Activo fijo', parentCode: '12', type: 'ASSET', nature: 'DEBIT', isPostable: true, isCurrent: false, costBehavior: 'NONE', cashFlowCategory: 'INVESTING' },
  // Contra-activo: aunque vive bajo ACTIVO, su saldo normal es acreedor.
  { code: '1202', name: 'Depreciación acumulada', parentCode: '12', type: 'ASSET', nature: 'CREDIT', isPostable: true, isCurrent: false, costBehavior: 'NONE', cashFlowCategory: 'OPERATING' },
  { code: '1203', name: 'Intangibles', parentCode: '12', type: 'ASSET', nature: 'DEBIT', isPostable: true, isCurrent: false, costBehavior: 'NONE', cashFlowCategory: 'INVESTING' },

  // PASIVO
  { code: '2', name: 'Pasivo', parentCode: null, type: 'LIABILITY', nature: 'CREDIT', isPostable: false, isCurrent: null, costBehavior: 'NONE', cashFlowCategory: 'NONE' },
  { code: '21', name: 'Pasivo Corriente', parentCode: '2', type: 'LIABILITY', nature: 'CREDIT', isPostable: false, isCurrent: true, costBehavior: 'NONE', cashFlowCategory: 'NONE' },
  { code: '2101', name: 'Proveedores', parentCode: '21', type: 'LIABILITY', nature: 'CREDIT', isPostable: true, isCurrent: true, costBehavior: 'NONE', cashFlowCategory: 'OPERATING', mappingKey: 'PROVEEDORES' },
  { code: '2102', name: 'Documentos por pagar', parentCode: '21', type: 'LIABILITY', nature: 'CREDIT', isPostable: true, isCurrent: true, costBehavior: 'NONE', cashFlowCategory: 'OPERATING' },
  { code: '2103', name: 'IVA Débito Fiscal', parentCode: '21', type: 'LIABILITY', nature: 'CREDIT', isPostable: true, isCurrent: true, costBehavior: 'NONE', cashFlowCategory: 'OPERATING', mappingKey: 'IVA_DEBITO' },
  { code: '2104', name: 'IVA por pagar', parentCode: '21', type: 'LIABILITY', nature: 'CREDIT', isPostable: true, isCurrent: true, costBehavior: 'NONE', cashFlowCategory: 'OPERATING', mappingKey: 'IVA_POR_PAGAR' },
  { code: '2105', name: 'PPM por pagar', parentCode: '21', type: 'LIABILITY', nature: 'CREDIT', isPostable: true, isCurrent: true, costBehavior: 'NONE', cashFlowCategory: 'OPERATING' },
  { code: '2106', name: 'Retenciones por pagar', parentCode: '21', type: 'LIABILITY', nature: 'CREDIT', isPostable: true, isCurrent: true, costBehavior: 'NONE', cashFlowCategory: 'OPERATING', mappingKey: 'RETENCION_HONORARIOS' },
  { code: '2107', name: 'Remuneraciones por pagar', parentCode: '21', type: 'LIABILITY', nature: 'CREDIT', isPostable: true, isCurrent: true, costBehavior: 'NONE', cashFlowCategory: 'OPERATING' },
  { code: '2108', name: 'Provisiones', parentCode: '21', type: 'LIABILITY', nature: 'CREDIT', isPostable: true, isCurrent: true, costBehavior: 'NONE', cashFlowCategory: 'OPERATING' },
  { code: '2109', name: 'Obligaciones financieras c/p', parentCode: '21', type: 'LIABILITY', nature: 'CREDIT', isPostable: true, isCurrent: true, costBehavior: 'NONE', cashFlowCategory: 'FINANCING' },
  { code: '22', name: 'Pasivo No Corriente', parentCode: '2', type: 'LIABILITY', nature: 'CREDIT', isPostable: false, isCurrent: false, costBehavior: 'NONE', cashFlowCategory: 'NONE' },
  { code: '2201', name: 'Obligaciones financieras l/p', parentCode: '22', type: 'LIABILITY', nature: 'CREDIT', isPostable: true, isCurrent: false, costBehavior: 'NONE', cashFlowCategory: 'FINANCING' },

  // PATRIMONIO
  { code: '3', name: 'Patrimonio', parentCode: null, type: 'EQUITY', nature: 'CREDIT', isPostable: false, isCurrent: null, costBehavior: 'NONE', cashFlowCategory: 'NONE' },
  { code: '3101', name: 'Capital', parentCode: '3', type: 'EQUITY', nature: 'CREDIT', isPostable: true, isCurrent: null, costBehavior: 'NONE', cashFlowCategory: 'FINANCING' },
  { code: '3102', name: 'Resultados acumulados', parentCode: '3', type: 'EQUITY', nature: 'CREDIT', isPostable: true, isCurrent: null, costBehavior: 'NONE', cashFlowCategory: 'NONE', mappingKey: 'RESULTADOS_ACUMULADOS' },
  { code: '3103', name: 'Resultado del ejercicio', parentCode: '3', type: 'EQUITY', nature: 'CREDIT', isPostable: true, isCurrent: null, costBehavior: 'NONE', cashFlowCategory: 'NONE', mappingKey: 'RESULTADO_EJERCICIO' },

  // INGRESOS
  { code: '4', name: 'Ingresos', parentCode: null, type: 'REVENUE', nature: 'CREDIT', isPostable: false, isCurrent: null, costBehavior: 'NONE', cashFlowCategory: 'NONE' },
  { code: '4101', name: 'Ventas afectas', parentCode: '4', type: 'REVENUE', nature: 'CREDIT', isPostable: true, isCurrent: null, costBehavior: 'VARIABLE', cashFlowCategory: 'NONE', mappingKey: 'VENTAS_AFECTAS' },
  { code: '4102', name: 'Ventas exentas', parentCode: '4', type: 'REVENUE', nature: 'CREDIT', isPostable: true, isCurrent: null, costBehavior: 'VARIABLE', cashFlowCategory: 'NONE', mappingKey: 'VENTAS_EXENTAS' },
  { code: '4103', name: 'Otros ingresos', parentCode: '4', type: 'REVENUE', nature: 'CREDIT', isPostable: true, isCurrent: null, costBehavior: 'NONE', cashFlowCategory: 'NONE' },
  // Contra-ingreso: reduce ventas, saldo normal deudor.
  { code: '4104', name: 'Devoluciones y descuentos', parentCode: '4', type: 'REVENUE', nature: 'DEBIT', isPostable: true, isCurrent: null, costBehavior: 'NONE', cashFlowCategory: 'NONE' },

  // COSTOS
  { code: '5', name: 'Costos', parentCode: null, type: 'COST', nature: 'DEBIT', isPostable: false, isCurrent: null, costBehavior: 'NONE', cashFlowCategory: 'NONE' },
  { code: '5101', name: 'Costo de ventas', parentCode: '5', type: 'COST', nature: 'DEBIT', isPostable: true, isCurrent: null, costBehavior: 'VARIABLE', cashFlowCategory: 'NONE', mappingKey: 'COSTO_VENTAS' },
  { code: '5102', name: 'Diferencias de inventario', parentCode: '5', type: 'COST', nature: 'DEBIT', isPostable: true, isCurrent: null, costBehavior: 'NONE', cashFlowCategory: 'NONE', mappingKey: 'DIFERENCIA_INVENTARIO' },

  // GASTOS
  { code: '6', name: 'Gastos', parentCode: null, type: 'EXPENSE', nature: 'DEBIT', isPostable: false, isCurrent: null, costBehavior: 'NONE', cashFlowCategory: 'NONE' },
  { code: '6101', name: 'Remuneraciones', parentCode: '6', type: 'EXPENSE', nature: 'DEBIT', isPostable: true, isCurrent: null, costBehavior: 'FIXED', cashFlowCategory: 'NONE' },
  { code: '6102', name: 'Arriendos', parentCode: '6', type: 'EXPENSE', nature: 'DEBIT', isPostable: true, isCurrent: null, costBehavior: 'FIXED', cashFlowCategory: 'NONE' },
  { code: '6103', name: 'Servicios básicos', parentCode: '6', type: 'EXPENSE', nature: 'DEBIT', isPostable: true, isCurrent: null, costBehavior: 'VARIABLE', cashFlowCategory: 'NONE' },
  { code: '6104', name: 'Gastos financieros', parentCode: '6', type: 'EXPENSE', nature: 'DEBIT', isPostable: true, isCurrent: null, costBehavior: 'NONE', cashFlowCategory: 'FINANCING' },
  { code: '6105', name: 'Depreciación del ejercicio', parentCode: '6', type: 'EXPENSE', nature: 'DEBIT', isPostable: true, isCurrent: null, costBehavior: 'FIXED', cashFlowCategory: 'OPERATING' },
  { code: '6106', name: 'Otros gastos operacionales', parentCode: '6', type: 'EXPENSE', nature: 'DEBIT', isPostable: true, isCurrent: null, costBehavior: 'FIXED', cashFlowCategory: 'NONE', mappingKey: 'GASTOS_OPERACIONALES' },
  // Diferencias de caja al cierre de turno (Fase C.1/G.3): solo el descuadre
  // se contabiliza acá, nunca el total vendido — cada boleta ya postea su
  // propio asiento contra VENTAS_AFECTAS/IVA_DEBITO al emitirse.
  { code: '6107', name: 'Diferencias de caja', parentCode: '6', type: 'EXPENSE', nature: 'DEBIT', isPostable: true, isCurrent: null, costBehavior: 'NONE', cashFlowCategory: 'OPERATING', mappingKey: 'DIFERENCIA_CAJA' },
];

/** Cuentas que una empresa de Servicios no necesita activas por defecto: no manejan inventario. */
const SERVICES_INACTIVE_CODES = new Set(['1107', '5101']);

/**
 * Siembra el plan de cuentas y sus mapeos semánticos para una empresa. Es
 * idempotente por `(companyId, code)`: correrlo dos veces no duplica cuentas.
 *
 * Son ~50 escrituras secuenciales (28 cuentas + mapeos). Contra Neon, con la
 * latencia de red de cada una, el `$transaction` que envuelva esta llamada
 * DEBE usar `BATCH_TX_OPTIONS` de `src/lib/prisma-tx.ts` — con los defaults
 * de Prisma (timeout 5s) la transacción expira a mitad de la siembra.
 */
export async function seedChartOfAccounts(tx: TxClient, companyId: string, industryType: IndustryType): Promise<void> {
  const idByCode = new Map<string, string>();

  // Se crea en el orden del arreglo, que ya lista cada padre antes que sus
  // hijos: la FK `parentId` lo exige.
  for (const seed of CHART_OF_ACCOUNTS) {
    const parentId = seed.parentCode ? idByCode.get(seed.parentCode) : null;
    if (seed.parentCode && !parentId) {
      throw new Error(`Cuenta padre ${seed.parentCode} no sembrada todavía (orden inválido en CHART_OF_ACCOUNTS)`);
    }

    const isActive = industryType === 'SERVICES' ? !SERVICES_INACTIVE_CODES.has(seed.code) : true;

    const account = await tx.account.upsert({
      where: { companyId_code: { companyId, code: seed.code } },
      update: {},
      create: {
        companyId,
        code: seed.code,
        name: seed.name,
        parentId,
        type: seed.type,
        nature: seed.nature,
        isPostable: seed.isPostable,
        isCurrent: seed.isCurrent,
        costBehavior: seed.costBehavior,
        cashFlowCategory: seed.cashFlowCategory,
        isActive,
      },
    });
    idByCode.set(seed.code, account.id);

    if (seed.mappingKey) {
      await tx.accountMapping.upsert({
        where: { companyId_key: { companyId, key: seed.mappingKey } },
        update: { accountId: account.id },
        create: { companyId, key: seed.mappingKey, accountId: account.id },
      });
    }
  }
}
