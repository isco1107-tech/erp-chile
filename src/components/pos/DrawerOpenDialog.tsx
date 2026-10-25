'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DRAWER_OPEN_REASONS } from '@/modules/pos/schema';

const OTHER = 'Otro motivo';

interface Props {
  open: boolean;
  busy: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

/**
 * Abrir el cajón SIN una venta: pide el motivo y queda registrado con la caja y
 * el cajero. Es lo único que impide usar el cajón como una bolsa sin rastro.
 */
export default function DrawerOpenDialog({ open, busy, onConfirm, onClose }: Props) {
  const [choice, setChoice] = useState<string>(DRAWER_OPEN_REASONS[0]);
  const [custom, setCustom] = useState('');
  const reason = choice === OTHER ? custom.trim() : choice;
  const valid = reason.length >= 3;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Abrir cajón sin venta</DialogTitle>
          <DialogDescription>Queda registrado con tu nombre y la caja. Úsalo solo para dar cambio o mover efectivo.</DialogDescription>
        </DialogHeader>
        <div role="radiogroup" aria-label="Motivo" className="space-y-2">
          {[...DRAWER_OPEN_REASONS, OTHER].map((item) => (
            <Button
              key={item}
              type="button"
              role="radio"
              aria-checked={choice === item}
              variant={choice === item ? 'default' : 'outline'}
              className="h-11 w-full justify-start"
              disabled={busy}
              onClick={() => setChoice(item)}
            >
              {item}
            </Button>
          ))}
        </div>
        {choice === OTHER && (
          <Input
            autoFocus
            className="mt-3"
            placeholder="Explica el motivo"
            aria-label="Motivo de la apertura"
            maxLength={120}
            value={custom}
            disabled={busy}
            onChange={(event) => setCustom(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && valid && !busy) onConfirm(reason); }}
          />
        )}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button>
          <Button type="button" disabled={!valid || busy} onClick={() => onConfirm(reason)}>{busy ? 'Abriendo…' : 'Abrir cajón'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
