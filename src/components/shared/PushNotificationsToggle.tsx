'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BellRing } from 'lucide-react';
import { deletePushSubscriptionAction, getPushPublicKeyAction, savePushSubscriptionAction } from '@/lib/actions/push-subscriptions';

type PushState = 'hidden' | 'denied' | 'off' | 'on' | 'busy';

const SW_URL = '/sw.js';

/** La llave VAPID viaja en base64url; `pushManager.subscribe` la pide en bytes. */
function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration(SW_URL);
  return registration ? registration.pushManager.getSubscription() : null;
}

/**
 * Activa o desactiva los avisos de la campanita en ESTE dispositivo (Web
 * Push). No aparece si el navegador no lo soporta (en iPhone, solo con la
 * app agregada a la pantalla de inicio) o si el servidor no tiene VAPID.
 */
export function PushNotificationsToggle() {
  const [state, setState] = useState<PushState>('hidden');
  const [publicKey, setPublicKey] = useState<string | null>(null);

  useEffect(() => {
    if (!pushSupported()) return;
    let cancelled = false;
    (async () => {
      const result = await getPushPublicKeyAction();
      if (cancelled || !result.success || !result.data.publicKey) return;
      setPublicKey(result.data.publicKey);
      if (Notification.permission === 'denied') return setState('denied');
      setState((await currentSubscription()) ? 'on' : 'off');
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    if (!publicKey) return;
    setState('busy');
    let subscription: PushSubscription | null = null;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      await navigator.serviceWorker.register(SW_URL);
      const registration = await navigator.serviceWorker.ready;
      subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) }));
      const result = await savePushSubscriptionAction(subscription.toJSON());
      if (!result.success) {
        await subscription.unsubscribe();
        toast.error(result.error);
        setState('off');
        return;
      }
      toast.success(result.message ?? 'Avisos activados');
      setState('on');
    } catch {
      await subscription?.unsubscribe().catch(() => undefined);
      toast.error('Este navegador no permitió activar los avisos');
      setState('off');
    }
  }

  async function disable() {
    setState('busy');
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        await deletePushSubscriptionAction(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState('off');
    } catch {
      toast.error('No se pudieron desactivar los avisos');
      setState('on');
    }
  }

  if (state === 'hidden') return null;

  return (
    <div className="mt-1 flex items-center gap-2 border-t border-border px-2 pt-2 pb-1 text-xs">
      <BellRing className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="flex-1 text-muted-foreground">
        {state === 'denied' ? 'Avisos bloqueados en este navegador' : 'Avisos en este dispositivo'}
      </span>
      {state !== 'denied' && (
        <button
          type="button"
          disabled={state === 'busy'}
          onClick={state === 'on' ? disable : enable}
          className="rounded-md px-2 py-1 font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          {state === 'on' ? 'Desactivar' : state === 'busy' ? '…' : 'Activar'}
        </button>
      )}
    </div>
  );
}
