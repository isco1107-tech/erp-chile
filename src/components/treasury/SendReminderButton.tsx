'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Mail, MailPlus, MoreHorizontal } from 'lucide-react';
import { Menu } from '@base-ui/react/menu';
import { Button } from '@/components/ui/button';
import { sendPaymentReminderAction } from '@/modules/treasury/actions/reminders.actions';

import { useConfirm } from '@/components/ui/confirm-provider';

/** Pantalla de Clientes con la ficha del contacto abierta, para que pueda cargar el correo que falta. */
function addEmailHref(contactId: string): string {
  return `/dashboard/contacts?edit=${encodeURIComponent(contactId)}`;
}

function useSendReminder(contactId: string) {
  const confirm = useConfirm();
  const [sending, setSending] = useState(false);

  async function send() {
    if (!await confirm('¿Enviar un correo de recordatorio de pago a este cliente con todos sus documentos pendientes?')) return;
    setSending(true);
    try {
      const result = await sendPaymentReminderAction(contactId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Recordatorio enviado');
    } finally {
      setSending(false);
    }
  }

  return { sending, send };
}

export default function SendReminderButton({ contactId, hasEmail }: { contactId: string; hasEmail: boolean }) {
  const { sending, send } = useSendReminder(contactId);

  if (!hasEmail) {
    return (
      <Link
        href={addEmailHref(contactId)}
        className="inline-flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-2"
        title="El cliente no tiene correo registrado: ábrelo en Clientes & Proveedores para agregarlo"
      >
        <MailPlus className="size-3.5" aria-hidden="true" /> Agregar correo
      </Link>
    );
  }

  return (
    <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={sending} onClick={send}>
      <Mail className="size-3.5" />
      {sending ? 'Enviando...' : 'Recordar por email'}
    </Button>
  );
}

const itemClass =
  'flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none select-none data-[highlighted]:bg-muted data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50';

/**
 * Menú «⋯» con las acciones secundarias de una fila de cobranza, para que la
 * columna de acciones no desborde la tabla y «Registrar pago» siga a la vista.
 */
export function ReminderMenu({ contactId, hasEmail, contactName }: { contactId: string; hasEmail: boolean; contactName: string }) {
  const { sending, send } = useSendReminder(contactId);

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`Más acciones de ${contactName}`}
        className="grid size-8 place-items-center rounded-lg border border-border text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 data-[popup-open]:bg-muted"
      >
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-50" sideOffset={4} align="end">
          <Menu.Popup className="min-w-56 rounded-xl border border-border bg-card p-1 text-card-foreground shadow-lg outline-none data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
            {hasEmail ? (
              <Menu.Item className={itemClass} disabled={sending} onClick={send}>
                <Mail className="size-4" aria-hidden="true" />
                <span className="min-w-0 flex-1">{sending ? 'Enviando...' : 'Recordar por email'}</span>
              </Menu.Item>
            ) : (
              <Menu.LinkItem className={itemClass} render={<Link href={addEmailHref(contactId)} />}>
                <MailPlus className="size-4" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  Agregar correo
                  <span className="block text-xs text-muted-foreground">El cliente no tiene correo para el recordatorio</span>
                </span>
              </Menu.LinkItem>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
