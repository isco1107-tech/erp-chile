import * as React from 'react';
import { Button } from './button';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Para acciones que navegan (envolver en `<Link>`) en vez de ejecutar una función. */
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

/** Ilustración minimalista de "bandeja vacía", trazada en `currentColor` para seguir el tema. */
function DefaultIllustration() {
  return (
    <svg viewBox="0 0 120 90" fill="none" className="size-20 text-muted-foreground/35" aria-hidden="true">
      <rect x="14" y="34" width="92" height="42" rx="6" stroke="currentColor" strokeWidth="2.5" />
      <path d="M14 50h24l7 12h30l7-12h24" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="60" cy="20" r="10" stroke="currentColor" strokeWidth="2.5" strokeDasharray="3 4" />
    </svg>
  );
}

/** Vista vacía reutilizable: ilustración, título, descripción opcional y un CTA. */
export function EmptyState({ title, description, actionLabel, onAction, action, icon, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}>
      {icon ?? <DefaultIllustration />}
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
      {!action && actionLabel && onAction && (
        <Button type="button" size="sm" onClick={onAction} className="mt-1">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
