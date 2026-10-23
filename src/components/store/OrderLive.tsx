'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { payUrl, postJson } from './store-api';
import { Notice } from './ui';

/**
 * Parte interactiva de la página del pedido: mientras el pago en línea siga pendiente la página se
 * vuelve a consultar sola (el servidor pregunta a la pasarela) y se ofrece «Pagar ahora» para
 * quien cerró la ventana de pago. Se detiene a los 20 minutos para no consultar para siempre.
 */
const POLL_MS = 10_000;
const POLL_MAX_MS = 20 * 60_000;

export default function OrderLive({ accessToken, waitingOnline, canRetry }: { accessToken: string; waitingOnline: boolean; canRetry: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!waitingOnline) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - started > POLL_MAX_MS) {
        window.clearInterval(timer);
        return;
      }
      router.refresh();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [waitingOnline, router]);

  if (!waitingOnline || !canRetry) return null;
  return (
    <div className="space-y-3">
      <button
        type="button"
        className="ws-btn ws-btn-main w-full @md:w-auto"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const result = await postJson<{ redirectUrl: string }>(payUrl(accessToken), {});
          if (!result.ok) {
            setBusy(false);
            setError(result.error);
            return;
          }
          window.location.assign(result.data.redirectUrl);
        }}
      >
        {busy && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
        {busy ? 'Abriendo el pago…' : 'Pagar ahora'}
      </button>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
