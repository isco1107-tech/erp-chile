'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { santiagoClock, sessionExpiryPlan, SESSION_WARNING_MINUTES } from '@/lib/auth/session-expiry';

/**
 * Avisa antes de que la sesión de 8 horas se cierre y, al cerrarse, ofrece
 * volver a ingresar. Antes la sesión vencía en silencio y la siguiente acción
 * solo decía «Sesión inválida o expirada», con el formulario a medio llenar.
 */
export default function SessionExpiryNotice({ expiresAt }: { expiresAt: number | null }) {
  const router = useRouter();

  useEffect(() => {
    if (!expiresAt) return;
    const { warnInMs, expireInMs } = sessionExpiryPlan(expiresAt, Date.now());
    const timers: number[] = [];
    if (expireInMs > 0) {
      timers.push(
        window.setTimeout(() => {
          toast.warning(`Tu sesión se cerrará a las ${santiagoClock(new Date(expiresAt))}`, {
            id: 'session-expiry',
            description: `Faltan ${SESSION_WARNING_MINUTES} minutos o menos. Guarda o emite lo que estés haciendo: después tendrás que volver a ingresar.`,
            duration: Infinity,
          });
        }, warnInMs)
      );
    }
    timers.push(
      window.setTimeout(() => {
        toast.error('Tu sesión terminó', {
          id: 'session-expiry',
          description: 'Por seguridad la sesión dura 8 horas. Lo que no alcanzaste a guardar no se envió.',
          duration: Infinity,
          action: { label: 'Volver a ingresar', onClick: () => router.push('/login') },
        });
      }, expireInMs)
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [expiresAt, router]);

  return null;
}
