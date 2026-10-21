import type { FeatureKey } from '@/lib/auth/modules';
import type { Permission } from '@/lib/auth/permissions';

export interface ManualTopic {
  /** Estable: ancla del manual (`#seccion-tema`) y marcador del Word. */
  id: string;
  title: string;
  steps: string[];
  /**
   * Pantalla donde se hace, cuando no es la de la sección (p. ej. "Bancos"
   * dentro de Tesorería). La usan el botón "Ir a la pantalla", el asistente
   * para saber qué temas aplican a la pantalla actual, y la prueba de
   * cobertura que exige que cada pantalla del menú esté documentada.
   */
  route?: string;
  /** Sin este permiso el tema no aparece en el manual "de mi rol" (sí en el de la empresa). */
  permission?: Permission;
  /** Advertencia o consejo que no se debe pasar por alto. Se destaca en pantalla y en el Word. */
  tip?: string;
}

/**
 * Capítulos del manual, con los mismos nombres que los grupos del menú
 * lateral (`workspace-nav.ts`): el usuario busca "Finanzas → Cheques" porque
 * así lo ve en su menú, no por cómo está organizado el código. El orden es
 * el de lectura recomendado, no el del menú.
 */
export const MANUAL_CHAPTERS = [
  'Primeros pasos',
  // Antes que los módulos: datos de la empresa, equipo y folios se dejan
  // listos antes de emitir el primer documento.
  'Configuración',
  'Inteligencia de Negocio',
  'Ventas',
  'Compras',
  'Inventario',
  'Operaciones',
  'Finanzas',
  'Reportes & SII',
  'Contabilidad',
  'CRM Comercial',
  'Certámenes & Eventos',
  'Personas & Equipo',
  'Sitios web',
  'Referencia',
] as const;

export type ManualChapter = (typeof MANUAL_CHAPTERS)[number];

export interface ManualSection {
  /** Estable: ancla `#id` del manual, enlace desde el tutorial y marcador del Word. */
  id: string;
  /** `'always'` = visible sin importar el plan contratado (navegación, contactos, configuración). */
  key: FeatureKey | 'always';
  /** Basta con que la empresa tenga UNO de estos módulos (además de `key`, si no es `'always'`). */
  anyOfFeatures?: FeatureKey[];
  /**
   * Permiso con el que se abre la pantalla principal del módulo. En el manual
   * "de mi rol" (y en el asistente) la sección solo aparece si el usuario lo
   * tiene; en el manual "de la empresa" basta con el módulo contratado.
   */
  permission?: Permission;
  /** Basta con UNO de estos permisos (pantallas que el menú muestra con un O). */
  anyOfPermissions?: Permission[];
  chapter: ManualChapter;
  title: string;
  /** Para qué sirve, en lenguaje simple: lo primero que lee alguien que nunca usó el módulo. */
  summary: string;
  route: string;
  /**
   * Captura de la pantalla. Sin el campo se usa `/manual/screenshots/<id>.jpg`
   * (la genera `scripts/capture-manual-screenshots.ts` recorriendo las
   * secciones); `null` = sección conceptual, sin captura propia.
   */
  screenshot?: string | null;
  topics: ManualTopic[];
}
