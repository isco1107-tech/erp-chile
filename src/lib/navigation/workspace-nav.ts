import { ALL_PERMISSIONS, type Permission } from '@/lib/auth/permissions';
import { MODULE_KEYS, type CompanyFeatureFlags } from '@/lib/auth/modules';

/**
 * Registro único de navegación del panel. Lo consumen la barra lateral
 * (`src/app/(dashboard)/layout.tsx`), la paleta de comandos (`CommandMenu`) y
 * la pantalla Configuración → Módulos y menú: antes cada uno tenía su propia
 * lista, y la paleta se había quedado sin una decena de módulos que sí
 * aparecían en la barra.
 *
 * Es una función pura sin dependencias de servidor, para poder llamarla desde
 * un Server Component y desde un Client Component con el mismo resultado.
 * Filtrar aquí es solo presentación: cada página y cada Server Action vuelve a
 * exigir su permiso en el servidor.
 *
 * Cada enlace lleva un `id` ESTABLE: es lo que se guarda en
 * `CompanySettings.disabledNavItems` cuando la empresa apaga un ítem. Cambiar
 * el `href` o el `label` de un enlace es libre; cambiar su `id` reactivaría en
 * silencio el ítem para toda empresa que lo tenía apagado.
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
  | 'messaging'
  | 'intelligence'
  | 'forecast'
  | 'flows'
  | 'crm'
  | 'crmTasks'
  | 'crmPeople'
  | 'crmReports'
  | 'pageantSite'
  | 'packages'
  | 'casting'
  | 'employees'
  | 'payroll'
  | 'leave'
  | 'fixedAssets'
  | 'expenses'
  | 'contracts'
  | 'salesOrders'
  | 'priceLists'
  | 'commissions';

export interface NavLink {
  /** Identificador estable (ver comentario del archivo). */
  id: string;
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
  /** Ítems que la empresa apagó en Configuración → Módulos y menú. */
  disabledNavItems?: readonly string[];
}

/**
 * Ítems que no se pueden apagar. "Inicio" es a donde vuelve todo el sistema
 * (login, errores, "Volver al Dashboard") y "Configuración" es donde se
 * reactiva lo apagado: sin ellos una empresa podría dejarse sin salida.
 */
export const LOCKED_NAV_ITEMS: readonly string[] = ['home', 'settings'];

/** Todo permiso que habilita alguna sección de /dashboard/settings. */
const SETTINGS_PERMISSIONS: Permission[] = [
  'settings:company',
  'settings:users',
  'audit:read',
  'dte:manage_caf',
  'automation:manage',
  'import:data',
];

/**
 * Menú completo al que el usuario tiene acceso, SIN aplicar lo que la empresa
 * apagó. Lo usan la pantalla de configuración del menú (para listar también
 * lo apagado) y el guard de rutas (para saber a qué ítem pertenece una URL).
 */
