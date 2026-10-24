'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/chile/tax';
import type { ShiftSummary } from '@/modules/pos/services/cash.service';

interface Props {
  shiftId: string;
  cashRegisterName: string;
  cashierName: string;
  openedAt: string;
  summary: ShiftSummary;
  closedShift: {
    actualAmount: number | null;
    expectedAmount: number | null;
    difference: number | null;
    closedAt: string | null;
    closingNotes: string | null;
  };
}

const date = (value: string) => new Date(value).toLocaleString('es-CL', { timeZone: 'America/Santiago' });

/** El comprobante vive fuera del panel: imprimir no incluye la última boleta del terminal. */
export default function CashShiftReceipt(props: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  function print() {
    document.documentElement.classList.add('pos-shift-printing');
    try { window.print(); }
    finally { document.documentElement.classList.remove('pos-shift-printing'); }
  }

  const rows = [
    ['Fondo inicial', props.summary.initialAmount],
    ['Ventas en efectivo', props.summary.cashSales],
    ['Ingresos manuales', props.summary.inflows],
    ['Retiros', -props.summary.outflows],
    ['Efectivo esperado', props.closedShift.expectedAmount ?? props.summary.expectedAmount],
    ['Efectivo contado', props.closedShift.actualAmount ?? 0],
    ['Diferencia', props.closedShift.difference ?? 0],
  ] as const;

  return <>
    <Button type="button" variant="outline" className="w-full" onClick={print}>
      <Printer className="mr-2 size-4" aria-hidden="true" /> Imprimir comprobante de cierre
    </Button>
    {mounted && createPortal(<div className="pos-shift-receipt" style={{ display: 'none' }}>
      <style>{`@media print {
        html.pos-shift-printing body > :not(.pos-shift-receipt) { display: none !important; }
        html.pos-shift-printing body * { visibility: hidden !important; }
        html.pos-shift-printing .pos-shift-receipt,
        html.pos-shift-printing .pos-shift-receipt * { visibility: visible !important; }
        html.pos-shift-printing .pos-shift-receipt { display: block !important; position: absolute; inset: 0 auto auto 0; width: 72mm; padding: 3mm; color: black; background: white; font: 11px/1.5 monospace; }
        html.pos-shift-printing .pos-shift-receipt h1 { font-size: 15px; margin-bottom: 12px; }
        html.pos-shift-printing .pos-shift-receipt dl { margin: 12px 0; border-top: 1px dashed black; padding-top: 8px; }
        html.pos-shift-printing .pos-shift-receipt dl div { display: flex; justify-content: space-between; gap: 8px; }
        html.pos-shift-printing .pos-shift-receipt p { overflow-wrap: anywhere; }
      }`}</style>
      <h1>COMPROBANTE DE CIERRE</h1>
      <p>Caja: {props.cashRegisterName}</p>
      <p>Cajero: {props.cashierName}</p>
      <p>Apertura: {date(props.openedAt)}</p>
      {props.closedShift.closedAt && <p>Cierre: {date(props.closedShift.closedAt)}</p>}
      <dl>{rows.map(([label, amount]) => <div key={label}><dt>{label}</dt><dd>{formatCurrency(amount)}</dd></div>)}</dl>
      <p>Ventas del turno: {props.summary.documentCount} · {formatCurrency(props.summary.salesTotal)}</p>
      {props.summary.byPaymentMethod.map((payment) => <p key={payment.method}>{payment.label}: {formatCurrency(payment.total)}</p>)}
      {props.closedShift.closingNotes && <p>Observaciones: {props.closedShift.closingNotes}</p>}
      <p style={{ marginTop: '12px' }}>Turno: {props.shiftId}</p>
      <p>Control interno de caja · CLP</p>
    </div>, document.body)}
  </>;
}
