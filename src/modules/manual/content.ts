import type { CompanyFeatureFlags } from '@/lib/auth/modules';
import type { Permission } from '@/lib/auth/permissions';
import { MANUAL_CHAPTERS, type ManualSection, type ManualTopic } from './types';
import { findByLongestRoute } from './hints';
import { INICIO_SECTIONS } from './sections/inicio';
import { VENTAS_SECTIONS } from './sections/ventas';
import { COMPRAS_SECTIONS } from './sections/compras';
import { INVENTARIO_SECTIONS } from './sections/inventario';
import { OPERACIONES_SECTIONS } from './sections/operaciones';
import { FINANZAS_SECTIONS } from './sections/finanzas';
import { ADMINISTRACION_SECTIONS } from './sections/administracion';
import { GESTION_SECTIONS } from './sections/gestion';
import { EVENTOS_SECTIONS } from './sections/eventos';

export type { ManualSection, ManualTopic, ManualChapter } from './types';
export { MANUAL_CHAPTERS } from './types';

/**
 * Contenido del manual de usuario, una sección por módulo o pantalla
 * relevante, repartido por área en `sections/`. Lo consumen cuatro
 * superficies con el mismo filtro: la pantalla `/dashboard/manual`, la
 * descarga en Word, el asistente (prompt) y la herramienta MCP
 * `search_manual`.
 *
 * Regla: todo botón, pantalla y flujo citado existe de verdad en el código.
 * Si cambia una ruta o el texto de un botón, este contenido se desactualiza:
 * `tests/manual-coverage.test.ts` exige que cada pantalla del menú esté
 * documentada, pero el texto de los pasos se revisa a mano.
 */
export const MANUAL_SECTIONS: ManualSection[] = [
  {
    id: 'consignment',
    chapter: 'Operaciones',
    permission: 'consignment:read',
    summary: 'Controlar productos de terceros, comisiones y liquidaciones al productor.',
    key: 'hasConsignment',
    title: 'Productores y consignación',
    route: '/dashboard/consignment',
    topics: [
      {
        id: 'registrar-productor',
        title: 'Registrar un productor y su comisión',
        steps: [
          'Crea primero al productor como contacto (proveedor) en Contactos.',
          'En Productores y consignación, haz clic en "Nuevo productor", elige el contacto y define la comisión por defecto (el porcentaje que retiene tu empresa de cada venta).',
          'Elige si la comisión se calcula sobre el neto (lo habitual) o sobre el total con IVA; confírmalo con tu contador.',
        ]
      },
      {
        id: 'asignar-productos-consignacion',
        title: 'Asignar productos en consignación',
        steps: [
          'Abre la ficha del productor y, en "Productos", asigna los productos que él deja en consignación; opcionalmente fija una comisión propia para un producto (manda sobre la del productor).',
          'También puedes hacerlo desde la ficha del producto en Inventario, eligiendo el productor.',
          'Solo se puede cambiar un producto entre "propio" y "consignación" cuando no tiene stock ni costo promedio. La mercadería en consignación entra a bodega solo en cantidad, con costo 0, y no se compra: la factura del productor no se registra con el producto enlazado.',
        ]
      },
      {
        id: 'ventas-devengan',
        title: 'Cómo se devenga lo que se le debe al productor',
        steps: [
          'Cada vez que se emite una factura o boleta (en Ventas o en el POS) con productos en consignación, el sistema registra la venta del productor con la comisión vigente en ese momento: después, cambiar la comisión no altera lo ya vendido.',
          'Una nota de crédito o la anulación del documento descuenta lo que se le debía al productor. Si esa venta ya estaba en una liquidación en borrador, se descuenta ahí; si ya estaba confirmada o pagada, queda como ajuste para la liquidación siguiente.',
        ]
      },
      {
        id: 'armar-liquidacion',
        title: 'Armar, confirmar y pagar una liquidación',
        steps: [
          'En el listado de liquidaciones, pulsa "Armar liquidación", elige el productor y el período (desde/hasta, ambos días incluidos) y revisa el detalle por línea.',
          'En borrador puedes descartarla: las ventas vuelven a quedar pendientes.',
          'Al confirmarla se crea la cuenta por pagar al productor por el total que él debe facturarte (neto, exento e IVA). Regístrala y págala desde Tesorería, en Cuentas por pagar.',
          'Cuando el pago esté registrado, vuelve a la liquidación y márcala como pagada.',
        ]
      },
    ]
  },
  ...INICIO_SECTIONS,
  ...ADMINISTRACION_SECTIONS,
  ...GESTION_SECTIONS,
  ...VENTAS_SECTIONS,
  ...COMPRAS_SECTIONS,
  ...INVENTARIO_SECTIONS,
  { id: 'inventory-mobile', chapter: 'Inventario', key: 'hasInventory', permission: 'products:read', title: 'Bodega móvil', summary: 'Registrar inventario con el teléfono y sincronizar los pendientes al recuperar conexión.', route: '/bodega', topics: [
    { id: 'preparar', title: 'Preparar el teléfono antes de entrar a bodega', steps: ['Abre Bodega móvil con conexión e inicia sesión en tu empresa.', 'Pulsa Actualizar para descargar productos, bodegas y existencias.', 'Pulsa Preparar lectura sin señal para guardar la lectura local de etiquetas y la pantalla en este teléfono.'] },
    { id: 'capturar', title: 'Registrar con cámara o búsqueda', steps: ['Elige Entrar, Sacar, Contar o Consultar.', 'Busca el producto o escanea su código. La foto de etiqueta se procesa en el teléfono; confirma lote, vencimiento y cantidad.', 'Confirma para guardar el registro localmente y continuar con el siguiente producto. Sin señal queda pendiente; al volver la conexión se sincroniza con Aether.'] },
    { id: 'revisar', title: 'Revisar ajustes, conteos y mermas', permission: 'inventory:approve', route: '/dashboard/inventory/mobile', steps: ['Abre la revisión de bodega móvil.', 'Verifica los datos y escribe el motivo antes de aprobar o rechazar. Un conflicto de stock requiere una captura nueva.'] },
  ] },
  ...OPERACIONES_SECTIONS,
  ...FINANZAS_SECTIONS,
  ...EVENTOS_SECTIONS,
  // Orden estable: dentro de un capítulo se respeta el orden de cada archivo.
].sort((a, b) => MANUAL_CHAPTERS.indexOf(a.chapter) - MANUAL_CHAPTERS.indexOf(b.chapter));

