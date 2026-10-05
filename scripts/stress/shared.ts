/** Tipos y resguardos compartidos por el orquestador y los trabajadores de estrés. */

export interface StressFixture {
  runId: string;
  companyId: string;
  userId: string;
  warehouseId: string;
  customerId: string;
  supplierId: string;
  productHot: string;
  productA: string;
  productB: string;
  productPmp: string;
  /** Un producto distinto por operación: las ventas solo comparten el correlativo de folio. */
  productsMany: string[];
  idempotencyKey: string;
  invoiceId: string;
  paymentAmount: number;
  shiftId: string;
}

export interface OpResult {
  ok: boolean;
  ms: number;
  id?: string;
  error?: string;
  code?: string;
}

/**
 * La `DATABASE_URL` del `.env` del proyecto es la de PRODUCCIÓN (CLAUDE.md,
 * Sección 5). Una prueba de estrés escribe miles de documentos: solo puede
 * correr contra una base local.
 */
export function assertLocalDatabase(): void {
  let host = '';
  try {
    host = new URL(process.env.DATABASE_URL ?? '').hostname;
  } catch {
    // URL inválida: se trata igual que una remota.
  }
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    console.error('stress: solo corre contra una base LOCAL (DATABASE_URL apunta a otro host). Abortado.');
    process.exit(1);
  }
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)]!;
}

/** Agrupa mensajes de error parecidos (sin cifras ni ids) para el informe. */
export function errorKind(message: string | undefined): string {
  return (message ?? 'desconocido')
    .replace(/\(disponible: [^)]*\)/g, '(disponible: N)')
    .replace(/[0-9a-z]{20,}/gi, '<id>')
    .replace(/\d+/g, 'N')
    .slice(0, 140);
}
