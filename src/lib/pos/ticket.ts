/**
 * Datos de la boleta de mostrador. Los usan el ticket en pantalla/impresión del
 * navegador (`PosTicket`) y el ticket ESC/POS directo (`hardware/escpos.ts`),
 * así que viven aquí y no dentro de un componente.
 */
export interface TicketLine {
  description: string;
  sku?: string | null;
  quantity: number;
  /** Precio unitario NETO, la misma base que `subtotal`. */
  unitPrice: number;
  /** Neto de la línea: cantidad × precio unitario. */
  subtotal: number;
  isExempt: boolean;
}

/** Título y aviso del papel según si la venta quedó timbrada (mismo texto en pantalla y en ESC/POS). */
export function ticketHeading(data: Pick<TicketData, 'stamped'>): { title: string; notice: string } {
  return data.stamped
    ? { title: 'BOLETA ELECTRÓNICA', notice: 'Timbrada. Pendiente de envío al SII' }
    : { title: 'COMPROBANTE DE VENTA', notice: 'Sin validez tributaria: no es boleta' };
}

export interface TicketData {
  companyName: string;
  companyRut: string;
  companyAddress?: string | null;
  folio: number | null;
  /**
   * Timbrada con un folio autorizado por el SII (CAF). Sin timbre el folio es
   * interno y el papel NO es una boleta: se imprime como comprobante.
   */
  stamped: boolean;
  issuedAt: Date;
  cashierName: string;
  customerName: string;
  customerRut: string;
  lines: TicketLine[];
  netAmount: number;
  exemptAmount: number;
  ivaAmount: number;
  totalAmount: number;
  paymentMethodLabel: string;
  cashReceived?: number;
  changeDue?: number;
}
