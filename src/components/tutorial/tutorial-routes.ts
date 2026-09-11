/**
 * Mapea la ruta actual del dashboard a la clave de módulo que usa el tutorial
 * (`TUTORIAL_CONTENT` en `tutorial-content.ts`). Vive separado del contenido
 * para que ambos archivos se puedan leer/editar sin pisarse.
 *
 * `/dashboard` es un caso especial: como es prefijo de TODAS las demás rutas,
 * solo hace match exacto (ver `getModuleKeyForPath`) — si compitiera como
 * prefijo normal, "ganaría" siempre por longitud más corta nunca, pero
 * bloquearía la intención de tener un tutorial de bienvenida propio y
 * distinto del resto.
 */
const HOME_PATH = '/dashboard';

const TUTORIAL_ROUTES: readonly (readonly [string, string])[] = [
  ['/dashboard/settings/company', 'settings-company'],
  ['/dashboard/settings/users', 'settings-users'],
  ['/dashboard/settings/roles', 'roles'],
  ['/dashboard/settings/folios', 'dte'],
  ['/dashboard/settings/automations', 'automation'],
  ['/dashboard/settings/import', 'import'],
  ['/dashboard/settings/security', 'security'],
  ['/dashboard/settings/sessions', 'security'],
  ['/dashboard/settings/audit', 'audit'],
  ['/dashboard/pos', 'pos'],
  ['/dashboard/products', 'products'],
  ['/dashboard/inventory', 'inventory'],
  ['/dashboard/sales', 'sales'],
  ['/dashboard/contacts', 'contacts'],
  ['/dashboard/purchases', 'purchases'],
  ['/dashboard/treasury', 'treasury'],
  ['/dashboard/reports', 'reports'],
  ['/dashboard/budgets', 'budgets'],
  ['/dashboard/financial-statements', 'accounting'],
  ['/dashboard/promissory-notes', 'promissory-notes'],
  ['/dashboard/payment-plans', 'payment-plans'],
  ['/dashboard/fees', 'fees'],
  ['/dashboard/projects', 'projects'],
  ['/dashboard/calendar', 'calendar'],
  ['/dashboard/org-chart', 'org-chart'],
  ['/dashboard/candidates', 'candidates'],
  ['/dashboard/judging', 'judging'],
  ['/dashboard/production', 'production'],
  ['/dashboard/sponsorships', 'sponsorships'],
  ['/dashboard/ticketing', 'ticketing'],
  ['/dashboard/voting', 'public-voting'],
  ['/dashboard/agents', 'agents'],
  ['/dashboard/messaging', 'messaging'],
];

/**
 * Devuelve la clave de módulo para una ruta, o `null` si no hay tutorial
 * registrado (ej. `/dashboard/settings` índice, `/dashboard/settings/profile`,
 * `/dashboard/manual`). Se queda con el prefijo MÁS LARGO que matchea, no el
 * primero de la lista — así `/dashboard/settings/company` no cae en un futuro
 * prefijo genérico `/dashboard/settings` si alguna vez se agrega uno.
 */
export function getModuleKeyForPath(pathname: string): string | null {
  if (pathname === HOME_PATH) return 'dashboard';

  let bestPrefix = '';
  let bestKey: string | null = null;
  for (const [prefix, key] of TUTORIAL_ROUTES) {
    if (pathname.startsWith(prefix) && prefix.length > bestPrefix.length) {
      bestPrefix = prefix;
      bestKey = key;
    }
  }
  return bestKey;
}
