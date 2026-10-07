import { PRICED_MODULES, PRICING_CATEGORIES, type PricingCategory } from '@/lib/pricing/catalog';

/**
 * Vitrina de módulos de la landing (`/#modulos`) y sus páginas propias
 * (`/modulos/[slug]`). Cada tarjeta es un ítem cotizable del tarifario
 * (`PRICED_MODULES`) o algo que ya viene con la plataforma base; el título, la
 * categoría y la descripción corta salen del tarifario, así que un cambio de
 * nombre se ve igual en la landing, en Configuración → Planes y en el correo a
 * ventas.
 *
 * Lo que la página del módulo muestra («cómo funciona») sale de las secciones
 * del manual (`src/modules/manual/sections/`): capturas reales y pasos
 * verificados contra la pantalla. Aquí solo se dice qué secciones le tocan a
 * cada módulo. `tests/module-showcase.test.ts` exige que todo módulo vendible
 * tenga su tarjeta y que cada sección exista.
 *
 * Solo se usa en el servidor: importa el tarifario, que trae precios, y la
 * landing no los publica. Los componentes de cliente reciben datos planos
 * (`ShowcaseCard`, ver `module-showcase-content.ts`).
 */

export const INCLUDED_CATEGORY = 'Incluido en la base';
export type ShowcaseCategory = PricingCategory | typeof INCLUDED_CATEGORY;

/** Orden de las categorías en la vitrina: primero lo que trae toda empresa. */
export const SHOWCASE_CATEGORIES: readonly ShowcaseCategory[] = [INCLUDED_CATEGORY, ...PRICING_CATEGORIES];

export interface ShowcaseModule {
  /** Ruta pública `/modulos/<slug>`: estable, en español y sin acentos. */
  slug: string;
  /** Id del ítem en `PRICED_MODULES`; `null` = incluido en la plataforma base (no se cotiza aparte). */
  pricedId: string | null;
  title: string;
  category: ShowcaseCategory;
  summary: string;
  /** Ids de secciones del manual, en orden de lectura; la primera con captura es la portada. */
  sections: readonly string[];
  /** Portada explícita cuando ninguna sección propia tiene captura. */
  cover?: string;
}

interface PricedEntry {
  slug: string;
  pricedId: string;
  sections: readonly string[];
  cover?: string;
}

