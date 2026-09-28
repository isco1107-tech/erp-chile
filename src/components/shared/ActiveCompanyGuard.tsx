'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { clearPrivateOfflineCache } from '@/lib/offline/service-worker';

const STORAGE_KEY = 'aether:active-company';
const CHANNEL_NAME = 'aether-active-company';

interface Announcement {
  companyId: string;
  companyName: string;
}

function parseAnnouncement(value: unknown): Announcement | null {
  if (typeof value !== 'object' || value === null) return null;
  const { companyId, companyName } = value as Record<string, unknown>;
  return typeof companyId === 'string' && typeof companyName === 'string' ? { companyId, companyName } : null;
}

/**
 * La sesión es UNA cookie para todas las pestañas del navegador. Si en una se
 * cambia de empresa, las demás siguen mostrando la anterior, pero todo lo que
 * se guarde desde ellas ya cae en la empresa nueva (una factura, un pago).
 *
 * Cada pestaña anuncia su empresa al cargar; si otra anuncia una distinta,
 * esta se bloquea hasta recargar. `BroadcastChannel` es el canal normal y el
 * evento `storage` el respaldo (ambos solo cruzan pestañas del mismo origen).
 */
export function ActiveCompanyGuard({ companyId, companyName }: { companyId: string; companyName: string }) {
  const [switchedTo, setSwitchedTo] = useState<string | null>(null);
  const reloadButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setSwitchedTo(null);
    const own: Announcement = { companyId, companyName };
    const onAnnouncement = (value: unknown) => {
      const other = parseAnnouncement(value);
      if (other && other.companyId !== companyId) setSwitchedTo(other.companyName);
    };

    try {
      // Esta pestaña abrió en otra empresa que la anterior: la copia sin
      // conexión del POS es de la empresa anterior y se descarta.
      const previous = parseAnnouncement(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null'));
      if (previous && previous.companyId !== companyId) void clearPrivateOfflineCache();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(own));
    } catch {
      // Almacenamiento bloqueado (modo privado estricto): queda BroadcastChannel.
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        onAnnouncement(JSON.parse(event.newValue));
      } catch {
        // Valor ajeno o corrupto: se ignora.
      }
    };
    window.addEventListener('storage', onStorage);

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => onAnnouncement(event.data);
      channel.postMessage(own);
    }

    return () => {
      window.removeEventListener('storage', onStorage);
      channel?.close();
    };
  }, [companyId, companyName]);

  useEffect(() => {
    if (switchedTo) reloadButton.current?.focus();
  }, [switchedTo]);

  if (!switchedTo) return null;

  // Portal directo a <body> y por encima de todo: un modal abierto (tour,
  // asistente de configuración) deja inerte el resto del árbol, y este aviso
  // tiene que poder usarse igual.
  return createPortal(
    <div className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="active-company-guard-title"
        aria-describedby="active-company-guard-description"
        className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-lg"
      >
        <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-muted">
          <Building2 className="size-6 text-muted-foreground" aria-hidden="true" />
        </span>
        <h2 id="active-company-guard-title" className="text-lg font-semibold text-foreground">
          Cambiaste de empresa en otra pestaña
        </h2>
        <p id="active-company-guard-description" className="mt-2 text-sm text-muted-foreground">
          Ahora estás trabajando en <span className="font-medium text-foreground">{switchedTo}</span>. Esta pestaña todavía
          muestra <span className="font-medium text-foreground">{companyName}</span>: recárgala antes de seguir para no
          guardar nada en la empresa equivocada.
        </p>
        <Button ref={reloadButton} className="mt-5" onClick={() => window.location.reload()}>
          Recargar en {switchedTo}
        </Button>
      </div>
    </div>,
    document.body,
  );
}
