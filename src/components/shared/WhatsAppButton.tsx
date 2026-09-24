'use client';

import { MessageCircle } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { buildWhatsappLink } from '@/lib/chile/phone';

/**
 * Botón "Enviar WhatsApp" reutilizable para cualquier ficha (candidata,
 * contacto cliente/proveedor, etc.) — abre `wa.me` en una pestaña nueva con
 * el teléfono guardado, precargando un saludo. No usa la app de WhatsApp
 * Business ni ninguna API: es el mismo link "click to chat" público de
 * WhatsApp, así que basta con que el destinatario tenga WhatsApp instalado.
 */
export default function WhatsAppButton({ phone, name, message }: { phone: string | null; name: string; message?: string }) {
  if (!phone) return null;

  const result = buildWhatsappLink(phone, message ?? `Hola ${name}, te escribo desde el equipo.`);

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
