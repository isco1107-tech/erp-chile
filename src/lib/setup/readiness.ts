import type { Permission } from '@/lib/auth/permissions';
import type { CompanyFeatureFlags } from '@/lib/auth/modules';

/**
 * "Primeros pasos" — checklist de puesta en marcha de una empresa.
 *
 * Función pura sobre un resumen de conteos que arma `setup.service.ts`: no
 * consulta la base ni guarda nada, cada ítem se deriva de datos reales en cada
 * lectura (mismo criterio que `buildPageantReadiness`). Solo aparecen los
 * ítems de los módulos que la empresa tiene contratados Y que la persona que
 * mira puede abrir: nadie recibe un enlace a una pantalla que no puede usar.
 *
 * El orden del arreglo es el orden recomendado de trabajo.
 */

export type SetupItemStatus = 'ok' | 'todo';

export type SetupItemId =
  | 'company-profile'
  | 'folios'
  | 'products'
  | 'initial-stock'
  | 'customers'
  | 'cash-register'
  | 'first-sale'
  | 'bank-account'
  | 'chart-of-accounts'
  | 'first-worker'
  | 'first-project'
  | 'team';

export interface SetupItem {
  id: SetupItemId;
  label: string;
  status: SetupItemStatus;
  /** Frase en castellano simple: por qué importa (pendiente) o qué ya quedó listo (hecho). */
  detail: string;
  /** Pantalla exacta donde se resuelve. */
  href: string;
  /** Permiso principal para abrir esa pantalla. */
  permission: Permission;
  /** Permisos adicionales que exige la acción (todos deben estar). */
  alsoRequires?: Permission[];
  /** `id` del ítem del menú al que pertenece la pantalla (`workspace-nav.ts`), para respetar lo que la empresa apagó. */
  navId: string;
}

export interface SetupProgress {
  done: number;
  total: number;
  /** 0-100, entero. Sin ítems cuenta como 100: no hay nada que configurar. */
  percent: number;
  /** Primer pendiente en el orden recomendado, o `null` si todo está listo. */
  next: SetupItem | null;
}

export interface SetupReadinessReport extends SetupProgress {
  items: SetupItem[];
  complete: boolean;
}

export type SetupFeatureFlags = Pick<
  CompanyFeatureFlags,
  'hasInventory' | 'hasPos' | 'hasDteBilling' | 'hasTreasury' | 'hasAccounting' | 'hasPayroll' | 'hasEventProjects'
>;

export interface CompanySetupInput {
  features: SetupFeatureFlags;
  /** Permisos de quien mira, ya cruzados con los módulos contratados. */
  permissions: readonly Permission[];
  /** Ítems del menú que la empresa apagó: su pantalla no se ofrece. */
  disabledNavItems?: readonly string[];
  company: {
    rut: string | null;
    businessName: string | null;
    giro: string | null;
    address: string | null;
    comuna: string | null;
  };
  counts: {
    /** Clientes reales: SIN el consumidor final 66.666.666-6. */
    customers: number;
    products: number;
    /** Filas de stock con cantidad mayor que cero. */
    stockWithQuantity: number;
    cashRegisters: number;
    bankAccounts: number;
    workers: number;
    projects: number;
    users: number;
    invitations: number;
    /** Documentos de venta emitidos (no borradores ni anulados). */
    issuedSales: number;
  };
  /** Hay al menos un rango de folios autorizados con folios sin usar. */
  foliosAvailable: boolean;
  hasChartOfAccounts: boolean;
}

/** Prefijo del RUT genérico del consumidor final (66.666.666-6): una boleta sin datos, no un cliente real. */
export const GENERIC_CONSUMER_RUT_PREFIX = '66666666';

/** ¿Cuenta como cliente para "Registrar tus clientes"? Es cliente y no es el consumidor final. */
export function isRealCustomer(contact: { isCustomer: boolean; rutClean: string }): boolean {
  return contact.isCustomer && !contact.rutClean.startsWith(GENERIC_CONSUMER_RUT_PREFIX);
}

const BLANK = (value: string | null): boolean => value === null || value.trim() === '';

/** Campos del perfil tributario que faltan, con el nombre que ve la persona en el formulario. */
export function missingCompanyProfileFields(company: CompanySetupInput['company']): string[] {
  const missing: string[] = [];
  if (BLANK(company.businessName)) missing.push('razón social');
  if (BLANK(company.rut)) missing.push('RUT');
  if (BLANK(company.giro)) missing.push('giro');
  if (BLANK(company.address)) missing.push('dirección');
  if (BLANK(company.comuna)) missing.push('comuna');
  return missing;
}

