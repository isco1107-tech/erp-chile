import type { Permission } from '@/lib/auth/permissions';
import type { CompanyFeatureFlags } from '@/lib/auth/modules';

/**
 * Registro único de navegación del panel. Lo consumen la barra lateral
 * (`src/app/(dashboard)/layout.tsx`) y la paleta de comandos
 * (`CommandMenu`): antes cada uno tenía su propia lista, y la paleta se había
 * quedado sin una decena de módulos que sí aparecían en la barra.
 *
 * Es una función pura sin dependencias de servidor, para poder llamarla desde
 * un Server Component y desde un Client Component con el mismo resultado.
 * Filtrar aquí es solo presentación: cada página y cada Server Action vuelve a
 * exigir su permiso en el servidor.
 */

export type NavIconKey =
  | 'home'
  | 'pos'
  | 'sales'
  | 'purchases'
  | 'products'
  | 'inventory'
  | 'contacts'
  | 'cxc'
  | 'cxp'
  | 'cashflow'
  | 'reports'
  | 'settings'
  | 'platform'
  | 'agents'
  | 'projects'
  | 'calendar'
  | 'sponsorships'
  | 'fees'
  | 'candidates'
  | 'orgchart'
  | 'production'
  | 'timeline'
  | 'wardrobe'
  | 'judging'
  | 'accounting'
  | 'journal'
  | 'ledger'
  | 'trialBalance'
  | 'reconciliation'
  | 'budgets'
  | 'promissoryNotes'
  | 'paymentPlans'
  | 'ticketing'
  | 'voting'
  | 'help'
  | 'messaging';

export interface NavLink {
  href: string;
  label: string;
  icon: NavIconKey;
  /** Solo `/dashboard` necesita match exacto; el resto se activa también en subrutas. */
  exact?: boolean;
  /** Sinónimos para la búsqueda de la paleta (sin tildes, en minúscula). */
  keywords?: string[];
}

export interface NavGroup {
  label: string;
  links: NavLink[];
  /** Colapsado por defecto (configuración ocasional). Se autoexpande si la ruta activa cae adentro. */
  collapsedByDefault?: boolean;
}

export interface NavAccess {
  permissions: readonly Permission[];
  features: CompanyFeatureFlags;
  isSuperAdmin: boolean;
}

/** Todo permiso que habilita alguna sección de /dashboard/settings. */
const SETTINGS_PERMISSIONS: Permission[] = [
  'settings:company',
  'settings:users',
  'audit:read',
  'dte:manage_caf',
  'automation:manage',
  'import:data',
];

