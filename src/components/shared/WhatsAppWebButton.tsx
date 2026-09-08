'use client';

import { MessageCircle } from 'lucide-react';

/**
 * Acceso a WhatsApp Web personal — el layout del dashboard solo renderiza
 * este componente si `allow('messaging:whatsapp_personal')` (OWNER/ADMIN o
 * un CustomRole equivalente), nunca por chequeo de rol crudo. Ventana popup
 * controlada por el ERP — nunca un iframe: WhatsApp bloquea que
 * web.whatsapp.com se embeba.
 */
export default function WhatsAppWebButton() {
  function openWhatsappWeb() {
    window.open('https://web.whatsapp.com', 'whatsapp-web', 'width=1200,height=800,noopener,noreferrer');
  }

  return (
    <button
      type="button"
      onClick={openWhatsappWeb}
      className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-label="Abrir WhatsApp Web personal"
      title="WhatsApp Web personal"
    >
      <MessageCircle className="size-5" />
    </button>
  );
}
