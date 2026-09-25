'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FileText, Receipt, Truck, XCircle } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { closeSalesOrderAction } from '@/modules/sales/actions/sales-orders.actions';

/**
 * Acciones de una nota abierta: facturar, boleta, guía de despacho (cada una
 * abre Ventas con el saldo pendiente) y cerrar la nota con motivo.
 */
export default function SalesOrderActions({
  orderId,
  hasProgress,
  pendingToInvoice,
  pendingToDispatch,
}: {
  orderId: string;
  hasProgress: boolean;
  pendingToInvoice: boolean;
  pendingToDispatch: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function close() {
    setSaving(true);
    const result = await closeSalesOrderAction(orderId, { reason });
    setSaving(false);
    if (!result.success) return void toast.error(result.error);
    toast.success(result.message ?? 'Nota cerrada');
    setOpen(false);
    router.refresh();
  }

  const issueHref = (type: string) => `/dashboard/sales/new?orderId=${orderId}&type=${type}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {pendingToInvoice && (
        <>
          <Link href={issueHref('FACTURA_33')} className={buttonVariants()}>
            <FileText aria-hidden="true" /> Facturar
          </Link>
          <Link href={issueHref('BOLETA_39')} className={buttonVariants({ variant: 'outline' })}>
            <Receipt aria-hidden="true" /> Boleta
          </Link>
        </>
      )}
      {pendingToDispatch && (
        <Link href={issueHref('GUIA_DESPACHO_52')} className={buttonVariants({ variant: 'outline' })}>
          <Truck aria-hidden="true" /> Guía de despacho
        </Link>
      )}
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        <XCircle aria-hidden="true" /> {hasProgress ? 'Cerrar saldo' : 'Anular nota'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{hasProgress ? 'Cerrar el saldo pendiente' : 'Anular la nota de venta'}</DialogTitle>
            <DialogDescription>
              {hasProgress
                ? 'Lo ya facturado o despachado se mantiene. El saldo deja de estar pendiente y libera el stock reservado.'
                : 'La nota queda anulada y libera el stock reservado. No se puede deshacer.'}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="close-reason">Motivo</Label>
            <Input
              id="close-reason"
              className="mt-1.5"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej.: el cliente desistió del saldo"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Volver
            </Button>
            <Button type="button" variant="destructive" onClick={close} disabled={saving || reason.trim().length < 3}>
              {saving ? 'Guardando…' : hasProgress ? 'Cerrar saldo' : 'Anular nota'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
