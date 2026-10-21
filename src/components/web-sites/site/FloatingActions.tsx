import { MapPin, MessageCircle, Phone } from 'lucide-react';
import type { ReactNode } from 'react';
import type { SiteDocument } from '@/lib/web-sites/site';
import { mapLinkUrl, whatsappHref } from '@/lib/web-sites/urls';
import { resolveIn, type RenderCtx } from './context';
import { cx } from './parts';
import SiteLink from './SiteLink';

/**
 * Botón flotante de WhatsApp y barra de acciones del celular. Ambos son
 * `sticky` al final del contenido (no `fixed`): el contenedor del sitio es un
 * contenedor de consultas y así la vista previa del editor los mantiene dentro
 * de su marco, y en el sitio publicado quedan pegados al borde inferior igual.
 */

interface BarAction {
  key: 'call' | 'whatsapp' | 'map';
  label: string;
  href: string | null;
  icon: ReactNode;
}

function barActions(doc: SiteDocument): BarAction[] {
  const bar = doc.actionBar;
  const actions: BarAction[] = [
    { key: 'call', label: 'Llamar', href: bar.phone ? `tel:${bar.phone}` : null, icon: <Phone className="size-5" aria-hidden="true" /> },
    { key: 'whatsapp', label: 'WhatsApp', href: whatsappHref(doc.whatsapp.number, doc.whatsapp.message), icon: <MessageCircle className="size-5" aria-hidden="true" /> },
    { key: 'map', label: 'Cómo llegar', href: mapLinkUrl(bar.address), icon: <MapPin className="size-5" aria-hidden="true" /> },
  ];
  return actions;
}

/** ¿Hay barra de acciones con al menos una acción válida? */
export function hasActionBar(ctx: RenderCtx): boolean {
  return ctx.doc.actionBar.enabled && barActions(ctx.doc).some((action) => resolveIn(ctx, action.href));
}

export function MobileActionBar({ ctx }: { ctx: RenderCtx }) {
  if (!ctx.doc.actionBar.enabled) return null;
  const actions = barActions(ctx.doc).flatMap((action) => {
    const link = resolveIn(ctx, action.href);
    return link ? [{ action, link }] : [];
  });
  if (actions.length === 0) return null;
  return (
    <div className="ws-tone-primary ws-bg sticky bottom-0 z-40 border-t border-[color:var(--s-line)] pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.4)] @2xl:hidden">
      <nav aria-label="Acciones rápidas" className="grid grid-flow-col auto-cols-fr">
        {actions.map(({ action, link }) => (
          <SiteLink key={action.key} ctx={ctx} link={link} className="flex flex-col items-center gap-0.5 px-2 py-2.5 text-xs font-semibold">
            {action.icon}
            {action.label}
          </SiteLink>
        ))}
      </nav>
    </div>
  );
}

export function WhatsappFloat({ ctx }: { ctx: RenderCtx }) {
  const button = ctx.doc.whatsapp;
  if (!button.enabled) return null;
  const link = resolveIn(ctx, whatsappHref(button.number, button.message));
  if (!link) return null;
  return (
    // Con barra de acciones en el celular, el botón se muestra solo en pantallas anchas para no duplicar WhatsApp.
    <div className={cx('sticky bottom-4 z-40 h-0', hasActionBar(ctx) && 'hidden @2xl:block')}>
      <div className="absolute right-4 bottom-0">
        <SiteLink ctx={ctx} link={link} ariaLabel={button.label ? undefined : 'Escribir por WhatsApp'} className="ws-wa">
          <MessageCircle className="size-7" aria-hidden="true" />
          {button.label && <span className="pr-3">{button.label}</span>}
        </SiteLink>
      </div>
    </div>
  );
}
