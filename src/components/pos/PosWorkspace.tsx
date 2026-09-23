'use client';

import { useState } from 'react';
import PosTerminal from './PosTerminal';
import CashPanel from './CashPanel';

interface Props {
  shiftId: string;
  warehouseId: string;
  warehouseName: string;
  cashRegisterName: string;
  cashierName: string;
  openedAt: string;
  initialAmount: number;
  canClose: boolean;
  companyName: string;
  companyRut: string;
  companyAddress: string | null;
}

/**
 * Alterna entre vender y arquear sin perder el carrito: cambiar de pestaña
 * mantiene montado el terminal (solo se oculta), porque en un mostrador es
 * normal consultar la caja a media venta.
 */
export default function PosWorkspace(props: Props) {
  const [tab, setTab] = useState<'terminal' | 'cash'>('terminal');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground" data-tutorial="module-header">Punto de Venta</h1>
          <p className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">
              <span className="size-1.5 rounded-full bg-success" aria-hidden="true" /> Turno abierto
            </span>
            {props.cashRegisterName} · {props.cashierName} · desde{' '}
            {new Date(props.openedAt).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Santiago' })}
          </p>
        </div>
        <div role="tablist" aria-label="Vista del punto de venta" className="inline-flex rounded-xl border border-border bg-card p-1 shadow-card">
          {([['terminal', 'Vender'], ['cash', 'Caja y arqueo']] as const).map(([key, text]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                tab === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      <div className={tab === 'terminal' ? '' : 'hidden'}>
        <PosTerminal
          shiftId={props.shiftId}
          warehouseId={props.warehouseId}
          warehouseName={props.warehouseName}
          cashRegisterName={props.cashRegisterName}
          cashierName={props.cashierName}
          companyName={props.companyName}
          companyRut={props.companyRut}
          companyAddress={props.companyAddress}
        />
      </div>

      {tab === 'cash' && (
        <div className="print:hidden">
          <CashPanel
            shiftId={props.shiftId}
            cashierName={props.cashierName}
            cashRegisterName={props.cashRegisterName}
            openedAt={props.openedAt}
            canClose={props.canClose}
          />
        </div>
      )}
    </div>
  );
}
