import { MODULE_KEYS, type CompanyFeatureFlags, type FeatureKey } from '@/lib/auth/modules';
import type { Permission } from '@/lib/auth/permissions';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getVisibleManualSections } from '@/modules/manual/content';
import {
  NAVIGATION_MAP,
  describeCurrentScreen,
  getKnowledgeAsManualSections,
  getVisibleNavigation,
  getVisibleTroubleshooting,
  getVisibleWorkflows,
} from '@/modules/manual/knowledge';
import { buildManualSystemPrompt } from '@/modules/manual/prompt';

/**
 * El asistente del manual arma su prompt con lo que esta empresa contrató y
 * lo que este usuario puede hacer. El riesgo no es que responda mal: es que
 * le describa a alguien una pantalla que no puede abrir, o de un módulo que
 * su empresa no paga. Estos tests fijan ese filtrado.
 */

// Derivado del registro real: una lista a mano se desfasaba cada vez que se
// agregaba un módulo, y el test del "mapa completo" fallaba por la lista, no
// por el código.
const FEATURE_KEYS: FeatureKey[] = [...MODULE_KEYS];

function features(enabled: FeatureKey[]): CompanyFeatureFlags {
  return Object.fromEntries(FEATURE_KEYS.map((key) => [key, enabled.includes(key)])) as CompanyFeatureFlags;
}

const NO_FEATURES = features([]);
const ALL_FEATURES = features(FEATURE_KEYS);
const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

