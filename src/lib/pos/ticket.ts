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

export interface TicketData {
  companyName: string;
  companyRut: string;
  companyAddress?: string | null;
  folio: number | null;
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
