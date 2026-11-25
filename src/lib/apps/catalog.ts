import type { AppId } from './registry';

interface CatalogEntry {
  id: AppId;
  name: string;
  audience: string;
  description: string;
  devices: string;
  action: string;
}

export const APP_CATALOG = [
  {
    id: 'control',
    name: 'Aether Control',
    audience: 'Para dueños de empresa',
    description: 'Consulta las ventas, los cobros y las cajas abiertas de tu empresa.',
    devices: 'Celular, tablet y computador',
    action: 'Abrir Control',
  },
  {
    id: 'pos',
    name: 'Aether POS',
    audience: 'Para cajeros',
    description: 'Abre tu caja, registra ventas e imprime boletas. Revisa tus ingresos y retiros antes de cerrar el turno.',
    devices: 'Computador, tablet y celular',
    action: 'Abrir POS',
  },
  {
    id: 'bodega',
    name: 'Bodega móvil',
    audience: 'Para equipos de bodega',
    description: 'Escanea productos, recibe mercadería y traslada stock. Los envíos pendientes se guardan si pierdes conexión.',
    devices: 'Android y iPhone · también en navegador',
    action: 'Abrir Bodega',
  },
  {
    id: 'seller',
    name: 'Seller Center',
    audience: 'Para proveedores',
    description: 'Consulta ventas, existencias y mermas de los productos que entregas en consignación.',
    devices: 'Celular, tablet y computador',
    action: 'Abrir Seller Center',
  },
] as const satisfies readonly CatalogEntry[];
