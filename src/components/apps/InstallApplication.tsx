'use client';
import { useEffect, useRef, useState } from 'react';
import { Download, Check } from 'lucide-react';
interface Prompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
export default function InstallApplication({
  name,
  scope,
}: {
  name: string;
  scope: string;
}) {
  const prompt = useRef<Prompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [guide, setGuide] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const media = matchMedia('(display-mode: standalone)');
    const update = () =>
      setInstalled(
        media.matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone ===
            true,
      );
    const ready = (event: Event) => {
      event.preventDefault();
      prompt.current = event as Prompt;
    };
    const done = () => {
      prompt.current = null;
      setInstalled(true);
    };
    update();
    media.addEventListener('change', update);
    window.addEventListener('beforeinstallprompt', ready);
    window.addEventListener('appinstalled', done);
    if ('serviceWorker' in navigator)
      void navigator.serviceWorker
        .register(`${scope}/install-sw.js`, { scope })
        .catch(() => undefined);
    return () => {
      media.removeEventListener('change', update);
      window.removeEventListener('beforeinstallprompt', ready);
      window.removeEventListener('appinstalled', done);
    };
  }, [scope]);
  async function install() {
    if (busy) return;
    const event = prompt.current;
    if (!event) {
      setGuide(true);
      return;
    }
    prompt.current = null;
    setBusy(true);
    try {
      await event.prompt();
      if ((await event.userChoice).outcome === 'dismissed') setGuide(true);
    } catch {
      setGuide(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-2xl border border-border bg-card p-4 text-foreground">
      <button
        type="button"
        onClick={() => void install()}
        disabled={busy || installed}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-60"
      >
        {installed ? (
          <Check className="size-5" />
        ) : (
          <Download className="size-5" />
        )}
        {installed
          ? `${name} instalada`
          : busy
            ? 'Abriendo instalación…'
            : `Instalar ${name}`}
      </button>
      {guide && (
        <div role="status" className="mt-3 text-sm leading-relaxed">
          <p className="font-semibold">Agregar a la pantalla de inicio</p>
          <p className="mt-1">
            En iPhone: abre en Safari → Compartir → Agregar a pantalla de
            inicio. En Android o computador: abre el menú de Chrome o Edge →
            Instalar aplicación.
          </p>
          <p className="mt-2 text-muted-foreground">
            La instalación crea un acceso propio. Necesitas conexión y tu cuenta
            para consultar datos actualizados.
          </p>
        </div>
      )}
    </div>
  );
}