/** Un ítem del tarifario por fila, en el orden del tarifario. */
const PRICED_ENTRIES: readonly PricedEntry[] = [
  { slug: 'punto-de-venta', pricedId: 'pos', sections: ['punto-de-venta'] },
  { slug: 'compras-y-proveedores', pricedId: 'purchases', sections: ['compras', 'solicitudes-de-compra', 'importaciones', 'dte-recibidos', 'archivo-de-facturas'] },
  { slug: 'multibodega', pricedId: 'warehouses', sections: ['catalogo-inventario'] },
  { slug: 'produccion', pricedId: 'manufacturing', sections: ['produccion'] },
  { slug: 'servicio-tecnico', pricedId: 'service-desk', sections: ['servicio-tecnico'] },
  { slug: 'tesoreria-y-cobranzas', pricedId: 'treasury', sections: ['tesoreria', 'cobranza', 'bancos-conciliacion', 'cheques', 'nominas-de-pago'] },
  { slug: 'contabilidad', pricedId: 'accounting', sections: ['contabilidad'] },
  { slug: 'reportes-avanzados', pricedId: 'reports', sections: ['reportes-f29', 'rcv'] },
  { slug: 'presupuestos', pricedId: 'budgets', sections: ['presupuestos'] },
  { slug: 'activo-fijo', pricedId: 'fixed-assets', sections: ['activo-fijo'] },
  { slug: 'rendicion-de-gastos', pricedId: 'expenses', sections: ['rendicion-de-gastos'] },
  { slug: 'cuotas-y-mensualidades', pricedId: 'installments', sections: ['cuotas'] },
  { slug: 'pagares', pricedId: 'promissory-notes', sections: ['pagares'] },
  { slug: 'crm-comercial', pricedId: 'crm', sections: ['crm'] },
  { slug: 'tareas-y-delegacion', pricedId: 'tasks', sections: ['tareas'] },
  { slug: 'organigrama', pricedId: 'org-chart', sections: ['organigrama'] },
  // La sección del manual es conceptual (sin captura): la portada es el panel, con el selector de empresa arriba a la izquierda.
  { slug: 'multiempresa', pricedId: 'multi-company', sections: ['multiempresa'], cover: '/manual/screenshots/primeros-pasos.jpg' },
  { slug: 'remuneraciones', pricedId: 'payroll', sections: ['remuneraciones'] },
  { slug: 'calidad-y-procedimientos', pricedId: 'quality', sections: ['calidad'] },
  { slug: 'fidelizacion-de-clientes', pricedId: 'customer-care', sections: ['fidelizacion'] },
  { slug: 'inteligencia-360', pricedId: 'intelligence', sections: ['inteligencia-360'] },
  { slug: 'agentes-de-ia', pricedId: 'agents', sections: ['agentes'] },
  { slug: 'sitios-web', pricedId: 'web-sites', sections: ['sitios-web'] },
  { slug: 'eventos-y-certamenes', pricedId: 'event-projects', sections: ['certamenes', 'sitio-publico', 'calendario'] },
  { slug: 'candidatas-y-staff', pricedId: 'candidates', sections: ['candidatas', 'contratos-firmados'] },
  { slug: 'auspicios-y-marcas', pricedId: 'sponsorships', sections: ['auspicios'] },
  { slug: 'produccion-en-vivo', pricedId: 'live-production', sections: ['produccion-en-vivo'] },
  { slug: 'votacion-y-escrutinio', pricedId: 'judging', sections: ['jurado'] },
  { slug: 'entradas-y-votacion-del-publico', pricedId: 'ticketing-voting', sections: ['entradas', 'votacion-publico'] },
];

/** Lo que toda empresa recibe con la plataforma base: se muestra, no se cotiza. */
const INCLUDED_MODULES: readonly ShowcaseModule[] = [
  {
    slug: 'inventario-y-catalogo',
    pricedId: null,
    title: 'Inventario y Catálogo',
    category: INCLUDED_CATEGORY,
    summary: 'Productos, existencias por bodega, Kardex y costo PMP, con toma de inventario, lotes y etiquetas.',
    sections: ['catalogo-inventario', 'toma-de-inventario', 'lotes-vencimientos', 'etiquetas'],
  },
  {
    slug: 'plataforma-base',
    pricedId: null,
    title: 'Clientes, importación y automatizaciones',
    category: INCLUDED_CATEGORY,
    summary: 'Ficha de clientes y proveedores, carga masiva desde Excel, reglas automáticas y mensajería del equipo.',
    sections: ['clientes-proveedores', 'importacion-masiva', 'automatizaciones', 'mensajeria'],
  },
];

const PRICED_BY_ID = new Map(PRICED_MODULES.map((m) => [m.id, m]));

function fromCatalog(entry: PricedEntry): ShowcaseModule {
  const item = PRICED_BY_ID.get(entry.pricedId);
  if (!item) throw new Error(`Módulo de la vitrina sin precio en el tarifario: ${entry.pricedId}`);
  return { ...entry, title: item.label, category: item.category, summary: item.summary };
}

export const SHOWCASE_MODULES: readonly ShowcaseModule[] = [...INCLUDED_MODULES, ...PRICED_ENTRIES.map(fromCatalog)].sort(
  (a, b) => SHOWCASE_CATEGORIES.indexOf(a.category) - SHOWCASE_CATEGORIES.indexOf(b.category)
);

const BY_SLUG = new Map(SHOWCASE_MODULES.map((m) => [m.slug, m]));

export function findShowcaseModule(slug: string): ShowcaseModule | undefined {
  return BY_SLUG.get(slug);
}

/** Ids que se pueden agregar a una cotización (los del tarifario). */
export const QUOTABLE_MODULE_IDS: ReadonlySet<string> = new Set(PRICED_ENTRIES.map((e) => e.pricedId));
