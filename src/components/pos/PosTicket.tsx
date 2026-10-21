'use client';

import { formatCurrency } from '@/lib/chile/tax';
import type { DteType } from '@prisma/client';

export interface TicketLine {
  description: string;
  sku?: string | null;
  quantity: number;
  unit?: string;
  /** Precio unitario NETO. */
  unitPrice: number;
  /** Neto de la línea: cantidad × precio unitario (con descuento aplicado). */
  subtotal: number;
  /** Total bruto de la línea (con IVA incluido). */
  total?: number;
  discountPercent?: number;
  isExempt: boolean;
}

export interface TicketData {
  dteType?: DteType;
  companyName: string;
  companyRut: string;
  companyGiro?: string | null;
  companyAddress?: string | null;
  folio: number | null;
  issuedAt: Date;
  cashRegisterName?: string;
  cashierName: string;
  customerName: string;
  customerRut: string;
  customerGiro?: string | null;
  customerAddress?: string | null;
  customerComuna?: string | null;
  referenceLabel?: string | null;
  referenceFolio?: number | null;
  lines: TicketLine[];
  netAmount: number;
  exemptAmount: number;
  ivaAmount: number;
  totalAmount: number;
  paymentMethodLabel: string;
  cashRoundedTotal?: number;
  cashRoundingDiff?: number;
  cashReceived?: number;
  changeDue?: number;
  /** SVG Data URI del timbre electrónico PDF417 del SII. */
  timbrePdf417?: string | null;
}

const SII_DOCUMENT_TITLES: Record<string, string> = {
  BOLETA_39: 'BOLETA ELECTRÓNICA',
  BOLETA_EXENTA_41: 'BOLETA NO AFECTA O EXENTA ELECTRÓNICA',
  FACTURA_33: 'FACTURA ELECTRÓNICA',
  FACTURA_EXENTA_34: 'FACTURA NO AFECTA O EXENTA ELECTRÓNICA',
  NOTA_CREDITO_61: 'NOTA DE CRÉDITO ELECTRÓNICA',
  NOTA_DEBITO_56: 'NOTA DE DÉBITO ELECTRÓNICA',
};

function formatQty(qty: number): string {
  if (Number.isInteger(qty)) return String(qty);
  return qty.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 3 });
}

/**
 * Ticket térmico de 80mm conforme a representación impresa SII.
 *
 * Por defecto solo existe al imprimir (`hidden print:block`) y las reglas de
 * `@media print` en `globals.css` ocultan el resto de la aplicación. Si se pasa
 * `preview={true}`, se renderiza en pantalla como vista previa de 80mm.
 */
