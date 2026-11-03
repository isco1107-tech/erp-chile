/** `id` es también el id de la app en `registry.ts` (de ahí salen su ícono y su nombre en el teléfono). */
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
    format: 'Windows, Mac y Linux · también instalable en tablet y teléfono',
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
    eyebrow: 'SELLERS EN CONSIGNACIÓN',
    href: '/proveedor/cuenta',
    description:
      'Para quien deja sus productos a la venta en tu tienda (consignación): sus ventas, existencias, mermas y liquidaciones, según los accesos que le dio cada empresa.',
    format: 'Instalable · se entra con la invitación que envía la tienda',
    features: [
      'Identidad propia',
      'Datos de su empresa',
      'Consulta de consignación',
    ],
  },
] as const;
