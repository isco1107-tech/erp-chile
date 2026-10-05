import type { FeatureKey } from '@/lib/auth/modules';

/**
 * Tarifario público de Aether para empresas que ya son clientes: lo que se
 * muestra en Configuración → Planes y módulos.
 *
 * Los montos salen del presupuesto de la plataforma (hoja «Módulos», columna
 * «Precio propuesto», y hoja «Planes», fila «Precio del plan»). Son CLP
 * mensuales SIN IVA. Aquí NUNCA van costos, márgenes ni supuestos internos:
 * este archivo viaja al navegador de cada cliente.
 *
 * Cambiar un precio es editar este archivo (y nada más): la pantalla, la
 * cotización que se calcula en el servidor y el correo a ventas lo leen de aquí.
 */

export type PricingCategory =
  | 'Núcleo comercial'
  | 'Finanzas'
  | 'Personas y gestión'
  | 'Inteligencia y web'
  | 'Certámenes y eventos';

export const PRICING_CATEGORIES: readonly PricingCategory[] = [
  'Núcleo comercial',
  'Finanzas',
  'Personas y gestión',
  'Inteligencia y web',
  'Certámenes y eventos',
];

export interface PricedModule {
  /** Id estable del ítem (viaja en la solicitud). */
  id: string;
  label: string;
  category: PricingCategory;
  /** CLP/mes + IVA. */
  price: number;
  /** Módulos de `CompanyFeatures` que se activan al contratarlo. */
  grants: FeatureKey[];
  /** Qué resuelve, en una línea. */
  summary: string;
}

/** Plataforma base: todos los clientes la tienen; se muestra como referencia. */
export const BASE_PLATFORM = { price: 14990, includedUsers: 2 } as const;

/** Usuario adicional por sobre los incluidos. */
export const EXTRA_USER_PRICE = 2990;

export const PRICED_MODULES: readonly PricedModule[] = [
  { id: 'pos', label: 'Punto de Venta (POS)', category: 'Núcleo comercial', price: 9990, grants: ['hasPos'], summary: 'Terminal de mostrador, arqueo de caja por turno y ticket térmico.' },
  { id: 'purchases', label: 'Compras y Proveedores', category: 'Núcleo comercial', price: 8990, grants: ['hasPurchases'], summary: 'Solicitudes, órdenes de compra, recepción y facturas de proveedor.' },
  { id: 'warehouses', label: 'Multibodega', category: 'Núcleo comercial', price: 6990, grants: ['hasMultipleWarehouses'], summary: 'Más de una bodega y transferencias entre ellas.' },
  { id: 'manufacturing', label: 'Producción', category: 'Núcleo comercial', price: 14990, grants: ['hasProduction'], summary: 'Recetas y órdenes de producción que consumen insumos y dejan el producto terminado a su costo real.' },
  { id: 'service-desk', label: 'Servicio Técnico', category: 'Núcleo comercial', price: 9990, grants: ['hasServiceDesk'], summary: 'Órdenes de servicio con diagnóstico y presupuesto que el cliente aprueba desde su enlace.' },
  { id: 'treasury', label: 'Tesorería y Cobranzas', category: 'Finanzas', price: 9990, grants: ['hasTreasury'], summary: 'Cuentas por cobrar y pagar, pagos y flujo de caja.' },
  { id: 'accounting', label: 'Contabilidad', category: 'Finanzas', price: 17990, grants: ['hasAccounting'], summary: 'Asientos automáticos, libro diario y mayor, balance y cierre mensual.' },
  { id: 'reports', label: 'Reportes Avanzados', category: 'Finanzas', price: 6990, grants: ['hasAdvancedReports'], summary: 'Libro Excel con F29 estimado, márgenes y Kardex valorizado.' },
  { id: 'budgets', label: 'Presupuestos', category: 'Finanzas', price: 6990, grants: ['hasBudgets'], summary: 'Presupuesto operativo por categoría, real vs. planificado.' },
  { id: 'fixed-assets', label: 'Activo Fijo', category: 'Finanzas', price: 5990, grants: ['hasFixedAssets'], summary: 'Bienes de uso con depreciación lineal o acelerada.' },
  { id: 'expenses', label: 'Rendición de Gastos', category: 'Finanzas', price: 6990, grants: ['hasExpenseReports'], summary: 'Cada colaborador rinde sus gastos; jefatura aprueba y finanzas registra el reembolso.' },
  { id: 'installments', label: 'Cuotas y Mensualidades', category: 'Finanzas', price: 9990, grants: ['hasInstallmentPlans'], summary: 'Planes de cuotas, multa por atraso y recordatorio por correo.' },
  { id: 'promissory-notes', label: 'Pagarés', category: 'Finanzas', price: 3990, grants: ['hasPromissoryNotes'], summary: 'Pagarés de clientes o candidatas, con seguimiento de pago y vencimiento.' },
  { id: 'crm', label: 'CRM Comercial', category: 'Personas y gestión', price: 9990, grants: ['hasSalesPipeline'], summary: 'Embudo de oportunidades y seguimiento.' },
  { id: 'tasks', label: 'Tareas y Delegación', category: 'Personas y gestión', price: 4990, grants: ['hasTeamTasks'], summary: 'Tareas con responsable y recurrencia.' },
  { id: 'org-chart', label: 'Organigrama', category: 'Personas y gestión', price: 2990, grants: ['hasOrgChart'], summary: 'Ficha de staff con foto, cargo y jerarquía de reporte.' },
  { id: 'multi-company', label: 'Multiempresa (por empresa extra)', category: 'Personas y gestión', price: 14990, grants: ['hasMultiCompany'], summary: 'Administra más de una empresa con el mismo acceso.' },
  { id: 'payroll', label: 'Personas y Remuneraciones', category: 'Personas y gestión', price: 12990, grants: ['hasPayroll'], summary: 'Trabajadores, liquidaciones de sueldo y vacaciones.' },
  { id: 'quality', label: 'Calidad y Procedimientos', category: 'Personas y gestión', price: 9990, grants: ['hasQuality'], summary: 'Procedimientos con acuse de lectura e inspecciones.' },
  { id: 'customer-care', label: 'Fidelización y Clientes', category: 'Personas y gestión', price: 6990, grants: ['hasCustomerCare'], summary: 'Encuestas CSAT/NPS y seguimiento de clientes inactivos.' },
  { id: 'intelligence', label: 'Centro de Inteligencia 360', category: 'Inteligencia y web', price: 14990, grants: ['hasIntelligence'], summary: 'Salud de la empresa, caja a 13 semanas y flujos del negocio.' },
  { id: 'agents', label: 'Agentes de IA (equipo ejecutivo)', category: 'Inteligencia y web', price: 9990, grants: ['hasCrm'], summary: 'Equipo ejecutivo virtual que analiza tus datos y recomienda.' },
  { id: 'web-sites', label: 'Sitios Web (por sitio)', category: 'Inteligencia y web', price: 9990, grants: ['hasWebSites'], summary: 'Constructor de sitios web con formulario de contacto.' },
  { id: 'event-projects', label: 'Eventos y Proyectos', category: 'Certámenes y eventos', price: 19990, grants: ['hasEventProjects'], summary: 'Certámenes con centro de mando, micrositio y afiches.' },
  { id: 'candidates', label: 'Candidatas y Staff', category: 'Certámenes y eventos', price: 14990, grants: ['hasCandidates'], summary: 'Ficha de candidatas y staff de producción por certamen.' },
  { id: 'sponsorships', label: 'Auspicios y Marcas', category: 'Certámenes y eventos', price: 14990, grants: ['hasSponsorships'], summary: 'Tarifario de auspicios y contratos con entregables.' },
  { id: 'live-production', label: 'Producción en Vivo', category: 'Certámenes y eventos', price: 14990, grants: ['hasLiveProduction'], summary: 'Escaleta en vivo, vestuario y acreditación.' },
  { id: 'judging', label: 'Votación y Escrutinio', category: 'Certámenes y eventos', price: 12990, grants: ['hasJudging'], summary: 'Jurados por enlace y planillas de puntuación.' },
  { id: 'ticketing-voting', label: 'Entradas y votación del público', category: 'Certámenes y eventos', price: 9990, grants: ['hasTicketing', 'hasPublicVoting'], summary: 'Venta de entradas con control de acceso por QR y votación pagada del público; el pago lo confirma tu equipo.' },
];

