import type { FunctionDeclaration } from '@google/genai';

import type { Permission } from '@/lib/auth/permissions';

/**
 * Consultas a los datos reales de la empresa que puede hacer el Asistente
 * (antes vivían en un "Copiloto Financiero" aparte). Cada una se ofrece al
 * modelo solo si el usuario tiene el permiso que la cubre; los permisos de la
 * sesión ya vienen cruzados con los módulos contratados (`getAuthContext`),
 * así que una empresa sin Tesorería nunca ve la consulta de morosos, y una sin
 * Compras no ve la de IVA. Sin I/O: los ejecutores viven en `copilot-tools.ts`.
 */

export type DataToolName = 'getSalesMarginSummary' | 'getOverdueBalances' | 'getVatProjection';

interface DataToolDefinition {
  /** Todos estos permisos son necesarios para ofrecer la consulta. */
  requires: Permission[];
  /** Para el prompt: qué puede responder con ella. */
  summary: string;
  declaration: FunctionDeclaration;
}

export const DATA_TOOLS: Record<DataToolName, DataToolDefinition> = {
  getSalesMarginSummary: {
    requires: ['sales:read'],
    summary: 'ventas netas y exentas (y margen, si puede ver costos) en un rango de fechas',
    declaration: {
      name: 'getSalesMarginSummary',
      description: 'Resumen de ventas netas y exentas, cantidad de documentos y margen bruto (PMP) en un rango de fechas arbitrario.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Fecha inicial, formato ISO YYYY-MM-DD' },
          to: { type: 'string', description: 'Fecha final, formato ISO YYYY-MM-DD' },
        },
        required: ['from', 'to'],
      },
    },
  },
  getOverdueBalances: {
    requires: ['treasury:read'],
    summary: 'saldos vencidos por cobrar y por pagar, con los principales clientes y proveedores morosos',
    declaration: {
      name: 'getOverdueBalances',
      description: 'Saldos por cobrar y por pagar vencidos hace más de N días, con el detalle de los principales clientes y proveedores morosos.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          minDaysOverdue: { type: 'number', description: 'Días mínimos de mora a considerar (0 = cualquier documento vencido)' },
        },
      },
    },
  },
  getVatProjection: {
    requires: ['sales:read', 'purchases:read'],
    summary: 'IVA débito vs. crédito fiscal acumulado de un mes',
    declaration: {
      name: 'getVatProjection',
      description: 'Proyección de IVA débito vs. crédito fiscal acumulado en un mes calendario.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          year: { type: 'number', description: 'Año, ej. 2026' },
          month: { type: 'number', description: 'Mes de 1 a 12' },
        },
      },
    },
  },
};

/** Consultas de datos que este usuario puede usar, en orden estable. */
export function availableDataTools(permissions: readonly Permission[]): DataToolName[] {
  const granted = new Set(permissions);
  return (Object.keys(DATA_TOOLS) as DataToolName[]).filter((name) => DATA_TOOLS[name].requires.every((permission) => granted.has(permission)));
}

/** El margen usa el costo PMP: solo se muestra a quien puede ver costos. */
export function canSeeMargins(permissions: readonly Permission[]): boolean {
  return permissions.includes('products:costs');
}
