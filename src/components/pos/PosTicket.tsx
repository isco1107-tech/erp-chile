'use client';

import { formatCurrency } from '@/lib/chile/tax';

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

/**
 * Ticket de 80mm.
 *
 * Solo existe al imprimir: en pantalla va oculto (`hidden print:block`) y las
 * reglas de `@media print` en globals.css ocultan el resto de la aplicación.
 * El ancho de página se fija en `80mm auto` para que la impresora térmica no
 * escale el contenido a tamaño carta.
 */
export default function PosTicket({ data }: { data: TicketData }) {
  return (
    <div className="pos-ticket hidden print:block">
      <div className="ticket-center">
        <p className="ticket-strong">{data.companyName}</p>
        <p>RUT {data.companyRut}</p>
        {data.companyAddress && <p>{data.companyAddress}</p>}
      </div>

      <div className="ticket-divider" />

      <div className="ticket-center">
        <p className="ticket-strong">BOLETA ELECTRÓNICA</p>
        <p>N° {data.folio ?? '-'}</p>
      </div>

      <div className="ticket-divider" />

      <p>Fecha: {data.issuedAt.toLocaleString('es-CL')}</p>
      <p>Atiende: {data.cashierName}</p>
      <p>Cliente: {data.customerName}</p>
      <p>RUT: {data.customerRut}</p>

      <div className="ticket-divider" />

      {/*
        Precio unitario y total de línea van ambos en NETO, y el IVA se suma una
        sola vez al pie. Mezclar unitario neto con total bruto hacía que
        cantidad × precio ≠ total en el papel, y el cliente que multiplica ve un
        error que no existe.
      */}
      {data.lines.map((line, i) => (
        <div key={`${line.sku ?? line.description}-${i}`} className="ticket-line">
          <p>{line.description}</p>
          <div className="ticket-row">
            <span>
              {line.quantity} x {formatCurrency(line.unitPrice)}
              {line.isExempt ? ' (E)' : ''}
            </span>
            <span>{formatCurrency(line.subtotal)}</span>
          </div>
        </div>
      ))}

      <div className="ticket-divider" />

      <div className="ticket-row">
        <span>Neto</span>
        <span>{formatCurrency(data.netAmount)}</span>
      </div>
      {data.exemptAmount > 0 && (
        <div className="ticket-row">
          <span>Exento (E)</span>
          <span>{formatCurrency(data.exemptAmount)}</span>
        </div>
      )}
      <div className="ticket-row">
        <span>IVA 19%</span>
        <span>{formatCurrency(data.ivaAmount)}</span>
      </div>
      <div className="ticket-row ticket-total">
        <span>TOTAL</span>
        <span>{formatCurrency(data.totalAmount)}</span>
      </div>

      <div className="ticket-divider" />

      <div className="ticket-row">
        <span>Pago</span>
        <span>{data.paymentMethodLabel}</span>
      </div>
      {data.cashReceived !== undefined && (
        <div className="ticket-row">
          <span>Efectivo</span>
          <span>{formatCurrency(data.cashReceived)}</span>
        </div>
      )}
      {data.changeDue !== undefined && data.changeDue > 0 && (
        <div className="ticket-row ticket-strong">
          <span>Vuelto</span>
          <span>{formatCurrency(data.changeDue)}</span>
        </div>
      )}

      <div className="ticket-divider" />
      <div className="ticket-center">
        <p>¡Gracias por su compra!</p>
        <p className="ticket-small">Documento emitido por sistema ERP</p>
      </div>
    </div>
  );
}
