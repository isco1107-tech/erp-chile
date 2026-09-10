import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ActionCardProps {
  title: string;
  description: string;
  actionLabel: string;
  /** Si se entrega, el CTA es un <Link>. Si no, es un <button> y usa onAction. */
  href?: string;
  onAction?: () => void;
  icon?: LucideIcon;
  className?: string;
}

const CTA_CLASS =
  'inline-flex w-fit items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-primary transition-colors duration-150 ease-out hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary';

/**
 * Tarjeta de acción de acento sólido, para UNA acción real y relevante del
 * ERP (ver brief sección 4). No es un componente de marketing genérico: el
 * llamador siempre debe pasar un href/onAction que exista de verdad.
 */
export function ActionCard({ title, description, actionLabel, href, onAction, icon: Icon, className }: ActionCardProps) {
  return (
    <div className={cn('flex flex-col gap-4 rounded-lg bg-primary p-5 text-primary-foreground shadow-card', className)}>
      <div className="flex items-start gap-3">
        {Icon && (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-white/15">
            <Icon className="size-5" strokeWidth={1.75} />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="mt-0.5 text-sm leading-relaxed text-primary-foreground/80">{description}</p>
        </div>
      </div>

      {href ? (
        <Link href={href} className={CTA_CLASS}>
          {actionLabel}
        </Link>
      ) : (
        <button type="button" onClick={onAction} className={CTA_CLASS}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
