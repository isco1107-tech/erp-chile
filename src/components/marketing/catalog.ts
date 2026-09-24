import {
  BarChart3, Boxes, CalendarDays, FileCheck2, Landmark, Layers3, Monitor,
  ReceiptText, ShoppingCart, Ticket, UsersRound, WalletCards,
} from 'lucide-react';
import type { ProductMockView } from './ProductMock';

/**
 * Vistas del producto y familias de módulos que muestran las dos landings
 * (`/` y `/landing-v2`). Viven fuera de `Landing.tsx` porque ese archivo es
 * `'use client'`: un componente de servidor que importara de ahí recibiría
 * una referencia de cliente en vez del arreglo.
 */
export const views = [
  { label: 'Visión general', image: 'dashboard' as ProductMockView, title: 'La perspectiva que tu negocio necesita.', description: 'Reúne ventas, costos, cobranza e inventario en un panel ejecutivo. Identifica lo que requiere atención y decide con tus datos a la vista.', icon: BarChart3, points: ['Indicadores del negocio', 'Alertas de inventario', 'Seguimiento de documentos'] },
  { label: 'Ventas', image: 'sales' as ProductMockView, title: 'Cada venta, de principio a fin.', description: 'Conecta clientes, documentos y pagos. Mantén el historial comercial a mano y da seguimiento a cada operación desde el mismo lugar.', icon: ReceiptText, points: ['Documentos y estados de pago', 'Historial por cliente', 'Control de folios y DTE'] },
  { label: 'Inventario', image: 'inventory' as ProductMockView, title: 'Conoce lo que tienes. Y lo que cuesta.', description: 'Controla existencias, movimientos y valorización por bodega. Anticipa faltantes y trabaja con costos promedio ponderados.', icon: Boxes, points: ['Stock por bodega', 'Kardex de movimientos', 'Valorización PMP'] },
  { label: 'Finanzas', image: 'treasury' as ProductMockView, title: 'Una mirada clara a tu caja.', description: 'Organiza cuentas por cobrar y pagar, revisa vencimientos y proyecta el flujo de caja para planificar el siguiente paso.', icon: WalletCards, points: ['Cobranza y vencimientos', 'Cuentas por pagar', 'Flujo de caja proyectado'] },
  { label: 'Certámenes', image: 'projects' as ProductMockView, title: 'De la planificación al gran día.', description: 'Coordina certámenes y su producción con el respaldo de tu operación financiera. Lleva presupuestos, auspicios y equipos bajo un mismo contexto.', icon: Ticket, points: ['Proyectos y presupuestos', 'Auspicios y producción', 'Ticketing y acreditaciones'] },
];

export const moduleGroups = [
  { name: 'Comercial y operación', modules: [
    { title: 'Ventas y facturación', text: 'Documentos comerciales, DTE, folios y seguimiento de pagos.', icon: ReceiptText },
    { title: 'Compras', text: 'Órdenes, recepción de productos y control por proveedor.', icon: ShoppingCart },
    { title: 'Inventario y bodegas', text: 'Existencias, kardex, costos PMP y alertas de stock.', icon: Boxes },
    { title: 'Clientes y proveedores', text: 'Contactos, historial comercial y límites de crédito.', icon: UsersRound },
    { title: 'Punto de venta', text: 'Una experiencia dedicada a las ventas del día a día.', icon: Monitor },
  ] },
  { name: 'Finanzas y control', modules: [
    { title: 'Tesorería', text: 'Cuentas por cobrar y pagar con sus vencimientos a la vista.', icon: WalletCards },
    { title: 'Contabilidad', text: 'Asientos, estados financieros y cierre mensual.', icon: Landmark },
    { title: 'Flujo de caja', text: 'Proyecciones para anticipar compromisos y necesidades de caja.', icon: BarChart3 },
    { title: 'Reportes', text: 'Información financiera y exportaciones a Excel.', icon: FileCheck2 },
    { title: 'Planes de pago', text: 'Cuotas, compromisos y seguimiento de cobranza.', icon: CalendarDays },
  ] },
  { name: 'Certámenes y producción', modules: [
    { title: 'Proyectos', text: 'Planificación, presupuestos y seguimiento por certamen.', icon: Layers3 },
    { title: 'Producción', text: 'Escaleta en vivo, vestuario y coordinación operativa.', icon: CalendarDays },
    { title: 'Auspicios', text: 'Marcas, contratos y compromisos de cada auspiciador.', icon: FileCheck2 },
    { title: 'Ticketing', text: 'Gestión de entradas y acceso público a la venta.', icon: Ticket },
    { title: 'Jurados y votaciones', text: 'Evaluaciones y votación con portales dedicados.', icon: UsersRound },
  ] },
];