/** Módulos que vienen con la plataforma base: se muestran, no se cotizan. */
export const INCLUDED_IN_BASE: readonly { label: string; grants: FeatureKey[] }[] = [
  { label: 'Inventario y Catálogo', grants: ['hasInventory'] },
  { label: 'Costeo PMP', grants: ['hasPmpCosting'] },
];

export type PlanId = 'comercio' | 'gestion' | 'eventos' | 'total';

export interface PricingPlan {
  id: PlanId;
  label: string;
  /** CLP/mes + IVA. */
  price: number;
  includedUsers: number;
  /** Ids de `PRICED_MODULES` que trae el plan (además de la plataforma base). */
  moduleIds: string[];
  tagline: string;
}

export const PRICING_PLANS: readonly PricingPlan[] = [
  { id: 'comercio', label: 'Comercio', price: 32990, includedUsers: 3, moduleIds: ['pos', 'purchases'], tagline: 'Punto de venta y compras con proveedores.' },
  {
    id: 'gestion',
    label: 'Gestión',
    price: 84990,
    includedUsers: 8,
    moduleIds: ['pos', 'purchases', 'warehouses', 'treasury', 'accounting', 'reports', 'budgets', 'crm'],
    tagline: 'Comercio más finanzas, contabilidad y seguimiento comercial.',
  },
  {
    id: 'eventos',
    label: 'Eventos',
    price: 119990,
    includedUsers: 10,
    moduleIds: ['installments', 'promissory-notes', 'crm', 'event-projects', 'candidates', 'sponsorships', 'live-production', 'judging', 'ticketing-voting'],
    tagline: 'Todo para producir un certamen, de la postulación a la gala.',
  },
  {
    id: 'total',
    label: 'Total',
    price: 229990,
    includedUsers: 25,
    moduleIds: PRICED_MODULES.map((m) => m.id),
    tagline: 'Todos los módulos, para operar sin límites de áreas.',
  },
];

/**
 * Módulos de `CompanyFeatures` que existen en el producto pero NO se venden ni
 * entran en ningún plan por ahora:
 * - `hasDteBilling` (Facturación Electrónica): se retira de la oferta mientras
 *   no exista la integración con el SII. Sigue siendo el flag que habilita
 *   Ventas y Folios, así que el superadmin puede encenderlo a mano.
 * - `hasFeeDocuments` (Boletas de Honorarios): fuera de la oferta comercial.
 */
export const UNPRICED_FEATURES: readonly FeatureKey[] = ['hasDteBilling', 'hasFeeDocuments', 'hasAcademy'];
