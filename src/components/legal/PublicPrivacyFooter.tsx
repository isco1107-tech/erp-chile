import Link from 'next/link';
import type { PublicNoticeFlow } from '@/modules/data-protection/services/public-notice.service';

/**
 * Pie de los formularios públicos que recopilan datos personales (entradas,
 * votos, cuotas, auspiciador, encuesta). La Ley 21.719 pide informar antes de
 * recopilar: este pie enlaza el aviso del flujo, que identifica al
 * responsable a partir del mismo token del enlace.
 */
export default function PublicPrivacyFooter({ flow, token }: { flow: PublicNoticeFlow; token: string }) {
  const href = `/aviso-privacidad?flujo=${flow}&t=${encodeURIComponent(token)}`;
  return (
    <footer className="mx-auto max-w-3xl px-4 pb-8 text-center text-xs leading-relaxed text-muted-foreground">
      Los datos que ingreses se usan solo para esta gestión, según el{' '}
      <Link href={href} className="underline underline-offset-2 hover:text-foreground" target="_blank" rel="noopener">
        aviso de privacidad
      </Link>
      .
    </footer>
  );
}
