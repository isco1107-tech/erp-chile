/**
 * «Primeros pasos» de Inicio: lo mínimo para operar, calculado con datos
 * reales (nada se marca a mano) y solo con los módulos que la empresa tiene.
 * Reemplaza a la guía de configuración como lista de pendientes: la guía se
 * cerraba con un clic y no cubría lo esencial (el primer producto, la
 * primera venta, los folios). Pura: el servidor arma `FirstStepsInput`.
 */

export interface FirstStepsInput {
  features: { hasInventory: boolean; hasPos: boolean; hasDteBilling: boolean };
  company: { address: string | null; giro: string | null; comuna: string | null };
  /** Productos activos con precio de venta. */
  pricedProducts: number;
  issuedSales: number;
  /** Folios del SII cargados (CAF). */
  cafs: number;
  /** Personas además de quien mira: usuarios o invitaciones. */
  teammates: number;
}

export interface FirstStep {
  id: 'company' | 'product' | 'sale' | 'folios' | 'team';
  title: string;
  why: string;
  href: string;
  actionLabel: string;
  done: boolean;
}

export function firstSteps(input: FirstStepsInput): FirstStep[] {
  const steps: FirstStep[] = [
    {
      id: 'company',
      title: 'Completa los datos de tu empresa',
      why: 'Dirección, comuna y giro salen impresos en cada boleta y factura.',
      href: '/dashboard/settings/company',
      actionLabel: 'Completar datos',
      done: Boolean(input.company.address?.trim() && input.company.comuna?.trim() && input.company.giro?.trim()),
    },
  ];
  if (input.features.hasInventory) {
    steps.push({
      id: 'product',
      title: 'Carga tu primer producto con precio',
      why: 'Sin productos con precio no se puede vender en caja ni en la tienda.',
      href: '/dashboard/products',
      actionLabel: 'Ir al catálogo',
      done: input.pricedProducts > 0,
    });
  }
  if (input.features.hasPos || input.features.hasDteBilling) {
    steps.push({
      id: 'sale',
      title: 'Haz tu primera venta',
      why: input.features.hasPos ? 'Abre la caja con tu fondo de cambio y vende un producto: así compruebas que todo cuadra.' : 'Emite un documento de prueba para ver cómo queda.',
      href: input.features.hasPos ? '/pos' : '/dashboard/sales/new',
      actionLabel: input.features.hasPos ? 'Abrir el punto de venta' : 'Nueva venta',
      done: input.issuedSales > 0,
    });
  }
  if (input.features.hasDteBilling) {
    steps.push({
      id: 'folios',
      title: 'Carga los folios del SII (CAF)',
      why: 'Sin folios autorizados, lo que emites no tiene validez tributaria.',
      href: '/dashboard/settings/folios',
      actionLabel: 'Cargar folios',
      done: input.cafs > 0,
    });
  }
  steps.push({
    id: 'team',
    title: 'Invita a tu equipo',
    why: 'Cada persona con su propia cuenta: así cada venta y movimiento queda a su nombre.',
    href: '/dashboard/settings/users',
    actionLabel: 'Invitar',
    done: input.teammates > 0,
  });
  return steps;
}

/** Se muestra mientras quede algo pendiente. */
export function firstStepsPending(steps: FirstStep[]): number {
  return steps.filter((step) => !step.done).length;
}
