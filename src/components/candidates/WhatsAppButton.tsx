'use client';

import { MessageCircle } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { buildWhatsappLink } from '@/lib/chile/phone';

/** Botón "Enviar WhatsApp" para la ficha de candidata — abre wa.me con el teléfono guardado. */
export default function WhatsAppButton({ phone, candidateName }: { phone: string | null; candidateName: string }) {
  if (!phone) return null;

  const result = buildWhatsappLink(phone, `Hola ${candidateName}, te escribo desde el equipo.`);

  if (!result.ok) {
    return (
      <p className="text-xs text-muted-foreground">
        No se pudo generar el link de WhatsApp: {result.reason}
      </p>
    );
  }

  return (
    <a
      href={result.url}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonVariants({ variant: 'outline' })}
    >
      <MessageCircle className="size-4" /> Enviar WhatsApp
    </a>
  );
}