function listFields(fields: string[]): string {
  if (fields.length <= 1) return fields.join('');
  return `${fields.slice(0, -1).join(', ')} y ${fields[fields.length - 1]}`;
}

/** Puede abrir la pantalla del ítem: permiso principal y los adicionales. */
export function canOpenSetupItem(item: Pick<SetupItem, 'permission' | 'alsoRequires'>, permissions: readonly Permission[]): boolean {
  return permissions.includes(item.permission) && (item.alsoRequires ?? []).every((permission) => permissions.includes(permission));
}

export function summarizeSetupProgress(items: readonly SetupItem[]): SetupProgress {
  const done = items.filter((item) => item.status === 'ok').length;
  const total = items.length;
  return {
    done,
    total,
    percent: total === 0 ? 100 : Math.round((done / total) * 100),
    next: items.find((item) => item.status === 'todo') ?? null,
  };
}

export function buildCompanySetupReadiness(input: CompanySetupInput): SetupReadinessReport {
  const { features, counts } = input;
  const candidates: SetupItem[] = [];
  const add = (item: SetupItem) => candidates.push(item);

  const missingProfile = missingCompanyProfileFields(input.company);
  add({
    id: 'company-profile',
    label: 'Completar los datos de tu empresa',
    status: missingProfile.length === 0 ? 'ok' : 'todo',
    detail:
      missingProfile.length === 0
        ? 'Razón social, RUT, giro y dirección listos: ya salen en tus documentos.'
        : `Faltan: ${listFields(missingProfile)}. Estos datos salen impresos en tus facturas, boletas y cotizaciones, y el SII los exige.`,
    href: '/dashboard/settings/company',
    permission: 'settings:company',
    navId: 'settings',
  });

  if (features.hasDteBilling) {
    add({
      id: 'folios',
      label: 'Cargar tus folios del SII (CAF)',
      status: input.foliosAvailable ? 'ok' : 'todo',
      detail: input.foliosAvailable
        ? 'Tienes folios autorizados disponibles para emitir.'
        : 'Sin folios autorizados tus documentos salen sin timbre y no tienen validez tributaria. Descárgalos desde el portal del SII y cárgalos aquí.',
      href: '/dashboard/settings/folios',
      permission: 'dte:manage_caf',
      navId: 'settings',
    });
  }

  if (features.hasInventory) {
    add({
      id: 'products',
      label: 'Crear tus productos o servicios',
      status: counts.products > 0 ? 'ok' : 'todo',
      detail:
        counts.products > 0
          ? `${counts.products} ${counts.products === 1 ? 'producto cargado' : 'productos cargados'}.`
          : 'Sin productos no puedes vender ni controlar stock. Créalos uno a uno o cárgalos todos juntos desde un Excel.',
      href: '/dashboard/products',
      permission: 'products:write',
      navId: 'products',
    });
    add({
      id: 'initial-stock',
      label: 'Cargar el stock inicial',
      status: counts.stockWithQuantity > 0 ? 'ok' : 'todo',
      detail:
        counts.stockWithQuantity > 0
          ? 'Ya hay existencias en tu bodega.'
          : counts.products === 0
            ? 'Cuando tengas productos, ingresa cuántas unidades tienes hoy. Si vendes antes de hacerlo, el inventario parte descuadrado.'
            : 'Ingresa cuántas unidades tienes hoy de cada producto. Si vendes antes de hacerlo, el inventario parte descuadrado.',
      href: '/dashboard/inventory?openStockForm=1',
      permission: 'inventory:write',
      navId: 'inventory',
    });
  }

  // Los clientes importan donde se factura o se cobra; el POS vende a
  // consumidor final y no los necesita.
  if (features.hasDteBilling || features.hasTreasury) {
    add({
      id: 'customers',
      label: 'Registrar tus clientes',
      status: counts.customers > 0 ? 'ok' : 'todo',
      detail:
        counts.customers > 0
          ? `${counts.customers} ${counts.customers === 1 ? 'cliente registrado' : 'clientes registrados'}.`
          : 'Para emitir una factura o llevar cuentas por cobrar necesitas al menos un cliente con su RUT. El consumidor final de las boletas no cuenta.',
      href: '/dashboard/contacts',
      permission: 'contacts:write',
      navId: 'contacts',
    });
  }

  if (features.hasPos) {
    add({
      id: 'cash-register',
      label: 'Crear tu caja del Punto de Venta',
      status: counts.cashRegisters > 0 ? 'ok' : 'todo',
      detail:
        counts.cashRegisters > 0
          ? 'Tu caja está lista para abrir turno.'
          : 'Sin una caja no puedes abrir turno ni vender en el mostrador. Se crea una vez desde el Punto de Venta, y cada venta descuenta el stock de su bodega.',
      href: '/dashboard/pos',
      permission: 'pos:operate',
      alsoRequires: ['settings:company'],
      navId: 'pos',
    });
  }

  if (features.hasDteBilling) {
    add({
      id: 'first-sale',
      label: 'Emitir tu primera venta',
      status: counts.issuedSales > 0 ? 'ok' : 'todo',
      detail:
        counts.issuedSales > 0
          ? 'Ya emitiste documentos: tus gráficos y el IVA del mes se llenan solos.'
          : 'Emite una factura o boleta de prueba para ver cómo se calcula el IVA y cómo se descuenta el stock.',
      href: '/dashboard/sales/new',
      permission: 'sales:write',
      navId: 'sales',
    });
  }

  if (features.hasTreasury) {
    add({
      id: 'bank-account',
      label: 'Registrar tu cuenta bancaria',
      status: counts.bankAccounts > 0 ? 'ok' : 'todo',
      detail:
        counts.bankAccounts > 0
          ? 'Tu cuenta está registrada para pagos y conciliación.'
          : 'Con tu cuenta bancaria registrada puedes anotar pagos y cobros, y cuadrarlos con la cartola del banco.',
      href: '/dashboard/treasury/banks',
      permission: 'treasury:write',
      navId: 'treasury-banks',
    });
  }

  if (features.hasAccounting) {
    add({
      id: 'chart-of-accounts',
      label: 'Activar el plan de cuentas',
      status: input.hasChartOfAccounts ? 'ok' : 'todo',
      detail: input.hasChartOfAccounts
        ? 'Plan de cuentas creado: tus ventas y compras ya generan asientos solos.'
        : 'Sin plan de cuentas el sistema no registra asientos contables y tus libros quedan vacíos. Un clic crea el plan base, que tu contador puede ajustar.',
      href: '/dashboard/accounting',
      permission: 'accounting:manage_accounts',
      alsoRequires: ['accounting:view'],
      navId: 'accounting-journal',
    });
  }

  if (features.hasPayroll) {
    add({
      id: 'first-worker',
      label: 'Registrar a tu primer trabajador',
      status: counts.workers > 0 ? 'ok' : 'todo',
      detail:
        counts.workers > 0
          ? `${counts.workers} ${counts.workers === 1 ? 'trabajador registrado' : 'trabajadores registrados'}.`
          : 'Con su ficha (RUT, sueldo, AFP y salud) el sistema calcula las liquidaciones de sueldo por ti.',
      href: '/dashboard/hr',
      permission: 'payroll:write',
      navId: 'hr-employees',
    });
  }

  if (features.hasEventProjects) {
    add({
      id: 'first-project',
      label: 'Crear tu primer certamen o evento',
      status: counts.projects > 0 ? 'ok' : 'todo',
      detail:
        counts.projects > 0
          ? `${counts.projects} ${counts.projects === 1 ? 'proyecto creado' : 'proyectos creados'}.`
          : 'Cada certamen o evento tiene su centro de mando, su checklist de preparación y su sitio público. Todo lo demás (candidatas, auspicios, entradas) se cuelga de él.',
      href: '/dashboard/projects/new',
      permission: 'projects:write',
      navId: 'projects',
    });
  }

  add({
    id: 'team',
    label: 'Invitar a tu equipo',
    status: counts.users > 1 || counts.invitations > 0 ? 'ok' : 'todo',
    detail:
      counts.users > 1 || counts.invitations > 0
        ? 'Ya invitaste a alguien más.'
        : 'Invita a tu contador, a quien vende y a quien maneja la bodega, cada uno con su rol: así cada persona ve solo lo que necesita y todo queda con responsable.',
    href: '/dashboard/settings/users',
    permission: 'settings:users',
    navId: 'settings',
  });

  const disabled = new Set(input.disabledNavItems ?? []);
  const items = candidates.filter((item) => canOpenSetupItem(item, input.permissions) && !disabled.has(item.navId));
  const progress = summarizeSetupProgress(items);

  return { items, ...progress, complete: progress.total > 0 && progress.done === progress.total };
}
