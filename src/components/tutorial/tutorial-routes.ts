/**
 * Mapea la ruta actual del dashboard a la clave del tutorial
 * (`TUTORIAL_CONTENT` en `tutorial-content.ts`). Vive separado del contenido
 * para que ambos archivos se puedan leer/editar sin pisarse.
 *
 * Cada pantalla del menú tiene su propia entrada: una subpantalla que caía en
 * el prefijo de su módulo mostraba el tutorial de OTRA pantalla (la escaleta
 * mostraba el de Acreditaciones; Bancos, el de Cuentas por Cobrar). La
 * prueba `tests/manual-coverage.test.ts` exige que cada ítem del menú
 * resuelva a un tutorial existente.
 *
 * `/dashboard` es un caso especial: como es prefijo de TODAS las demás rutas,
 * solo hace match exacto (ver `getModuleKeyForPath`).
 */
const HOME_PATH = '/dashboard';

const TUTORIAL_ROUTES: readonly (readonly [string, string])[] = [
  ['/dashboard/settings', 'settings'],
  ['/dashboard/settings/company', 'settings-company'],
  ['/dashboard/settings/modules', 'settings-modules'],
  ['/dashboard/settings/plans', 'settings-plans'],
  ['/dashboard/settings/users', 'settings-users'],
  ['/dashboard/settings/roles', 'roles'],
  ['/dashboard/settings/folios', 'dte'],
  ['/dashboard/settings/automations', 'automation'],
  ['/dashboard/settings/import', 'import'],
  ['/dashboard/settings/security', 'security'],
  ['/dashboard/settings/sessions', 'security'],
  ['/dashboard/settings/profile', 'profile'],
  ['/dashboard/settings/audit', 'audit'],
  ['/dashboard/manual', 'manual'],
  ['/dashboard/pos', 'pos'],
  ['/dashboard/messaging', 'messaging'],
  ['/dashboard/intelligence', 'intelligence'],
  ['/dashboard/intelligence/cash-forecast', 'intelligence-cash'],
  ['/dashboard/intelligence/flows', 'intelligence-flows'],
  ['/dashboard/agents', 'agents'],
  ['/dashboard/products', 'products'],
  ['/dashboard/inventory', 'inventory'],
  ['/dashboard/inventory/counts', 'inventory-counts'],
  ['/dashboard/inventory/lots', 'inventory-lots'],
  ['/dashboard/inventory/labels', 'inventory-labels'],
  ['/dashboard/crm', 'crm'],
  ['/dashboard/crm/list', 'crm-list'],
  ['/dashboard/crm/tasks', 'crm-tasks'],
  ['/dashboard/crm/people', 'crm-people'],
  ['/dashboard/crm/reports', 'crm-reports'],
  ['/dashboard/sales', 'sales'],
  ['/dashboard/sales/new', 'sales-new'],
  ['/dashboard/sales/orders', 'sales-orders'],
  ['/dashboard/sales/price-lists', 'price-lists'],
  ['/dashboard/sales/commissions', 'sales-commissions'],
  ['/dashboard/contacts', 'contacts'],
  ['/dashboard/customer-care', 'customer-care'],
  ['/dashboard/invoice-archive', 'invoice-archive'],
  ['/dashboard/purchases', 'purchases'],
  ['/dashboard/purchases/orders', 'purchase-orders'],
  ['/dashboard/purchases/imports', 'purchases-imports'],
  ['/dashboard/purchases/inbox', 'purchases-inbox'],
  ['/dashboard/purchase-requests', 'purchase-requests'],
  ['/dashboard/manufacturing', 'manufacturing'],
  ['/dashboard/manufacturing/boms', 'manufacturing-boms'],
  ['/dashboard/service', 'service-desk'],
  ['/dashboard/quality', 'quality'],
  ['/dashboard/tasks', 'tasks'],
  ['/dashboard/academy', 'academy'],
  ['/dashboard/web-sites', 'web-sites'],
  ['/dashboard/treasury', 'treasury'],
  ['/dashboard/treasury/cxc', 'treasury-cxc'],
  ['/dashboard/treasury/cxp', 'treasury-cxp'],
  ['/dashboard/treasury/cashflow', 'treasury-cashflow'],
  ['/dashboard/treasury/collections', 'treasury-collections'],
  ['/dashboard/treasury/banks', 'treasury-banks'],
  ['/dashboard/treasury/cheques', 'treasury-cheques'],
  ['/dashboard/treasury/payment-batches', 'treasury-payment-batches'],
  ['/dashboard/reports', 'reports'],
  ['/dashboard/reports/f29', 'reports-f29'],
  ['/dashboard/reports/rcv', 'reports-rcv'],
  ['/dashboard/budgets', 'budgets'],
  ['/dashboard/expenses', 'expenses'],
  ['/dashboard/fixed-assets', 'fixed-assets'],
  ['/dashboard/promissory-notes', 'promissory-notes'],
  ['/dashboard/payment-plans', 'payment-plans'],
  ['/dashboard/fees', 'fees'],
  ['/dashboard/financial-statements', 'financial-statements'],
  ['/dashboard/accounting', 'accounting-books'],
  ['/dashboard/accounting/journal', 'accounting-books'],
  ['/dashboard/accounting/ledger', 'accounting-books'],
  ['/dashboard/accounting/trial-balance', 'accounting-books'],
  ['/dashboard/accounting/reconciliation', 'accounting-books'],
  ['/dashboard/hr', 'hr-employees'],
  ['/dashboard/hr/payroll', 'hr-payroll'],
  ['/dashboard/hr/leave', 'hr-leave'],
  ['/dashboard/org-chart', 'org-chart'],
  ['/dashboard/projects', 'projects'],
  ['/dashboard/calendar', 'calendar'],
  ['/dashboard/candidates', 'candidates'],
  ['/dashboard/candidates/casting', 'candidates-casting'],
  ['/dashboard/candidates/attendance', 'candidates-attendance'],
  ['/dashboard/candidates/compliance', 'candidates-compliance'],
  ['/dashboard/candidates/template', 'candidates-template'],
  ['/dashboard/contracts', 'contracts'],
  ['/dashboard/sponsorships', 'sponsorships'],
  ['/dashboard/sponsorships/packages', 'sponsorships-packages'],
  ['/dashboard/sponsorships/compliance', 'sponsorships-compliance'],
  ['/dashboard/sponsorships/template', 'sponsorships-template'],
  ['/dashboard/production/timeline', 'production-timeline'],
  ['/dashboard/production/wardrobe', 'production-wardrobe'],
  ['/dashboard/production/accreditation', 'production-accreditation'],
  ['/dashboard/judging', 'judging'],
  ['/dashboard/ticketing', 'ticketing'],
  ['/dashboard/voting', 'public-voting'],
];

/**
 * Devuelve la clave del tutorial para una ruta, o `null` si no hay uno
 * registrado. Se queda con el prefijo MÁS LARGO que matchea (con límite de
 * segmento: `/dashboard/salesx` no es `/dashboard/sales`), no el primero de
 * la lista.
 */
export function getModuleKeyForPath(pathname: string): string | null {
  if (pathname === HOME_PATH) return 'dashboard';

  let bestPrefix = '';
  let bestKey: string | null = null;
  for (const [prefix, key] of TUTORIAL_ROUTES) {
    const matches = pathname === prefix || pathname.startsWith(`${prefix}/`);
    if (matches && prefix.length > bestPrefix.length) {
      bestPrefix = prefix;
      bestKey = key;
    }
  }
  return bestKey;
}

/** Todas las rutas con tutorial (para la prueba de cobertura). */
export function tutorialRoutes(): readonly (readonly [string, string])[] {
  return TUTORIAL_ROUTES;
}