export function buildAvailableWorkspaceNav({ permissions, features, isSuperAdmin }: Omit<NavAccess, 'disabledNavItems'>): NavGroup[] {
  const allow = (permission: Permission) => permissions.includes(permission);
  const groups: NavGroup[] = [];
  const push = (label: string, links: NavLink[], collapsedByDefault?: boolean) => {
    if (links.length > 0) groups.push({ label, links, collapsedByDefault });
  };

  const principal: NavLink[] = [{ id: 'home', href: '/dashboard', label: 'Inicio', icon: 'home', exact: true, keywords: ['dashboard', 'panel', 'resumen'] }];
  if (features.hasPos && allow('pos:operate')) {
    principal.push({ id: 'pos', href: '/dashboard/pos', label: 'Punto de Venta', icon: 'pos', keywords: ['pos', 'caja', 'boleta'] });
  }
  if (allow('messaging:use')) {
    principal.push({ id: 'messaging', href: '/dashboard/messaging', label: 'Mensajería', icon: 'messaging', keywords: ['chat', 'mensajes'] });
  }
  push('Principal', principal);

  // Inteligencia arriba a propósito: es la lectura de toda la empresa, no un
  // módulo operativo más.
  const inteligencia: NavLink[] = [];
  if (features.hasIntelligence && allow('intelligence:view')) {
    inteligencia.push(
      { id: 'intelligence', href: '/dashboard/intelligence', label: 'Radiografía 360', icon: 'intelligence', keywords: ['salud', 'score', 'analisis', 'kpi', 'rfm', 'abc', 'simulador', 'bi'] },
      { id: 'intelligence-cash', href: '/dashboard/intelligence/cash-forecast', label: 'Caja a 13 semanas', icon: 'forecast', keywords: ['flujo proyectado', 'liquidez', 'proyeccion', 'caja'] },
      { id: 'intelligence-flows', href: '/dashboard/intelligence/flows', label: 'Flujos del negocio', icon: 'flows', keywords: ['procesos', 'cuello de botella', 'order to cash', 'procure to pay', 'embudo'] }
    );
  }
  if ((features.hasCrm || features.hasEventProjects) && allow('agents:view')) {
    inteligencia.push({ id: 'agents', href: '/dashboard/agents', label: 'Agentes', icon: 'agents', keywords: ['ia', 'ceo', 'cfo', 'asistente', 'finanzas de eventos', 'cobranza'] });
  }
  push('Inteligencia de Negocio', inteligencia);

  if (features.hasInventory && allow('products:read')) {
    push('Inventario', [
      { id: 'products', href: '/dashboard/products', label: 'Catálogo de Productos', icon: 'products', keywords: ['productos', 'articulos', 'sku'] },
      { id: 'inventory', href: '/dashboard/inventory', label: 'Inventario', icon: 'inventory', keywords: ['stock', 'bodega', 'kardex', 'existencias'] },
    ]);
  }

  // CRM como grupo propio: embudo, agenda, contactos y reportes son un
  // módulo completo, no un ítem más de Ventas. El id `crm` se conserva.
  if (features.hasSalesPipeline && allow('crm:read')) {
    push('CRM Comercial', [
      { id: 'crm', href: '/dashboard/crm', label: 'Embudo de negocios', icon: 'crm', keywords: ['crm', 'embudo', 'pipeline', 'prospectos', 'leads', 'negocios', 'oportunidades', 'auspicio'] },
      { id: 'crm-tasks', href: '/dashboard/crm/tasks', label: 'Agenda comercial', icon: 'crmTasks', keywords: ['tareas', 'seguimiento', 'llamadas', 'reuniones', 'pendientes'] },
      { id: 'crm-people', href: '/dashboard/crm/people', label: 'Contactos comerciales', icon: 'crmPeople', keywords: ['personas', 'gerente de marketing', 'agencia', 'stakeholders'] },
      { id: 'crm-reports', href: '/dashboard/crm/reports', label: 'Reportes comerciales', icon: 'crmReports', keywords: ['pronostico', 'forecast', 'tasa de cierre', 'rendimiento'] },
    ]);
  }

  const ventas: NavLink[] = [];
  if (features.hasDteBilling && allow('sales:read')) {
    ventas.push(
      { id: 'sales', href: '/dashboard/sales', label: 'Ventas & Facturación', icon: 'sales', keywords: ['factura', 'boleta', 'dte', 'cotizacion', 'nota de credito'] },
      { id: 'sales-orders', href: '/dashboard/sales/orders', label: 'Notas de venta', icon: 'salesOrders', keywords: ['pedido', 'nota de venta', 'orden de venta', 'despacho parcial', 'reserva'] },
      { id: 'price-lists', href: '/dashboard/sales/price-lists', label: 'Listas de precios', icon: 'priceLists', keywords: ['precios', 'mayorista', 'descuento', 'volumen', 'tarifa'] }
    );
    if (allow('reports:read')) {
      ventas.push({ id: 'sales-commissions', href: '/dashboard/sales/commissions', label: 'Comisiones', icon: 'commissions', keywords: ['vendedores', 'comision', 'incentivo', 'metas'] });
    }
  }
  if (allow('contacts:read')) {
    ventas.push({ id: 'contacts', href: '/dashboard/contacts', label: 'Clientes & Proveedores', icon: 'contacts', keywords: ['contactos', 'rut', 'clientes', 'proveedores'] });
  }
  push('Ventas', ventas);

  if (features.hasPurchases && allow('purchases:read')) {
    push('Compras', [
      { id: 'purchases', href: '/dashboard/purchases', label: 'Compras', icon: 'purchases', keywords: ['factura de compra', 'proveedor'] },
      { id: 'purchase-orders', href: '/dashboard/purchases/orders', label: 'Órdenes de Compra', icon: 'purchases', keywords: ['oc', 'orden'] },
    ]);
  }

  const finanzas: NavLink[] = [];
  if (features.hasTreasury && allow('treasury:read')) {
    finanzas.push(
      { id: 'treasury-cxc', href: '/dashboard/treasury/cxc', label: 'Cuentas por Cobrar', icon: 'cxc', keywords: ['cobranza', 'deudores', 'morosos'] },
      { id: 'treasury-cxp', href: '/dashboard/treasury/cxp', label: 'Cuentas por Pagar', icon: 'cxp', keywords: ['pagos', 'acreedores'] },
      { id: 'treasury-cashflow', href: '/dashboard/treasury/cashflow', label: 'Flujo de Caja', icon: 'cashflow', keywords: ['caja', 'tesoreria'] }
    );
  }
  if (features.hasAdvancedReports && allow('reports:read')) {
    finanzas.push(
      { id: 'reports', href: '/dashboard/reports', label: 'Reportes Excel', icon: 'reports', keywords: ['excel', 'libro de ventas', 'libro de compras', 'exportar'] },
      { id: 'reports-f29', href: '/dashboard/reports/f29', label: 'Formulario 29 (F29)', icon: 'reports', keywords: ['f29', 'iva', 'sii', 'ppm', 'impuestos'] }
    );
  }
  if (features.hasBudgets && allow('budgets:read')) {
    finanzas.push({ id: 'budgets', href: '/dashboard/budgets', label: 'Presupuestos', icon: 'budgets', keywords: ['propuesta'] });
  }
  if (features.hasExpenseReports && allow('expenses:submit')) {
    finanzas.push({ id: 'expenses', href: '/dashboard/expenses', label: 'Rendición de Gastos', icon: 'expenses', keywords: ['rendicion', 'reembolso', 'viaticos', 'caja chica', 'gastos'] });
  }
  if (features.hasFixedAssets && allow('assets:read')) {
    finanzas.push({ id: 'fixed-assets', href: '/dashboard/fixed-assets', label: 'Activo Fijo', icon: 'fixedAssets', keywords: ['depreciacion', 'bienes', 'activos', 'vida util'] });
  }
  if (features.hasPromissoryNotes && allow('promissorynotes:read')) {
    finanzas.push({ id: 'promissory-notes', href: '/dashboard/promissory-notes', label: 'Pagarés', icon: 'promissoryNotes' });
  }
  if (features.hasInstallmentPlans && allow('paymentplans:read')) {
    finanzas.push({ id: 'payment-plans', href: '/dashboard/payment-plans', label: 'Cuotas & Mensualidades', icon: 'paymentPlans', keywords: ['cuotas', 'mensualidad'] });
  }
  push('Finanzas', finanzas);

  if (features.hasAccounting) {
    const contabilidad: NavLink[] = [];
    if (allow('reports:financial')) {
      contabilidad.push({ id: 'financial-statements', href: '/dashboard/financial-statements', label: 'Estados Financieros', icon: 'accounting', keywords: ['balance general', 'estado de resultados', 'eerr'] });
    }
    if (allow('accounting:view')) {
      contabilidad.push(
        { id: 'accounting-journal', href: '/dashboard/accounting/journal', label: 'Libro Diario', icon: 'journal', keywords: ['asientos', 'comprobantes'] },
        { id: 'accounting-ledger', href: '/dashboard/accounting/ledger', label: 'Libro Mayor', icon: 'ledger', keywords: ['mayor', 'cuenta', 'movimientos'] },
        { id: 'accounting-trial-balance', href: '/dashboard/accounting/trial-balance', label: 'Balance de Comprobación', icon: 'trialBalance', keywords: ['8 columnas', 'balance tributario', 'sumas y saldos'] },
        { id: 'accounting-reconciliation', href: '/dashboard/accounting/reconciliation', label: 'Cuadraturas', icon: 'reconciliation', keywords: ['conciliacion', 'cuadrar', 'control'] }
      );
    }
    push('Contabilidad', contabilidad);
  }

  // Dos grupos a propósito: lo de uso diario separado de lo ocasional
  // (plantillas y tableros de cumplimiento), que arranca colapsado.
  const eventos: NavLink[] = [];
  const eventosConfig: NavLink[] = [];
  if (features.hasEventProjects && allow('projects:read')) {
    eventos.push(
      { id: 'projects', href: '/dashboard/projects', label: 'Certámenes & Eventos', icon: 'projects', keywords: ['evento', 'certamen', 'centro de mando', 'sitio publico', 'micrositio', 'gala'] },
      { id: 'calendar', href: '/dashboard/calendar', label: 'Calendario', icon: 'calendar', keywords: ['google calendar', 'agenda'] }
    );
  }
  if (features.hasSponsorships && allow('sponsorships:read')) {
    eventos.push(
      { id: 'sponsorships', href: '/dashboard/sponsorships', label: 'Auspicios & Marcas', icon: 'sponsorships', keywords: ['sponsor', 'auspiciador'] },
      { id: 'sponsorships-packages', href: '/dashboard/sponsorships/packages', label: 'Tarifario de Auspicios', icon: 'packages', keywords: ['planes', 'precios', 'kit comercial', 'cupos', 'oro', 'plata'] }
    );
    eventosConfig.push({ id: 'sponsorships-compliance', href: '/dashboard/sponsorships/compliance', label: 'Cumplimiento de Auspicios', icon: 'sponsorships' });
    if (allow('sponsorships:write')) {
      eventosConfig.push({ id: 'sponsorships-template', href: '/dashboard/sponsorships/template', label: 'Plantilla: Carta de Compromiso', icon: 'sponsorships' });
    }
  }
  if (features.hasFeeDocuments && allow('fees:read')) {
    eventos.push({ id: 'fees', href: '/dashboard/fees', label: 'Boletas de Honorarios', icon: 'fees', keywords: ['honorarios', 'retencion'] });
  }
  if (features.hasCandidates && allow('candidates:read')) {
    eventos.push(
      { id: 'candidates', href: '/dashboard/candidates', label: 'Candidatas & Staff', icon: 'candidates', keywords: ['postulantes', 'participantes'] },
      { id: 'candidates-casting', href: '/dashboard/candidates/casting', label: 'Tablero de Casting', icon: 'casting', keywords: ['casting', 'seleccion', 'numerar', 'oficiales', 'finalistas'] },
      { id: 'candidates-attendance', href: '/dashboard/candidates/attendance', label: 'Asistencia', icon: 'candidates' }
    );
    eventosConfig.push({ id: 'candidates-compliance', href: '/dashboard/candidates/compliance', label: 'Cumplimiento de Candidatas', icon: 'candidates' });
    if (allow('candidates:write')) {
      eventosConfig.push({ id: 'candidates-template', href: '/dashboard/candidates/template', label: 'Plantilla: Contrato de Imagen', icon: 'candidates' });
    }
  }
  // Checklist único de contratos (imagen de candidatas + cartas de auspicio):
  // aparece con cualquiera de los dos módulos; la página filtra por permiso.
  if ((features.hasCandidates && allow('candidates:read')) || (features.hasSponsorships && allow('sponsorships:read'))) {
    eventos.push({ id: 'contracts', href: '/dashboard/contracts', label: 'Contratos firmados', icon: 'contracts', keywords: ['firma', 'firmados', 'contrato de imagen', 'carta de compromiso', 'checklist', 'zapsign'] });
  }
  if (features.hasLiveProduction && allow('production:read')) {
    eventos.push(
      { id: 'production-timeline', href: '/dashboard/production/timeline', label: 'Escaleta en Vivo', icon: 'timeline', keywords: ['escaleta', 'run of show', 'cronograma', 'show'] },
      { id: 'production-wardrobe', href: '/dashboard/production/wardrobe', label: 'Vestuario', icon: 'wardrobe', keywords: ['ropa', 'looks', 'cambios'] },
      { id: 'production-accreditation', href: '/dashboard/production/accreditation', label: 'Acreditaciones', icon: 'production', keywords: ['credencial', 'qr', 'acceso'] }
    );
  }
  if (features.hasJudging && allow('judging:read')) {
    eventos.push({ id: 'judging', href: '/dashboard/judging', label: 'Votación & Escrutinio', icon: 'judging', keywords: ['jurado', 'puntaje'] });
  }
  if (features.hasTicketing && allow('ticketing:read')) {
    eventos.push({ id: 'ticketing', href: '/dashboard/ticketing', label: 'Venta de Entradas', icon: 'ticketing', keywords: ['tickets', 'entradas'] });
  }
  if (features.hasPublicVoting && allow('publicvoting:read')) {
    eventos.push({ id: 'voting', href: '/dashboard/voting', label: 'Votación Pagada', icon: 'voting', keywords: ['votos', 'publico'] });
  }
  push('Producción de Eventos', eventos);
  push('Plantillas y Cumplimiento', eventosConfig, true);

  const personas: NavLink[] = [];
  if (features.hasPayroll && allow('payroll:read')) {
    personas.push(
      { id: 'hr-employees', href: '/dashboard/hr', label: 'Trabajadores', icon: 'employees', keywords: ['personal', 'rrhh', 'recursos humanos', 'ficha', 'contrato'] },
      { id: 'hr-payroll', href: '/dashboard/hr/payroll', label: 'Remuneraciones', icon: 'payroll', keywords: ['liquidaciones', 'sueldos', 'afp', 'previred', 'nomina'] },
      { id: 'hr-leave', href: '/dashboard/hr/leave', label: 'Vacaciones & Permisos', icon: 'leave', keywords: ['vacaciones', 'licencia', 'permiso', 'feriado legal'] }
    );
  }
  if (features.hasOrgChart && allow('orgchart:read')) {
    personas.push({ id: 'org-chart', href: '/dashboard/org-chart', label: 'Organigrama', icon: 'orgchart', keywords: ['cargos', 'equipo'] });
  }
  push('Personas & Equipo', personas);

  // Manual: sin gate. Cualquier usuario debe poder consultar cómo usar lo que tiene.
  push('Ayuda', [{ id: 'manual', href: '/dashboard/manual', label: 'Manual de Usuario', icon: 'help', keywords: ['ayuda', 'como usar', 'tutorial'] }]);

  if (SETTINGS_PERMISSIONS.some(allow)) {
    push('Configuración', [{ id: 'settings', href: '/dashboard/settings', label: 'Configuración', icon: 'settings', keywords: ['empresa', 'usuarios', 'folios', 'caf', 'roles', 'modulos', 'menu'] }]);
  }

  if (isSuperAdmin) {
    push('Plataforma', [{ id: 'platform', href: '/superadmin', label: 'Panel SaaS', icon: 'platform' }]);
  }

  return groups;
}

