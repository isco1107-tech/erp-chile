'use client';

import { useEffect, useRef } from 'react';
import { Delete } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/chile/tax';
import { changeFor, parseCashDigits, suggestTenders } from '@/lib/pos/cash';
import { POS_PAYMENT_METHODS, POS_PAYMENT_METHOD_LABELS, type PosPaymentMethod } from '@/modules/pos/schema';

/** Tecla que elige cada medio de pago con el diálogo abierto. */
const METHOD_KEYS: Record<PosPaymentMethod, string> = { EFECTIVO: 'E', TARJETA_DEBITO: 'D', TARJETA_CREDITO: 'C', TRANSFERENCIA: 'T' };
const KEYPAD = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '00', '000'];

interface Props {
  open: boolean;
  total: number;
  itemCount: string;
  method: PosPaymentMethod;
  onMethodChange: (method: PosPaymentMethod) => void;
  /** Solo dígitos, tal como se guarda para enviar al servidor. */
  cashReceived: string;
  onCashChange: (digits: string) => void;
  saving: boolean;
  canCharge: boolean;
  /** Por qué no se puede cobrar todavía (catálogo desactualizado, sin conexión…). */
  blockedReason: string | null;
  onCharge: () => void;
  onClose: () => void;
}

/**
 * Pantalla de cobro: todo con el teclado. E/D/C/T eligen el medio, los números
 * escriben el efectivo recibido, X es «exacto», Enter cobra y Esc vuelve. El
 * vuelto se ve enorme y en vivo, que es lo que el cajero necesita mientras
 * cuenta los billetes.
 */
export default function PaymentDialog(props: Props) {
  const { method, onMethodChange, onCashChange, onCharge, onClose, total } = props;
  const cashInput = useRef<HTMLInputElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const isCash = method === 'EFECTIVO';
  const received = parseCashDigits(props.cashReceived);
  const change = changeFor(total, received);

  useEffect(() => {
    if (!props.open) return;
    const timer = window.setTimeout(() => (isCash ? cashInput.current : confirmButton.current)?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [props.open, isCash]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toUpperCase();
    const chosen = POS_PAYMENT_METHODS.find((item) => METHOD_KEYS[item] === key);
    if (chosen && !props.saving) {
      event.preventDefault();
      onMethodChange(chosen);
    } else if (key === 'X' && isCash && !props.saving) {
      event.preventDefault();
      onCashChange(String(total));
    } else if (event.key === 'Enter') {
      // Enter sobre un botón lo activa ese botón; en el resto (el campo de efectivo) cobra.
      if ((event.target as HTMLElement).tagName === 'BUTTON') return;
      event.preventDefault();
      if (props.canCharge) onCharge();
    }
  }

  function pressKey(key: string) {
    onCashChange(`${props.cashReceived}${key}`.replace(/^0+(?=\d)/, '').slice(0, 9));
  }

  return (
    <Dialog open={props.open} onOpenChange={(next) => { if (!next && !props.saving) onClose(); }}>
      <DialogContent className="max-w-xl" showClose={false} onKeyDown={handleKeyDown} initialFocus={isCash ? cashInput : confirmButton}>
        <DialogTitle className="sr-only">Cobrar la venta</DialogTitle>
        <DialogDescription className="sr-only">Elige el medio de pago, ingresa el efectivo recibido y confirma el cobro.</DialogDescription>

        <div className="rounded-2xl bg-primary p-5 text-primary-foreground">
          <p className="text-[11px] font-medium tracking-wide uppercase opacity-70">Total a pagar · {props.itemCount} {props.itemCount === '1' ? 'unidad' : 'unidades'}</p>
          <p className="mt-1 text-5xl font-semibold tracking-tight tabular-nums" aria-live="polite">{formatCurrency(total)}</p>
        </div>

        <div role="radiogroup" aria-label="Medio de pago" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {POS_PAYMENT_METHODS.map((item) => (
            <Button
              key={item}
              type="button"
              role="radio"
              aria-checked={method === item}
              variant={method === item ? 'default' : 'outline'}
              className="h-12 flex-col gap-0 text-sm"
              disabled={props.saving}
              onClick={() => onMethodChange(item)}
            >
              {POS_PAYMENT_METHOD_LABELS[item]}
              <kbd className="text-[10px] font-normal opacity-70">{METHOD_KEYS[item]}</kbd>
            </Button>
          ))}
        </div>

        {isCash ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor="pos-cash-received" className="text-sm font-medium">Efectivo recibido</label>
              <span className="text-xs text-muted-foreground">Escribe el monto o elige uno</span>
            </div>
            <Input
              id="pos-cash-received"
              ref={cashInput}
              inputMode="numeric"
              autoComplete="off"
              placeholder="0"
              disabled={props.saving}
              value={props.cashReceived ? received.toLocaleString('es-CL') : ''}
              onChange={(event) => onCashChange(event.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 9))}
              className="h-16 text-right text-4xl font-semibold tabular-nums"
              aria-label="Efectivo recibido"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={props.saving} onClick={() => onCashChange(String(total))}>
                Exacto <kbd className="ml-2 text-[10px] opacity-70">X</kbd>
              </Button>
              {suggestTenders(total).map((amount) => (
                <Button key={amount} type="button" variant="outline" disabled={props.saving} onClick={() => onCashChange(String(amount))}>
                  {formatCurrency(amount)}
                </Button>
              ))}
              <Button type="button" variant="ghost" disabled={props.saving} onClick={() => onCashChange('')}>Borrar</Button>
            </div>
            <details>
              <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Teclado táctil</summary>
              <div className="grid grid-cols-3 gap-1">
                {KEYPAD.map((key) => (
                  <Button key={key} type="button" variant="outline" className="h-12 text-lg" disabled={props.saving} onClick={() => pressKey(key)}>{key}</Button>
                ))}
                <Button type="button" variant="outline" className="col-span-3 h-12" aria-label="Borrar último dígito" disabled={props.saving} onClick={() => onCashChange(props.cashReceived.slice(0, -1))}>
                  <Delete className="size-5" />
                </Button>
              </div>
            </details>
            <div
              className={`flex items-baseline justify-between rounded-2xl border px-4 py-4 ${
                change < 0 ? 'border-danger/25 bg-danger-soft text-danger' : 'border-success/25 bg-success-soft text-success'
              }`}
            >
              <span className="text-lg font-semibold">{change < 0 ? 'Falta' : 'Vuelto'}</span>
              <span className="text-5xl font-bold tabular-nums" aria-live="polite">{formatCurrency(Math.abs(change))}</span>
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
            Cobra primero en el terminal de pagos y confirma aquí cuando salga aprobado: el sistema no se conecta al terminal.
          </p>
        )}

        {props.blockedReason && <p role="alert" className="mt-3 text-sm font-medium text-destructive">{props.blockedReason}</p>}

        <div className="mt-5 grid grid-cols-[auto_1fr] gap-2">
          <Button type="button" variant="outline" className="h-14" disabled={props.saving} onClick={onClose}>
            Volver <kbd className="ml-2 text-[10px] opacity-70">Esc</kbd>
          </Button>
          <Button ref={confirmButton} type="button" className="h-14 text-lg" disabled={!props.canCharge} onClick={onCharge}>
            {props.saving ? 'Emitiendo boleta…' : `Cobrar ${formatCurrency(total)}`}
            {!props.saving && <kbd className="ml-3 rounded border border-primary-foreground/40 px-1 text-[10px]">Enter</kbd>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
