export const APP_CATALOG = [
  {
    id: 'control',
    name: 'Aether Control',
    eyebrow: 'DIRECCIÓN',
    href: '/control',
    description:
      'Tu empresa de un vistazo: ventas, cobros, cajas y actividad reciente. Acceso exclusivo del dueño.',
    format: 'Instalable en teléfono y computador',
    features: [
      'Indicadores reales',
      'Actualización automática',
      'Cajas y movimientos',
    ],
  },
  {
    id: 'pos',
    name: 'Aether POS',
    eyebrow: 'MOSTRADOR',
    href: '/pos',
    description:
      'Un espacio de trabajo para cada cajero: apertura, venta, ingresos, retiros y cierre conectado al ERP.',
    format: 'Windows, Mac y Linux',
    features: ['Multicaja', 'Boletas e inventario', 'Arqueo por cajero'],
  },
  {
    id: 'bodega',
    name: 'Bodega móvil',
    eyebrow: 'OPERACIONES',
    href: '/bodega',
    description:
      'Recibe, identifica y mueve mercadería con el teléfono. Conserva los movimientos pendientes hasta confirmarlos.',
    format: 'Instalable en Android y iPhone',
    features: ['Cámara y códigos', 'Cola de envíos', 'Stock compartido'],
  },
  {
    id: 'seller',
    name: 'Seller Center',
    eyebrow: 'PROVEEDORES',
    href: '/proveedor/cuenta',
    description:
      'La cuenta del proveedor: sus ventas, existencias y mermas, según los accesos que le otorgó cada empresa.',
    format: 'Instalable con cuenta de proveedor',
    features: [
      'Identidad propia',
      'Datos de su empresa',
      'Consulta de consignación',
    ],
  },
] as const;

export const APP_OPPORTUNITIES = [
  {
    name: 'Portal del trabajador',
    reason:
      'Liquidaciones, solicitudes y avisos recurrentes justifican un acceso móvil propio.',
    prerequisite:
      'Crear ingreso personal persistente antes de reemplazar los enlaces privados.',
  },
  {
    name: 'Portal de clientes',
    reason:
      'Pedidos, documentos y pagos pueden reunirse en una app de autoservicio.',
    prerequisite:
      'Identidad de cliente y separación entre empresas; no instalar URLs con tokens como una app compartida.',
  },
  {
    name: 'Eventos y jurado',
    reason:
      'Acreditación y evaluación se benefician de accesos rápidos durante una jornada.',
    prerequisite:
      'Instalación por evento y rol, caducidad y protección de evaluaciones.',
  },
] as const;
