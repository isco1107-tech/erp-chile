import type { CompanyFeatureFlags } from '@/lib/auth/modules';
import type { Permission } from '@/lib/auth/permissions';

/**
 * Quién puede bajar qué en «Exportar datos». Una sola regla para el menú, la
 * pantalla y las rutas de descarga, para que nunca se desfasen.
 *
 * - Boletas y documentos de venta: Facturación (`sales:read`) o, en una empresa
 *   que solo tiene Punto de Venta, quien consulta y cierra los turnos
 *   (`pos:close`): las boletas del mostrador existen aunque no haya Ventas.
 * - Movimientos de inventario: Inventario (`products:read`). El costo solo se
 *   incluye con `products:costs`.
 */
export interface ExportAccess {
  sales: boolean;
  movements: boolean;
  /** Costos de los movimientos (solo con `products:costs`). */
  costs: boolean;
  /** El libro completo de Reportes Excel, para enlazarlo como alternativa. */
  fullReport: boolean;
}

export function exportAccess({ permissions, features }: { permissions: readonly Permission[]; features: CompanyFeatureFlags }): ExportAccess {
  const has = (permission: Permission) => permissions.includes(permission);
  const movements = features.hasInventory && has('products:read');
  return {
    sales: (features.hasDteBilling && has('sales:read')) || (features.hasPos && has('pos:close')),
    movements,
    costs: movements && has('products:costs'),
    fullReport: features.hasAdvancedReports && has('reports:read'),
  };
}

export function canOpenExports(access: ExportAccess): boolean {
  return access.sales || access.movements;
}
