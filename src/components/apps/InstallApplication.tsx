'use client';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Download, Check, Smartphone, X } from 'lucide-react';
interface Prompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
const InstallContext = createContext<{
  installed: boolean;
  install(): Promise<boolean>;
} | null>(null);
function standalone() {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
function subscribe(listener: () => void) {
  const media = matchMedia('(display-mode: standalone)');
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
/** Lives in each app layout: the browser's single-use prompt survives navigation from login. */
export function ApplicationInstallProvider({
  scope,
  children,
}: {
  scope: string;
  children: ReactNode;
}) {
  const prompt = useRef<Prompt | null>(null);
  const inApp = useSyncExternalStore(subscribe, standalone, () => false);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const ready = (event: Event) => {
      event.preventDefault();
      prompt.current = event as Prompt;
    };
    const done = () => {
      prompt.current = null;
      setInstalled(true);
    };
    window.addEventListener('beforeinstallprompt', ready);
    window.addEventListener('appinstalled', done);
    if ('serviceWorker' in navigator)
      void navigator.serviceWorker
        .register(`${scope}/install-sw.js`, { scope })
        .catch(() => undefined);
    return () => {
      window.removeEventListener('beforeinstallprompt', ready);
      window.removeEventListener('appinstalled', done);
    };
  }, [scope]);
  async function install() {
    const event = prompt.current;
    if (!event) return false;
    prompt.current = null;
    try {
      await event.prompt();
      return (await event.userChoice).outcome === 'accepted';
    } catch {
      return false;
    }
  }
  return (
    <InstallContext.Provider value={{ installed: installed || inApp, install }}>
      {children}
    </InstallContext.Provider>
  );
}
const devices = {
  iphone: 'iPhone / iPad',
  android: 'Android',
  desktop: 'Computador',
} as const;
type Device = keyof typeof devices;
export default function InstallApplication({
  name,
}: {
  name: string;
  scope: string;
}) {
  const context = useContext(InstallContext);
  const id = useId();
  const [guide, setGuide] = useState(false);
  const [device, setDevice] = useState<Device>('android');
  const [busy, setBusy] = useState(false);
  if (!context)
    throw new Error('InstallApplication requires ApplicationInstallProvider');
  async function install() {
    if (busy || !context) return;
    setBusy(true);
    try {
      if (await context.install()) {
        setGuide(false);
        return;
      }
      setDevice(
        /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
          ? 'iphone'
          : /Android/i.test(navigator.userAgent)
            ? 'android'
            : 'desktop',
      );
      setGuide(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-2xl border border-border bg-card p-4 text-foreground">
      <div className="mb-3 flex items-center gap-3">
        <Smartphone
          className="size-5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <p className="text-sm">
          Tu acceso directo a <strong>{name}</strong>
        </p>
      </div>
      <button
        type="button"
        onClick={() => void install()}
        disabled={busy || context.installed}
        aria-expanded={guide && !context.installed}
        aria-controls={id}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-60"
      >
        {context.installed ? (
          <Check className="size-5 shrink-0" aria-hidden="true" />
        ) : (
          <Download className="size-5 shrink-0" aria-hidden="true" />
        )}
        {context.installed
          ? `${name} instalada`
          : busy
            ? 'Abriendo instalación…'
            : `Instalar ${name}`}
      </button>
      {guide && !context.installed && (
        <div id={id} className="mt-4 text-sm leading-relaxed">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold">Agregar a la pantalla de inicio</p>
            <button
              type="button"
              onClick={() => setGuide(false)}
              aria-label="Cerrar instrucciones de instalación"
              className="flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          </div>
          <div
            className="my-2 flex flex-wrap gap-2"
            aria-label="Tu dispositivo"
          >
            {(Object.keys(devices) as Device[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={device === key}
                onClick={() => setDevice(key)}
                className={`min-h-11 rounded-xl border px-3 ${device === key ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
              >
                {devices[key]}
              </button>
            ))}
          </div>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              {device === 'iphone'
                ? 'Abre esta página en Safari.'
                : device === 'android'
                  ? 'Abre esta página en Chrome.'
                  : 'Abre esta página en Chrome o Edge.'}
            </li>
            <li>
              {device === 'iphone'
                ? 'Toca Compartir y luego Agregar a pantalla de inicio.'
                : 'Abre el menú del navegador y elige Instalar aplicación o Agregar a pantalla de inicio.'}
            </li>
            <li>Confirma el nombre y abre {name} desde su nuevo icono.</li>
          </ol>
          <p className="mt-3 text-muted-foreground">
            Si abriste el enlace desde WhatsApp u otra app, usa primero «Abrir
            en el navegador». Necesitas conexión para consultar datos
            actualizados.
          </p>
        </div>
      )}
    </div>
  );
}
