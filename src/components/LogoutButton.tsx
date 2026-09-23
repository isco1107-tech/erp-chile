"use client";

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { captureException } from '@/lib/observability';
import { cn } from '@/lib/utils';

/**
 * `variant="icon"`: botón discreto para la barra lateral (junto al nombre del
 * usuario). Antes era un botón rojo sólido siempre visible, que competía con
 * la navegación por atención para una acción que se usa una vez al día.
 */
export default function LogoutButton({ variant = 'text', className }: { variant?: 'text' | 'icon'; className?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch('/api/auth/signout', { method: 'POST' });
      router.push('/login');
    } catch (e) {
      captureException(e, { module: 'auth', extra: { reason: 'logout-button' } });
    } finally {
      setLoading(false);
    }
  }

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={handleLogout}
        disabled={loading}
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-2 focus-visible:outline-sidebar-ring disabled:opacity-50',
          className
        )}
      >
        <LogOut className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className={cn('rounded-lg px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50', className)}
    >
      {loading ? 'Saliendo…' : 'Cerrar sesión'}
    </button>
  );
}
