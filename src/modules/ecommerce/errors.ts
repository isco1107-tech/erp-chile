/**
 * Errores de la tienda cuyo mensaje SÍ puede llegar a quien compra o al equipo:
 * están escritos en español y dicen qué hacer. Cualquier otro error es un
 * problema nuestro y va a observabilidad con un mensaje genérico.
 */
export class StoreError extends Error {
  constructor(
    message: string,
    /** Código HTTP sugerido para la API pública. */
    readonly status: number = 400,
    /** Campo del formulario al que apunta el problema, si es uno. */
    readonly field?: string
  ) {
    super(message);
    this.name = 'StoreError';
  }
}

export class StoreNotFoundError extends StoreError {
  constructor(message = 'No encontramos lo que buscas') {
    super(message, 404);
    this.name = 'StoreNotFoundError';
  }
}

export interface StockShortage {
  productId: string;
  name: string;
  requested: number;
  available: number;
}

/** Lo que pide el carrito ya no está completo: se informa producto por producto. */
export class OutOfStockError extends StoreError {
  constructor(readonly shortages: StockShortage[]) {
    super(
      shortages.length === 1
        ? shortages[0]!.available <= 0
          ? `«${shortages[0]!.name}» se agotó.`
          : `De «${shortages[0]!.name}» solo quedan ${shortages[0]!.available}.`
        : 'Algunos productos de tu carrito ya no tienen stock suficiente.',
      409
    );
    this.name = 'OutOfStockError';
  }
}
