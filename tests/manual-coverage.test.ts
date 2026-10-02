import { existsSync } from 'fs';
import path from 'path';
import { MODULE_KEYS, type CompanyFeatureFlags, type FeatureKey } from '@/lib/auth/modules';
import { ALL_PERMISSIONS } from '@/lib/auth/permissions';
import { buildAvailableWorkspaceNav } from '@/lib/navigation/workspace-nav';
import { MANUAL_CHAPTERS, MANUAL_SECTIONS, findManualSectionForPath, sectionRoutes, sectionScreenshot } from '@/modules/manual/content';
import { SCREEN_PURPOSES } from '@/modules/manual/knowledge';
import { TUTORIAL_CONTENT } from '@/components/tutorial/tutorial-content';
import { getModuleKeyForPath, tutorialRoutes } from '@/components/tutorial/tutorial-routes';

/**
 * El manual, los tutoriales y el asistente se desfasaban del menú: había ~35
 * pantallas sin una línea de ayuda y subpantallas que mostraban el tutorial
 * de otra (la escaleta abría "Acreditaciones"). Estas pruebas atan los tres
 * al registro único del menú: una pantalla nueva no compila su CI hasta que
 * tiene manual, tutorial y "para qué sirve".
 */

const ALL_FEATURES = Object.fromEntries(MODULE_KEYS.map((key) => [key, true])) as CompanyFeatureFlags;
const MENU_LINKS = buildAvailableWorkspaceNav({ permissions: ALL_PERMISSIONS, features: ALL_FEATURES, isSuperAdmin: false }).flatMap((group) => group.links);

describe('Cada pantalla del menú tiene ayuda', () => {
  it.each(MENU_LINKS.map((link) => [link.id, link.href] as const))('%s tiene "para qué sirve" en el mapa del asistente', (id) => {
    expect(SCREEN_PURPOSES[id]).toBeTruthy();
  });

  it.each(MENU_LINKS.map((link) => [link.id, link.href] as const))('%s (%s) está documentada en el manual', (_id, href) => {
    const section = findManualSectionForPath(href);
    expect(section).not.toBeNull();
    // Documentada de verdad (por la ruta de la sección o de uno de sus temas),
    // no por caer en una sección general.
    if (href !== '/dashboard') {
      expect(sectionRoutes(section!).some((route) => route !== '/dashboard' && (href === route || href.startsWith(`${route}/`)))).toBe(true);
    }
  });

  it.each(MENU_LINKS.map((link) => [link.id, link.href] as const))('%s (%s) tiene su propio tutorial', (_id, href) => {
    const key = getModuleKeyForPath(href);
    expect(key).not.toBeNull();
    expect(TUTORIAL_CONTENT[key!]).toBeDefined();
    // Su propia entrada, no la del módulo padre: así no muestra el tour de otra pantalla.
    expect(tutorialRoutes().some(([route, routeKey]) => route === href && routeKey === key) || href === '/dashboard').toBe(true);
  });
});

describe('Tutoriales', () => {
  it('toda ruta apunta a un tutorial que existe', () => {
    for (const [, key] of tutorialRoutes()) expect(TUTORIAL_CONTENT[key]).toBeDefined();
  });

  it('todo tutorial se usa en alguna ruta (o es el de Inicio)', () => {
    const used = new Set([...tutorialRoutes().map(([, key]) => key), 'dashboard']);
    for (const key of Object.keys(TUTORIAL_CONTENT)) expect(used.has(key)).toBe(true);
  });

  it('el prefijo respeta el límite de segmento', () => {
    expect(getModuleKeyForPath('/dashboard/sales/orders/abc')).toBe('sales-orders');
    expect(getModuleKeyForPath('/dashboard/sales/abc')).toBe('sales');
    expect(getModuleKeyForPath('/dashboard/salesx')).toBeNull();
  });

  it('cada tour es corto y empieza anclado al encabezado de la pantalla', () => {
    for (const [key, content] of Object.entries(TUTORIAL_CONTENT)) {
      expect(content.steps.length).toBeGreaterThanOrEqual(2);
      expect(content.steps.length).toBeLessThanOrEqual(6);
      if (key !== 'dashboard') expect(content.steps[0]!.target).toBe('module-header');
    }
  });
});

describe('Estructura del manual', () => {
  it('ids de sección únicos y de temas únicos dentro de cada sección', () => {
    const ids = MANUAL_SECTIONS.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const section of MANUAL_SECTIONS) {
      const topicIds = section.topics.map((topic) => topic.id);
      expect(new Set(topicIds).size).toBe(topicIds.length);
    }
  });

  it('las secciones vienen ordenadas por capítulo', () => {
    const order = MANUAL_SECTIONS.map((section) => MANUAL_CHAPTERS.indexOf(section.chapter));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('cada sección tiene resumen y pasos', () => {
    for (const section of MANUAL_SECTIONS) {
      expect(section.summary.length).toBeGreaterThan(40);
      expect(section.topics.length).toBeGreaterThan(0);
      for (const topic of section.topics) expect(topic.steps.length).toBeGreaterThan(0);
    }
  });

  /** Módulos que no tienen pantalla propia: viven dentro de Inventario y del selector de empresa. */
  const COVERED_ELSEWHERE: FeatureKey[] = ['hasPmpCosting', 'hasMultipleWarehouses'];

  it.each(MODULE_KEYS.filter((key) => !COVERED_ELSEWHERE.includes(key)))('el módulo %s tiene al menos una sección', (key) => {
    expect(MANUAL_SECTIONS.some((section) => section.key === key || section.anyOfFeatures?.includes(key))).toBe(true);
  });

  /**
   * Botones y pantallas que el manual anterior citaba y no existen (o ya no
   * están donde decía): que no vuelvan a colarse.
   */
  it.each(['asistente flotante', 'botón flotante', '"Nuevo documento"', '"Nueva compra"', '"Invitar usuario"', '"Nueva persona"', '"Nuevo contrato"', 'Cerrar un período contable', 'asiento contable manual'])(
    'no menciona "%s"',
    (phrase) => {
      const text = JSON.stringify(MANUAL_SECTIONS);
      expect(text).not.toContain(phrase);
    }
  );
});

describe('Capturas de pantalla', () => {
  it.each(MANUAL_SECTIONS.filter((section) => sectionScreenshot(section) !== null).map((section) => [section.id, sectionScreenshot(section)!] as const))(
    'la sección %s tiene su captura en public/',
    (_id, screenshot) => {
      expect(existsSync(path.join(process.cwd(), 'public', screenshot))).toBe(true);
    }
  );
});