/** Aplica lo que la empresa apagó. Los ítems bloqueados nunca se quitan. */
export function applyDisabledNavItems(groups: NavGroup[], disabledNavItems: readonly string[] | undefined): NavGroup[] {
  if (!disabledNavItems || disabledNavItems.length === 0) return groups;
  const disabled = new Set(disabledNavItems);
  return groups
    .map((group) => ({ ...group, links: group.links.filter((link) => LOCKED_NAV_ITEMS.includes(link.id) || !disabled.has(link.id)) }))
    .filter((group) => group.links.length > 0);
}

/** Menú visible: lo que el usuario puede abrir, menos lo que la empresa apagó. */
export function buildWorkspaceNav(access: NavAccess): NavGroup[] {
  return applyDisabledNavItems(buildAvailableWorkspaceNav(access), access.disabledNavItems);
}

/**
 * Enlace al que pertenece una ruta: el de coincidencia MÁS específica. En
 * `/dashboard/purchases/orders/abc` coinciden "Compras" y "Órdenes de Compra",
 * pero la pantalla es de la segunda.
 */
export function findNavLinkForPath<T extends Pick<NavLink, 'href' | 'exact'>>(links: readonly T[], pathname: string): T | null {
  let best: T | null = null;
  for (const link of links) {
    const matches = link.exact ? pathname === link.href : pathname === link.href || pathname.startsWith(`${link.href}/`);
    if (matches && (!best || link.href.length > best.href.length)) best = link;
  }
  return best;
}

/** Normaliza lo que llega desde la base o desde un formulario: sin duplicados, sin bloqueados, solo ids conocidos. */
export function sanitizeDisabledNavItems(input: readonly string[], knownIds: ReadonlySet<string>): string[] {
  return [...new Set(input)].filter((id) => knownIds.has(id) && !LOCKED_NAV_ITEMS.includes(id)).sort();
}

/** Todos los ids que existen en el registro (plan completo, todos los permisos). */
export function allKnownNavItemIds(): Set<string> {
  const features = Object.fromEntries(MODULE_KEYS.map((key) => [key, true])) as CompanyFeatureFlags;
  const groups = buildAvailableWorkspaceNav({ permissions: ALL_PERMISSIONS, features, isSuperAdmin: false });
  return new Set(groups.flatMap((group) => group.links.map((link) => link.id)));
}
