/**
 * Texto comercial compartido por la landing y sus datos estructurados
 * (JSON-LD). Vive aquí para que la respuesta que ve Google sea, palabra por
 * palabra, la que ve la persona en pantalla.
 */

import { PACKAGES, type PackageName } from '@/lib/pricing/catalog';

export const faqs: [question: string, answer: string][] = [
  ['¿Cuánto cuesta y cómo lo contrato?', 'Parte desde 0,86 UF + IVA al mes con el Core, y los paquetes Gestión, Completo y Eventos suman módulos con descuento. Los precios son en UF y se facturan en pesos al valor de la UF del día. Cada módulo también se contrata por separado; pide tu cotización en el formulario y revisa la propuesta antes de contratar.'],
  ['¿Qué incluye Aether ERP?', 'Aether reúne gestión comercial, inventario, compras, tesorería, contabilidad y producción de certámenes y eventos. Los módulos disponibles para tu empresa dependen de su configuración y de los servicios contratados.'],
  ['¿Está preparado para empresas chilenas?', 'Incluye RUT, IVA, folios CAF, timbre electrónico y reportes como F29. La firma digital y el envío automático al SII todavía no están disponibles. Revisa con nuestro equipo el alcance tributario y la configuración que necesita tu empresa antes de contratar.'],
  ['¿Puedo traer los datos que ya tengo?', 'Sí. Puedes cargar productos, clientes, proveedores, stock inicial e historial de ventas y compras desde planillas Excel o CSV. La carga revisa los datos antes de confirmarlos, así que no empiezas de cero ni digitas todo de nuevo.'],
  ['¿Quién puede ver la información de mi empresa?', 'Solo las personas que invites, con el acceso que les asignes. Cada consulta queda acotada a tu empresa, las contraseñas se guardan cifradas y las acciones relevantes quedan registradas para auditoría.'],
  ['¿Puedo llevarme mis datos si me voy?', 'Sí. Cualquier persona con el permiso de exportación puede descargar la información completa de la empresa en formato JSON, sin contraseñas ni credenciales en el archivo.'],
];

export interface TrustFact {
  title: string;
  text: string;
}

/**
 * Reemplaza a los testimonios: sin clientes que citar todavía, la prueba de
 * confianza son hechos verificables del producto (cada uno debe poder
 * comprobarse leyendo el código, no una promesa de marketing).
 */
export const trustFacts: TrustFact[] = [
  { title: 'Timbre electrónico verificable', text: 'Cada DTE se firma con la llave del propio CAF y se puede comprobar sin conexión.' },
  { title: 'Respaldo completo por empresa', text: 'Exporta toda tu información en un archivo JSON, sin contraseñas ni credenciales.' },
  { title: 'Registro de auditoría', text: 'Las acciones que importan quedan con fecha, autor y detalle.' },
  { title: 'Datos cifrados de fábrica', text: 'Contraseñas con bcrypt y folios CAF con AES-256-GCM: nunca en texto plano.' },
];

/*
 * ── Textos restaurados para /landing-v2 ──────────────────────────────────
 * Salieron de `/` en el commit 60927e9 (rediseño de la landing), pero la
 * landing cinematográfica los usa. Se copiaron palabra por palabra desde
 * 60927e9^ (Plans en content.ts, los pares de Shift.tsx y las tarjetas de
 * resultados de Landing.tsx): no reescribirlos sin revisar ambas landings.
 */

export interface Plan {
  name: string;
  audience: string;
  /**
   * Precio mensual en UF, sin IVA. Sale de `PACKAGES` (src/lib/pricing/catalog.ts):
   * lo que se publica en el landing es una oferta comercial, así que no se
   * escribe aquí a mano.
   */
  priceUf: number;
  /** Usuarios y empresas (RUT) que incluye. */
  scope: string;
  featured?: boolean;
  includes: string[];
}

const scopeOf = (name: PackageName) => {
  const { maxUsers, companies } = PACKAGES[name];
  return `${maxUsers} usuarios · ${companies} ${companies === 1 ? 'empresa (RUT)' : 'empresas (RUT)'}`;
};

export const plans: Plan[] = [
  {
    name: 'Core',
    audience: PACKAGES.Core.audience,
    priceUf: PACKAGES.Core.priceUf,
    scope: scopeOf('Core'),
    includes: [
      'Ventas, cotizaciones, clientes y proveedores',
      'Inventario y catálogo con costo PMP',
      'Compras y recepción de mercadería',
      'Tareas y delegación del equipo',
      'Reportes en Excel',
    ],
  },
  {
    name: 'Gestión',
    audience: PACKAGES.Gestión.audience,
    priceUf: PACKAGES.Gestión.priceUf,
    scope: scopeOf('Gestión'),
    includes: [
      'Todo lo del Core',
      'Producción con recetas y órdenes',
      'Tesorería y cobranzas',
      'CRM comercial y presupuestos',
      'Fidelización, calidad e Inteligencia 360',
    ],
  },
  {
    name: 'Completo',
    audience: PACKAGES.Completo.audience,
    priceUf: PACKAGES.Completo.priceUf,
    scope: scopeOf('Completo'),
    featured: true,
    includes: [
      'Todo lo de Gestión',
      'Contabilidad con F29',
      'Remuneraciones y activo fijo',
      'Rendición de gastos y multibodega',
      'Agentes de IA, honorarios y organigrama',
    ],
  },
  {
    name: 'Eventos',
    audience: PACKAGES.Eventos.audience,
    priceUf: PACKAGES.Eventos.priceUf,
    scope: scopeOf('Eventos'),
    includes: [
      'Todo lo del Core',
      'Escaleta en vivo, vestuario y acreditaciones QR',
      'Auspicios, candidatas y jurado con escrutinio',
      'Venta de entradas y votación del público',
      'Cuotas, pagarés y honorarios',
    ],
  },
];

export interface Outcome {
  label: string;
  title: [first: string, second: string];
  text: string;
  link: string;
  /** Índice de la vista de `catalog.ts` que abre el enlace en #plataforma. */
  view: number;
}

/** Tarjetas de «QUE TU SISTEMA TRABAJE CONTIGO». */
export const outcomes: Outcome[] = [
  { label: 'VENDE CON CONTEXTO', title: ['Una venta.', 'Toda la historia.'], text: 'Revisa el cliente, el documento y sus pagos sin reconstruir la operación entre archivos.', link: 'Conoce el área comercial', view: 1 },
  { label: 'ANTICIPA TU OPERACIÓN', title: ['El stock correcto.', 'La decisión a tiempo.'], text: 'Consulta existencias, movimientos y costos por bodega para preparar tu próxima compra.', link: 'Explora el inventario', view: 2 },
  { label: 'MIRA HACIA ADELANTE', title: ['Conoce tu caja.', 'Planifica lo que viene.'], text: 'Ten a la vista cobros, pagos y vencimientos para decidir con el panorama financiero completo.', link: 'Descubre las finanzas', view: 3 },
];
