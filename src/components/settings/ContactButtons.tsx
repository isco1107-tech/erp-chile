import { MessageCircle, Mail } from 'lucide-react';
import { toWhatsappDigits } from '@/lib/phone';

/** Botones de contacto directo: usados tanto en "Mi Perfil" como en el directorio de equipo. */
export function ContactButtons({ phone, email }: { phone: string | null; email: string }) {
  return (
    <div className="flex gap-2">
      {phone && (
        <a
          href={`https://wa.me/${toWhatsappDigits(phone)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input px-2.5 text-xs hover:bg-muted"
        >
          <MessageCircle className="size-3.5" /> WhatsApp
        </a>
      )}
      <a
        href={`mailto:${email}`}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input px-2.5 text-xs hover:bg-muted"
      >
        <Mail className="size-3.5" /> Correo
      </a>
    </div>
  );
}
