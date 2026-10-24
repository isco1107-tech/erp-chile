import crypto from 'crypto';
import { z } from 'zod';

/**
 * Seller Center: cuentas por persona del proveedor o productor (`/proveedor/cuenta`).
 * Funciones puras y constantes compartidas por el servidor y los formularios.
 *
 * Reglas:
 * - Los enlaces (invitación, recuperación) son 32 bytes al azar; en la base solo
 *   queda su SHA-256 y sirven una sola vez.
 * - El correo se guarda en minúsculas y sin espacios: es la identidad de la persona
 *   en toda la plataforma.
 */

export const INVITE_TTL_DAYS = 7;
export const RESET_TTL_MINUTES = 60;
/** Intentos fallidos seguidos antes de bloquear el ingreso, y por cuánto. */
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;
/** Duración máxima de una sesión del Seller Center (igual que la del panel). */
export const SESSION_HOURS = 8;
export const SUPPLIER_SESSION_COOKIE = 'supplier_session';

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export const accountEmailSchema = z
  .string()
  .trim()
  .max(254, 'El correo es demasiado largo')
  .email('Escribe un correo válido')
  .transform(normalizeEmail);

/** Enlace de un solo uso: el valor en claro va en el correo; se guarda solo su huella. */
export function newAccountToken(random: (size: number) => Uint8Array = crypto.randomBytes): string {
  return Buffer.from(random(32)).toString('base64url');
}

export function hashAccountToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Un token con forma válida (43 caracteres base64url). Lo demás ni se busca en la base. */
export function isWellFormedToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

// ─── Períodos (meses de Santiago) ────────────────────────────────────────────

/** `YYYY-MM` válido entre 2000 y 2100. */
export function isMonthKey(value: string | undefined | null): value is string {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return false;
  const [y, m] = value.split('-').map(Number) as [number, number];
  return y >= 2000 && y <= 2100 && m >= 1 && m <= 12;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Los últimos `count` meses hasta `current` (el más reciente primero). */
export function recentMonths(current: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(current, -i));
}

const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

// ─── Ventas del proveedor ────────────────────────────────────────────────────

export interface SalesLine {
  productId: string;
  /** Unidades: positivas en boletas y facturas, negativas en notas de crédito. */
  units: number;
  /** Neto cobrado (después del descuento de la línea, sin IVA), con el mismo signo. */
  net: number;
}

export interface ProductSales {
  productId: string;
  units: number;
  net: number;
  /** Precio neto promedio cobrado por unidad; `null` si no quedaron unidades vendidas. */
  averagePrice: number | null;
}

/**
 * Suma por producto lo vendido (boletas y facturas) menos lo devuelto (notas de crédito).
 * Solo se informan los productos con algo vendido o devuelto; el monto es entero (CLP).
 */
export function summarizeSales(lines: readonly SalesLine[]): { products: ProductSales[]; units: number; net: number } {
  const byProduct = new Map<string, { units: number; net: number }>();
  for (const line of lines) {
    const entry = byProduct.get(line.productId) ?? { units: 0, net: 0 };
    entry.units += line.units;
    entry.net += line.net;
    byProduct.set(line.productId, entry);
  }
  const products = [...byProduct.entries()]
    .map(([productId, entry]) => {
      const units = Math.round(entry.units * 1000) / 1000;
      return { productId, units, net: Math.round(entry.net), averagePrice: units > 0 ? Math.round(entry.net / units) : null };
    })
    .filter((entry) => entry.units !== 0 || entry.net !== 0)
    .sort((a, b) => b.net - a.net || b.units - a.units);
  return {
    products,
    units: Math.round(products.reduce((sum, entry) => sum + entry.units, 0) * 1000) / 1000,
    net: products.reduce((sum, entry) => sum + entry.net, 0),
  };
}

/**
 * Productos cuyas ventas se le muestran al proveedor: los que surte SOLO él. Un producto con
 * dos proveedores comparte un solo stock y una sola venta, y mostrarla sería mostrarle ventas
 * de otro productor.
 */
export function exclusiveProductIds(links: ReadonlyArray<{ productId: string; supplierCount: number }>): Set<string> {
  return new Set(links.filter((link) => link.supplierCount === 1).map((link) => link.productId));
}
