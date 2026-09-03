'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
          <p className="hud-label mb-1">Point of sale / terminal</p>
          <h1 className="text-2xl font-semibold text-foreground">Punto de Venta</h1>
          <p className="font-mono text-xs text-muted-foreground">
            {props.cashRegisterName} · turno abierto {new Date(props.openedAt).toLocaleString('es-CL')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={tab === 'terminal' ? 'default' : 'outline'}
            onClick={() => setTab('terminal')}
          >
            Terminal HUD
          </Button>
          <Button type="button" size="sm" variant={tab === 'cash' ? 'default' : 'outline'} onClick={() => setTab('cash')}>
            Arqueo
          </Button>
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