/**
 * `'role'`: lo que ESTE usuario puede abrir (módulo contratado + permiso) —
 * es lo que ve por defecto en pantalla y lo que conoce el asistente.
 * `'company'`: todo lo contratado por la empresa, sin filtrar por rol — el
 * manual completo para capacitar al equipo. Ninguno de los dos incluye
 * módulos que la empresa no contrató.
 */
export type ManualScope = 'role' | 'company';

function sectionContracted(section: ManualSection, features: CompanyFeatureFlags): boolean {
  if (section.key !== 'always' && !features[section.key]) return false;
  if (section.anyOfFeatures && !section.anyOfFeatures.some((key) => features[key])) return false;
  return true;
}

function sectionAllowed(section: ManualSection, permissions: readonly Permission[]): boolean {
  if (section.permission && !permissions.includes(section.permission)) return false;
  if (section.anyOfPermissions && !section.anyOfPermissions.some((permission) => permissions.includes(permission))) return false;
  return true;
}

/**
 * Secciones visibles: siempre solo las de módulos contratados; con
 * `permissions`, además, solo las que el usuario puede abrir y, dentro de
 * ellas, solo los temas que su rol puede hacer. Omitir `permissions` es el
 * manual de la empresa completo (todo lo contratado, todos los temas).
 */
export function getVisibleManualSections(features: CompanyFeatureFlags, permissions?: readonly Permission[]): ManualSection[] {
  return MANUAL_SECTIONS.filter((section) => sectionContracted(section, features))
    .filter((section) => !permissions || sectionAllowed(section, permissions))
    .map((section) => (permissions ? { ...section, topics: visibleTopics(section.topics, permissions) } : section))
    .filter((section) => section.topics.length > 0);
}

function visibleTopics(topics: ManualTopic[], permissions: readonly Permission[]): ManualTopic[] {
  return topics.filter((topic) => !topic.permission || permissions.includes(topic.permission));
}

/** Atajo con el alcance explícito (pantalla del manual y descarga Word). */
export function getManualSections(scope: ManualScope, features: CompanyFeatureFlags, permissions: readonly Permission[]): ManualSection[] {
  return getVisibleManualSections(features, scope === 'role' ? permissions : undefined);
}

/** Captura de una sección (o `null` si es conceptual y no tiene). */
export function sectionScreenshot(section: Pick<ManualSection, 'id' | 'screenshot'>): string | null {
  if (section.screenshot === null) return null;
  return section.screenshot ?? `/manual/screenshots/${section.id}.jpg`;
}

/** Todas las rutas que documenta una sección: la suya y las de sus temas. */
export function sectionRoutes(section: ManualSection): string[] {
  return [...new Set([section.route, ...section.topics.flatMap((topic) => (topic.route ? [topic.route] : []))])];
}

/**
 * La sección del manual que documenta la pantalla `path` (la de ruta más
 * específica entre la de la sección y las de sus temas). Con ella el
 * tutorial ofrece "Leer el manual de este módulo" y el asistente propone
 * preguntas sobre la pantalla actual.
 */
export function findManualSectionForPath(path: string, sections: readonly ManualSection[] = MANUAL_SECTIONS): ManualSection | null {
  return findByLongestRoute(sections, sectionRoutes, path);
}

export { normalizeSearch, searchManual } from './search';
