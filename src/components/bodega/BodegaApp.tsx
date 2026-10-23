'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Lock, WifiOff } from 'lucide-react';
import { ConfirmProvider } from '@/components/ui/confirm-provider';
import type { MobileMode } from '@/lib/warehouse-mobile/modes';
import { BodegaProvider, useBodega } from './BodegaProvider';
import HomeScreen from './HomeScreen';
import OutboxScreen from './OutboxScreen';
import SessionScreen from './SessionScreen';

/**
 * App del bodeguero. Una sola página con tres pantallas (inicio, lista de
 * trabajo y pendientes) que se cambian sin pedirle nada al servidor: así sigue
 * funcionando sin señal. El botón «atrás» del teléfono navega entre ellas.
 */

type Screen = 'home' | 'session' | 'outbox';

function isScreen(value: unknown): value is Screen {
  return value === 'home' || value === 'session' || value === 'outbox';
}

function Splash({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden="true" />
      <p className="text-base text-muted-foreground">{message}</p>
    </div>
  );
}

function Shell() {
  const { boot, draft, startDraft, online, refreshBootstrap } = useBodega();
  const [screen, setScreen] = useState<Screen>('home');

  const go = useCallback((next: Screen) => {
    // Next.js 16 integra pushState: conserva su estado interno y no pide nada al servidor.
    if (next !== 'home') window.history.pushState({ screen: next }, '');
    setScreen(next);
  }, []);

  const back = useCallback(() => {
    if (isScreen((window.history.state as { screen?: unknown } | null)?.screen)) window.history.back();
    else setScreen('home');
  }, []);

  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const next = (event.state as { screen?: unknown } | null)?.screen;
      setScreen(isScreen(next) ? next : 'home');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Si había una lista a medias al abrir, la persona la ve en el inicio ("Continuar"): no se la fuerza.
  const start = useCallback(
    (mode: MobileMode) => {
      if (startDraft(mode) === 'ok') go('session');
    },
    [go, startDraft]
  );

  if (boot.status === 'loading') return <Splash message="Abriendo tu bodega…" />;

  if (boot.status === 'login') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <Lock className="size-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Inicia sesión</h1>
        <p className="max-w-xs text-base text-muted-foreground">{boot.message}</p>
        <a href="/login?callbackUrl=/bodega" className="inline-flex h-12 items-center rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground">
          Entrar
        </a>
      </div>
    );
  }

  if (boot.status === 'blocked') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <WifiOff className="size-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">No se pudo abrir</h1>
        <p className="max-w-xs text-base text-muted-foreground">{boot.message}</p>
        <button type="button" onClick={() => void refreshBootstrap()} disabled={!online} className="inline-flex h-12 items-center rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground disabled:opacity-50">
          Reintentar
        </button>
      </div>
    );
  }

  if (screen === 'session' && draft) return <SessionScreen onBack={back} onDone={back} />;
  if (screen === 'outbox') return <OutboxScreen onBack={back} />;
  return <HomeScreen onStart={start} onContinue={() => go('session')} onOutbox={() => go('outbox')} />;
}

export default function BodegaApp() {
  return (
    <ConfirmProvider>
      <BodegaProvider>
        <Shell />
      </BodegaProvider>
    </ConfirmProvider>
  );
}