export function buildWorkspaceNav({ permissions, features, isSuperAdmin }: NavAccess): NavGroup[] {
  const allow = (permission: Permission) => permissions.includes(permission);
  const groups: NavGroup[] = [];
  const push = (label: string, links: NavLink[], collapsedByDefault?: boolean) => {
    if (links.length > 0) groups.push({ label, links, collapsedByDefault });
  };

  const principal: NavLink[] = [{ href: '/dashboard', label: 'Inicio', icon: 'home', exact: true, keywords: ['dashboard', 'panel', 'resumen'] }];
  if (features.hasPos && allow('pos:operate')) {
    principal.push({ href: '/dashboard/pos', label: 'Punto de Venta', icon: 'pos', keywords: ['pos', 'caja', 'boleta'] });
  }
  if (allow('messaging:use')) {
    principal.push({ href: '/dashboard/messaging', label: 'Mensajería', icon: 'messaging', keywords: ['chat', 'mensajes'] });
  }
  push('Principal', principal);

  if (features.hasInventory && allow('products:read')) {
    push('Inventario', [
      { href: '/dashboard/products', label: 'Catálogo de Productos', icon: 'products', keywords: ['productos', 'articulos', 'sku'] },
      { href: '/dashboard/inventory', label: 'Inventario', icon: 'inventory', keywords: ['stock', 'bodega', 'kardex', 'existencias'] },
    ]);
  }

  const ventas: NavLink[] = [];
  if (features.hasDteBilling && allow('sales:read')) {
    ventas.push({ href: '/dashboard/sales', label: 'Ventas & Facturación', icon: 'sales', keywords: ['factura', 'boleta', 'dte', 'cotizacion', 'nota de credito'] });
  }
  if (allow('contacts:read')) {
    ventas.push({ href: '/dashboard/contacts', label: 'Clientes & Proveedores', icon: 'contacts', keywords: ['contactos', 'rut', 'clientes', 'proveedores'] });
  }
  push('Ventas', ventas);

  if (features.hasPurchases && allow('purchases:read')) {
    push('Compras', [
      { href: '/dashboard/purchases', label: 'Compras', icon: 'purchases', keywords: ['factura de compra', 'proveedor'] },
      { href: '/dashboard/purchases/orders', label: 'Órdenes de Compra', icon: 'purchases', keywords: ['oc', 'orden'] },
    ]);
  }

  const finanzas: NavLink[] = [];
  if (features.hasTreasury && allow('treasury:read')) {
    finanzas.push(
      { href: '/dashboard/treasury/cxc', label: 'Cuentas por Cobrar', icon: 'cxc', keywords: ['cobranza', 'deudores', 'morosos'] },
      { href: '/dashboard/treasury/cxp', label: 'Cuentas por Pagar', icon: 'cxp', keywords: ['pagos', 'acreedores'] },
      { href: '/dashboard/treasury/cashflow', label: 'Flujo de Caja', icon: 'cashflow', keywords: ['caja', 'tesoreria'] }
    );
  }
  if (features.hasAdvancedReports && allow('reports:read')) {
    finanzas.push(
      { href: '/dashboard/reports', label: 'Reportes Excel', icon: 'reports', keywords: ['excel', 'libro de ventas', 'libro de compras', 'exportar'] },
      { href: '/dashboard/reports/f29', label: 'Formulario 29 (F29)', icon: 'reports', keywords: ['f29', 'iva', 'sii', 'ppm', 'impuestos'] }
    );
  }
  if (features.hasBudgets && allow('budgets:read')) {
    finanzas.push({ href: '/dashboard/budgets', label: 'Presupuestos', icon: 'budgets', keywords: ['propuesta'] });
  }
  if (features.hasPromissoryNotes && allow('promissorynotes:read')) {
    finanzas.push({ href: '/dashboard/promissory-notes', label: 'Pagarés', icon: 'promissoryNotes' });
  }
  if (features.hasInstallmentPlans && allow('paymentplans:read')) {
    finanzas.push({ href: '/dashboard/payment-plans', label: 'Cuotas & Mensualidades', icon: 'paymentPlans', keywords: ['cuotas', 'mensualidad'] });
  }
  push('Finanzas', finanzas);

  if (features.hasAccounting) {
    const contabilidad: NavLink[] = [];
    if (allow('reports:financial')) {
      contabilidad.push({ href: '/dashboard/financial-statements', label: 'Estados Financieros', icon: 'accounting', keywords: ['balance general', 'estado de resultados', 'eerr'] });
    }
    if (allow('accounting:view')) {
      contabilidad.push(
        { href: '/dashboard/accounting/journal', label: 'Libro Diario', icon: 'journal', keywords: ['asientos', 'comprobantes'] },
        { href: '/dashboard/accounting/ledger', label: 'Libro Mayor', icon: 'ledger', keywords: ['mayor', 'cuenta', 'movimientos'] },
        { href: '/dashboard/accounting/trial-balance', label: 'Balance de Comprobación', icon: 'trialBalance', keywords: ['8 columnas', 'balance tributario', 'sumas y saldos'] },
        { href: '/dashboard/accounting/reconciliation', label: 'Cuadraturas', icon: 'reconciliation', keywords: ['conciliacion', 'cuadrar', 'control'] }
      );
    }
    push('Contabilidad', contabilidad);
  }

  if (features.hasCrm && allow('agents:view')) {
    push('Inteligencia de Negocio', [{ href: '/dashboard/agents', label: 'Agentes', icon: 'agents', keywords: ['ia', 'ceo', 'cfo', 'asistente'] }]);
  }

  // Dos grupos a propósito: lo de uso diario separado de lo ocasional
  // (plantillas y tableros de cumplimiento), que arranca colapsado.
  const eventos: NavLink[] = [];
  const eventosConfig: NavLink[] = [];
  if (features.hasEventProjects && allow('projects:read')) {
    eventos.push(
      { href: '/dashboard/projects', label: 'Eventos & Proyectos', icon: 'projects', keywords: ['evento', 'certamen'] },
      { href: '/dashboard/calendar', label: 'Calendario', icon: 'calendar', keywords: ['google calendar', 'agenda'] }
    );
  }
  if (features.hasSponsorships && allow('sponsorships:read')) {
    eventos.push({ href: '/dashboard/sponsorships', label: 'Auspicios & Marcas', icon: 'sponsorships', keywords: ['sponsor', 'auspiciador'] });
    eventosConfig.push({ href: '/dashboard/sponsorships/compliance', label: 'Cumplimiento de Auspicios', icon: 'sponsorships' });
    if (allow('sponsorships:write')) {
      eventosConfig.push({ href: '/dashboard/sponsorships/template', label: 'Plantilla: Carta de Compromiso', icon: 'sponsorships' });
    }
  }
  if (features.hasFeeDocuments && allow('fees:read')) {
    eventos.push({ href: '/dashboard/fees', label: 'Boletas de Honorarios', icon: 'fees', keywords: ['honorarios', 'retencion'] });
  }
  if (features.hasCandidates && allow('candidates:read')) {
    eventos.push(
      { href: '/dashboard/candidates', label: 'Candidatas & Staff', icon: 'candidates', keywords: ['postulantes', 'participantes'] },
      { href: '/dashboard/candidates/attendance', label: 'Asistencia', icon: 'candidates' }
    );
    eventosConfig.push({ href: '/dashboard/candidates/compliance', label: 'Cumplimiento de Candidatas', icon: 'candidates' });
    if (allow('candidates:write')) {
      eventosConfig.push({ href: '/dashboard/candidates/template', label: 'Plantilla: Contrato de Imagen', icon: 'candidates' });
    }
  }
  if (features.hasLiveProduction && allow('production:read')) {
    eventos.push(
      { href: '/dashboard/production/timeline', label: 'Escaleta en Vivo', icon: 'timeline', keywords: ['escaleta', 'run of show', 'cronograma', 'show'] },
      { href: '/dashboard/production/wardrobe', label: 'Vestuario', icon: 'wardrobe', keywords: ['ropa', 'looks', 'cambios'] },
      { href: '/dashboard/production/accreditation', label: 'Acreditaciones', icon: 'production', keywords: ['credencial', 'qr', 'acceso'] }
    );
  }
  if (features.hasJudging && allow('judging:read')) {
    eventos.push({ href: '/dashboard/judging', label: 'Votación & Escrutinio', icon: 'judging', keywords: ['jurado', 'puntaje'] });
  }
  if (features.hasTicketing && allow('ticketing:read')) {
    eventos.push({ href: '/dashboard/ticketing', label: 'Venta de Entradas', icon: 'ticketing', keywords: ['tickets', 'entradas'] });
  }
  if (features.hasPublicVoting && allow('publicvoting:read')) {
    eventos.push({ href: '/dashboard/voting', label: 'Votación Pagada', icon: 'voting', keywords: ['votos', 'publico'] });
  }
  push('Producción de Eventos', eventos);
  push('Plantillas y Cumplimiento', eventosConfig, true);

  if (features.hasOrgChart && allow('orgchart:read')) {
    push('Equipo', [{ href: '/dashboard/org-chart', label: 'Organigrama', icon: 'orgchart', keywords: ['cargos', 'equipo'] }]);
  }

  // Manual: sin gate. Cualquier usuario debe poder consultar cómo usar lo que tiene.
  push('Ayuda', [{ href: '/dashboard/manual', label: 'Manual de Usuario', icon: 'help', keywords: ['ayuda', 'como usar', 'tutorial'] }]);

  if (SETTINGS_PERMISSIONS.some(allow)) {
    push('Configuración', [{ href: '/dashboard/settings', label: 'Configuración', icon: 'settings', keywords: ['empresa', 'usuarios', 'folios', 'caf', 'roles'] }]);
  }

  if (isSuperAdmin) {
    push('Plataforma', [{ href: '/superadmin', label: 'Panel SaaS', icon: 'platform' }]);
  }

  return groups;
}
