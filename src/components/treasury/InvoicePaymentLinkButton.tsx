'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, Link2, MessageCircle } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/chile/tax';
import { buildWhatsappLink } from '@/lib/chile/phone';
import { createInvoicePaymentLinkAction } from '@/modules/treasury/online/invoice-links.actions';

interface Props {
  salesDocumentId: string;
  documentLabel: string;
  customerName: string;
  customerPhone: string | null;
}

/** Genera el link de pago en línea (Khipu) de un documento por cobrar y ayuda a compartirlo. */
export default function InvoicePaymentLinkButton({ salesDocumentId, documentLabel, customerName, customerPhone }: Props) {
  const [link, setLink] = useState<{ url: string; amount: number } | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const result = await createInvoicePaymentLinkAction(salesDocumentId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setLink(result.data);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      toast.success('Link copiado');
    } catch {
      toast.error('No se pudo copiar: selecciónalo y cópialo a mano');
    }
  }

  const message = link ? `Hola ${customerName}, puedes pagar ${documentLabel} por ${formatCurrency(link.amount)} con transferencia aquí: ${link.url}` : '';
  const whatsapp = link && customerPhone ? buildWhatsappLink(customerPhone, message) : null;

  return (
    <>
      <Button type="button" variant="outline" disabled={busy} onClick={() => void generate()}>
        <Link2 aria-hidden="true" /> {busy ? 'Generando…' : 'Link de pago'}
      </Button>
      <Dialog open={link !== null} onOpenChange={(open) => !open && setLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link de pago de {documentLabel}</DialogTitle>
            <DialogDescription>
              {customerName} paga {link ? formatCurrency(link.amount) : ''} por transferencia (Khipu). Al confirmarse, el cobro queda registrado solo en Tesorería. Vence en 72 horas.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
            <code className="flex-1 break-all text-xs">{link?.url}</code>
            <Button type="button" size="sm" variant="outline" aria-label="Copiar link" onClick={() => void copy()}>
              <Copy aria-hidden="true" />
            </Button>
          </div>
          <DialogFooter>
            {whatsapp?.ok && (
              <a href={whatsapp.url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'outline' })}>
                <MessageCircle aria-hidden="true" /> Enviar por WhatsApp
              </a>
            )}
            <Button type="button" onClick={() => setLink(null)}>
              Listo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
