'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sendPaymentReminderAction } from '@/modules/treasury/actions/reminders.actions';

export default function SendReminderButton({ contactId, hasEmail }: { contactId: string; hasEmail: boolean }) {
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!confirm('¿Enviar un correo de recordatorio de pago a este cliente con todos sus documentos pendientes?')) return;
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

  if (!hasEmail) {
    return (
      <span className="text-xs text-muted-foreground" title="El cliente no tiene correo registrado en Contactos">
        Sin correo
      </span>
    );
  }

  return (
    <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={sending} onClick={handleSend}>
      <Mail className="size-3.5" />
      {sending ? 'Enviando...' : 'Recordar por email'}
    </Button>
  );
}
