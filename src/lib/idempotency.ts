/**
 * Clave de idempotencia por INTENCIÓN de operación (venta, emisión).
 *
 * El servidor ya deduplica por `idempotencyKey` (`@@unique([companyId,
 * idempotencyKey])` en `SalesDocument`), pero la clave tiene que nacer en el
 * cliente: si la venta se confirmó y se perdió la respuesta, el reintento debe
 * mandar la MISMA clave para recibir el documento ya creado en vez de emitir
 * otro (doble cobro, doble descuento de stock).
 *
 * La clave se reutiliza mientras el contenido no cambie; si el usuario edita
 * el carrito entre un intento y otro, es una operación distinta y recibe una
 * clave nueva (reusar la anterior devolvería el documento viejo, con otras
 * líneas). `reset()` se llama tras confirmar con éxito.
 */
export interface IdempotencyTracker {
  keyFor(payload: unknown): string;
  reset(): void;
}

function randomKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createIdempotencyTracker(generate: () => string = randomKey): IdempotencyTracker {
  let current: { signature: string; key: string } | null = null;
  return {
    keyFor(payload: unknown): string {
      const signature = JSON.stringify(payload);
      if (!current || current.signature !== signature) current = { signature, key: generate() };
      return current.key;
    },
    reset() {
      current = null;
    },
  };
}
