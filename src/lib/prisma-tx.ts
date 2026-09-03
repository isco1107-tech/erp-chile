import type { Prisma } from '@prisma/client';

/**
 * Opciones para las transacciones que toman locks de fila (`SELECT ... FOR UPDATE`).
 *
 * Los defaults de Prisma son `maxWait: 2000` y `timeout: 5000`. Esas cifras
 * asumen transacciones que no compiten entre sí, pero acá el lock por producto
 * es justamente lo que serializa las ventas concurrentes del mismo SKU: la
 * segunda espera a la primera, la tercera a la segunda, y así. Contra una base
 * remota (Neon), con la latencia de red multiplicada por cada consulta dentro
 * de la transacción, la cuarta venta simultánea del mismo producto superaba los
 * 5 s y moría con "A query cannot be executed on an expired transaction" — una
 * venta rechazada en el mostrador, no un simple reintento.
 *
 * Subir el techo no debilita ninguna garantía: el lock sigue siendo el que
 * impone la correctitud, esto solo evita que la espera legítima se interprete
 * como una transacción colgada.
 */
export const LOCKING_TX_OPTIONS: { maxWait: number; timeout: number } = {
  // Espera por una conexión libre del pool.
  maxWait: 15_000,
  // Duración máxima de la transacción, ya con el lock tomado.
  timeout: 20_000,
};

/** Igual que arriba, para transacciones de escritura por lotes (importación masiva). */
export const BATCH_TX_OPTIONS: { maxWait: number; timeout: number } = {
  maxWait: 15_000,
  timeout: 60_000,
};

export type TransactionOptions = Prisma.TransactionClient extends never ? never : { maxWait: number; timeout: number };