export default function PosTicket({ data, preview = false }: { data: TicketData; preview?: boolean }) {
  const docTitle = SII_DOCUMENT_TITLES[data.dteType ?? 'BOLETA_39'] ?? 'BOLETA ELECTRÓNICA';
  const isFactura = data.dteType === 'FACTURA_33' || data.dteType === 'FACTURA_EXENTA_34';

  return (
    <div
      className={
        preview
          ? 'pos-ticket mx-auto w-[300px] rounded-xl border border-border bg-white p-4 font-mono text-[11px] leading-[1.35] text-black shadow-sm'
          : 'pos-ticket hidden print:block'
      }
    >
      {/* Recuadro SII y Datos del Emisor */}
      <div className="ticket-center" style={{ border: '1.5px solid #000', padding: '5px 4px', marginBottom: '6px' }}>
        <p className="ticket-strong">R.U.T.: {data.companyRut}</p>
        <p className="ticket-strong">{docTitle}</p>
        <p className="ticket-strong">N° {data.folio ?? 'S/F'}</p>
      </div>

      <div className="ticket-center">
        <p className="ticket-strong">{data.companyName}</p>
        {data.companyGiro && <p className="ticket-small">{data.companyGiro}</p>}
        {data.companyAddress && <p className="ticket-small">{data.companyAddress}</p>}
      </div>

      <div className="ticket-divider" />

      <div className="ticket-row">
        <span>Fecha: {data.issuedAt.toLocaleDateString('es-CL')}</span>
        <span>Hora: {data.issuedAt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      {data.cashRegisterName && <p>Caja: {data.cashRegisterName}</p>}
      <p>Cajero(a): {data.cashierName}</p>
      <p>Cliente: {data.customerName}</p>
      <p>RUT: {data.customerRut}</p>
      {(isFactura || data.customerGiro) && data.customerGiro && <p>Giro: {data.customerGiro}</p>}
      {(isFactura || data.customerAddress) && data.customerAddress && (
        <p>
          Dir.: {data.customerAddress}
          {data.customerComuna ? `, ${data.customerComuna}` : ''}
        </p>
      )}
      {data.referenceFolio && (
        <p className="ticket-strong">
          Ref.: {data.referenceLabel ?? 'Doc.'} Folio #{data.referenceFolio}
        </p>
      )}

      <div className="ticket-divider" />

      <div className="ticket-row ticket-strong ticket-small">
        <span>CANT x PRECIO</span>
        <span>VALOR</span>
      </div>

      <div className="ticket-divider" />

      {data.lines.map((line, i) => {
        // Para boletas de supermercado mostramos el valor bruto de la línea si está disponible;
        // para facturas mostramos neto.
        const useGross = !isFactura && line.total !== undefined;
        const lineAmount = useGross ? (line.total ?? line.subtotal) : line.subtotal;
        const unitDisplay =
          useGross && line.quantity > 0
            ? Math.round((line.total ?? line.subtotal) / line.quantity)
            : line.unitPrice;

        return (
          <div key={`${line.sku ?? line.description}-${i}`} className="ticket-line">
            <p className="ticket-strong">
              {line.description}
              {line.isExempt ? ' (E)' : ''}
            </p>
            <div className="ticket-row">
              <span>
                {formatQty(line.quantity)}
                {line.unit && line.unit !== 'UN' ? ` ${line.unit}` : ''} x {formatCurrency(unitDisplay)}
                {line.discountPercent && line.discountPercent > 0 ? ` (-${line.discountPercent}%)` : ''}
              </span>
              <span>{formatCurrency(lineAmount)}</span>
            </div>
          </div>
        );
      })}

      <div className="ticket-divider" />

      <div className="ticket-row">
        <span>Monto Neto</span>
        <span>{formatCurrency(data.netAmount)}</span>
      </div>
      {data.exemptAmount > 0 && (
        <div className="ticket-row">
          <span>Monto Exento (E)</span>
          <span>{formatCurrency(data.exemptAmount)}</span>
        </div>
      )}
      <div className="ticket-row">
        <span>IVA (19%)</span>
        <span>{formatCurrency(data.ivaAmount)}</span>
      </div>
      <div className="ticket-row ticket-total">
        <span>TOTAL</span>
        <span>{formatCurrency(data.totalAmount)}</span>
      </div>

      {/* Desglose Ley de Redondeo N° 20.956 para pagos en efectivo */}
      {data.cashRoundingDiff !== undefined && data.cashRoundingDiff !== 0 && (
        <>
          <div className="ticket-row ticket-small">
            <span>Ajuste Ley 20.956</span>
            <span>
              {data.cashRoundingDiff > 0 ? '+' : ''}
              {formatCurrency(data.cashRoundingDiff)}
            </span>
          </div>
          <div className="ticket-row ticket-strong">
            <span>Total a Pagar Efectivo</span>
            <span>{formatCurrency(data.cashRoundedTotal ?? data.totalAmount)}</span>
          </div>
        </>
      )}

      <div className="ticket-divider" />

      <div className="ticket-row">
        <span>Medio de Pago</span>
        <span>{data.paymentMethodLabel}</span>
      </div>
      {data.cashReceived !== undefined && (
        <div className="ticket-row">
          <span>Efectivo Recibido</span>
          <span>{formatCurrency(data.cashReceived)}</span>
        </div>
      )}
      {data.changeDue !== undefined && data.changeDue >= 0 && data.cashReceived !== undefined && (
        <div className="ticket-row ticket-strong">
          <span>Vuelto</span>
          <span>{formatCurrency(data.changeDue)}</span>
        </div>
      )}

      {/* Timbre Electrónico SII PDF417 */}
      {data.timbrePdf417 ? (
        <div className="ticket-center" style={{ marginTop: '8px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.timbrePdf417}
            alt="Timbre Electrónico SII PDF417"
            style={{ width: '100%', maxWidth: '250px', height: 'auto', margin: '0 auto', display: 'block' }}
          />
          <p className="ticket-small" style={{ marginTop: '3px' }}>
            Timbre Electrónico SII
          </p>
          <p className="ticket-small">Res. Ex. SII · Verifique documento en www.sii.cl</p>
        </div>
      ) : (
        <div className="ticket-center" style={{ marginTop: '6px' }}>
          <p className="ticket-small">Comprobante de venta interna (sin timbre CAF)</p>
        </div>
      )}

      <div className="ticket-divider" />
      <div className="ticket-center">
        <p>¡Gracias por su preferencia!</p>
      </div>
    </div>
  );
}