describe('Mapa de pantallas del asistente', () => {
  it('todas las rutas del mapa son rutas del dashboard o del panel de plataforma', () => {
    for (const entry of NAVIGATION_MAP) {
      expect(entry.route.startsWith('/dashboard')).toBe(true);
    }
  });

  it('no repite rutas', () => {
    const routes = NAVIGATION_MAP.map((entry) => entry.route);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('una empresa sin módulos contratados solo ve pantallas transversales', () => {
    const visible = getVisibleNavigation(NO_FEATURES, ALL_PERMISSIONS);
    for (const entry of visible) {
      expect(entry.requires).toBeUndefined();
    }
    expect(visible.map((entry) => entry.route)).toContain('/dashboard');
    expect(visible.map((entry) => entry.route)).not.toContain('/dashboard/pos');
  });

  it('un usuario sin permisos no ve las pantallas que exigen uno', () => {
    const visible = getVisibleNavigation(ALL_FEATURES, []);
    for (const entry of visible) {
      expect(entry.permission).toBeUndefined();
      expect(entry.anyOfPermissions).toBeUndefined();
    }
    expect(visible.map((entry) => entry.route)).not.toContain('/dashboard/settings/users');
  });

  /**
   * El sidebar muestra Configuración con un OR de sus secciones. Si el mapa
   * exigiera un permiso puntual, el asistente mandaría a Configuración a
   * gente que no lo ve en su menú, o dejaría de mandar a quien sí lo ve.
   */
  it('Configuración aparece con cualquiera de los permisos de sus secciones', () => {
    const soloAuditoria = getVisibleNavigation(ALL_FEATURES, ['audit:read']).map((entry) => entry.route);
    expect(soloAuditoria).toContain('/dashboard/settings');

    const soloImportacion = getVisibleNavigation(ALL_FEATURES, ['import:data']).map((entry) => entry.route);
    expect(soloImportacion).not.toContain('/dashboard/settings');
  });

  it('con todo contratado y todos los permisos se ve el mapa completo', () => {
    expect(getVisibleNavigation(ALL_FEATURES, ALL_PERMISSIONS)).toHaveLength(NAVIGATION_MAP.length);
  });
});

describe('Pantalla actual del usuario', () => {
  it('resuelve la ruta exacta', () => {
    expect(describeCurrentScreen('/dashboard/treasury/cxc')?.label).toBe('Cuentas por Cobrar');
  });

  /** Un detalle (`/sales/123`) tiene que resolver al listado, no quedar sin contexto. */
  it('resuelve una subruta hacia su pantalla padre', () => {
    expect(describeCurrentScreen('/dashboard/sales/abc123')?.route).toBe('/dashboard/sales');
  });

  /** `/dashboard` es prefijo de todo: gana siempre la coincidencia más específica. */
  it('prefiere la coincidencia más específica sobre /dashboard', () => {
    expect(describeCurrentScreen('/dashboard/reports/f29')?.route).toBe('/dashboard/reports/f29');
  });

  it('devuelve null para una ruta desconocida', () => {
    expect(describeCurrentScreen('/otra-cosa')).toBeNull();
  });
});

describe('Flujos y problemas frecuentes', () => {
  it('un flujo que cruza dos módulos exige ambos contratados', () => {
    const soloVentas = features(['hasDteBilling']);
    const titles = getVisibleWorkflows(soloVentas, ALL_PERMISSIONS).map((workflow) => workflow.title);
    expect(titles).not.toContain('Ciclo completo de una venta a crédito, de la cotización al cobro');

    const conTesoreria = features(['hasDteBilling', 'hasTreasury']);
    const withBoth = getVisibleWorkflows(conTesoreria, ALL_PERMISSIONS).map((workflow) => workflow.title);
    expect(withBoth).toContain('Ciclo completo de una venta a crédito, de la cotización al cobro');
  });

  it('los problemas de un módulo no contratado no se muestran', () => {
    const problems = getVisibleTroubleshooting(NO_FEATURES, ALL_PERMISSIONS).map((item) => item.problem);
    expect(problems).not.toContain('La caja del POS no cuadra al cerrar el turno');
    expect(problems).toContain('No veo un módulo o una opción que sé que existe');
  });

  it('el glosario siempre está disponible, incluso sin módulos', () => {
    const titles = getKnowledgeAsManualSections(NO_FEATURES, []).map((section) => section.title);
    expect(titles).toContain('Glosario');
  });
});

describe('Secciones del manual con permiso', () => {
  it('una sección con permiso se oculta a quien no lo tiene', () => {
    const withoutImport = getVisibleManualSections(ALL_FEATURES, []).map((section) => section.title);
    expect(withoutImport).not.toContain('Importación Masiva (Excel y fotos)');

    const withImport = getVisibleManualSections(ALL_FEATURES, ['import:data']).map((section) => section.title);
    expect(withImport).toContain('Importación Masiva (Excel y fotos)');
  });

  /** Sin `permissions`, el filtro por permiso no aplica: sigue devolviendo todo lo contratado. */
  it('omitir los permisos devuelve todas las secciones contratadas', () => {
    const titles = getVisibleManualSections(ALL_FEATURES).map((section) => section.title);
    expect(titles).toContain('Importación Masiva (Excel y fotos)');
  });
});

describe('Prompt del asistente', () => {
  const base = { companyName: 'Comercial Aether SpA', userName: 'Ana', currentPath: '/dashboard/treasury/cxc' };

  it('incluye empresa, usuario y la pantalla actual', () => {
    const prompt = buildManualSystemPrompt({ ...base, features: ALL_FEATURES, permissions: ALL_PERMISSIONS });
    expect(prompt).toContain('Comercial Aether SpA');
    expect(prompt).toContain('Ana');
    expect(prompt).toContain('Cuentas por Cobrar');
  });

  it('no menciona pantallas de módulos que la empresa no contrató', () => {
    const prompt = buildManualSystemPrompt({
      ...base,
      currentPath: '/dashboard',
      features: NO_FEATURES,
      permissions: ALL_PERMISSIONS,
    });
    expect(prompt).not.toContain('/dashboard/pos');
    expect(prompt).not.toContain('/dashboard/candidates');
  });

  it('avisa que no hay acciones cuando el usuario no tiene permisos de escritura', () => {
    const prompt = buildManualSystemPrompt({ ...base, features: ALL_FEATURES, permissions: [] });
    expect(prompt).toContain('no tiene permiso para que ejecutes ninguna acción');
  });
});
