'use client';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Download, Check, X } from 'lucide-react';
import { APPS, appIconPaths, pathInScope, type AppDefinition, type AppId } from '@/lib/apps/registry';

interface Prompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface RelatedApps {
  getInstalledRelatedApps?: () => Promise<{ platform: string; url?: string }[]>;
}

export interface ApplicationInstall {
  app: AppDefinition;
  /** Esta ventana ES la app instalada (abierta desde su ícono). */
  installed: boolean;
  /** La app está instalada en este equipo, pero se está viendo desde una pestaña del navegador. */
  elsewhere: boolean;
  /** Abre el cuadro de instalación del navegador. `false` si el navegador no lo ofrece (hay que mostrar los pasos a mano). */
  install(): Promise<boolean>;
}

const InstallContext = createContext<ApplicationInstall | null>(null);

/** Marca de la ventana: qué app se abrió en ella (sessionStorage es por ventana). */
const WINDOW_MARK = 'aether:pwa-window';

function standalone() {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * ¿Esta ventana es la app `app` instalada? `display-mode: standalone` solo dice
 * que la ventana es de ALGUNA app instalada: con el ERP instalado y abierto, un
 * enlace a Bodega seguía respondiendo «standalone» y Bodega creía estar
 * instalada. Por eso además exige estar dentro de su alcance y que la ventana no
 * haya sido abierta por otra app (la primera app que se muestra en una ventana
 * la reclama; ver `AppWindowMarker`).
 */
function runsAsInstalledApp(app: AppDefinition): boolean {
  if (!standalone() || !pathInScope(location.pathname, app.scope)) return false;
  try {
    const mark = sessionStorage.getItem(WINDOW_MARK);
    if (mark && mark !== app.id) return false;
    if (!mark) sessionStorage.setItem(WINDOW_MARK, app.id);
  } catch {
    // Sin almacenamiento (modo privado): se decide solo por el alcance.
  }
  return true;
}

/** Reclama la ventana para el ERP: el panel no tiene tarjeta de instalación, pero sus enlaces hacia otras apps no deben hacerlas pasar por instaladas. */
export function AppWindowMarker({ app }: { app: AppId }) {
  useEffect(() => {
    try {
      if (standalone() && !sessionStorage.getItem(WINDOW_MARK)) sessionStorage.setItem(WINDOW_MARK, app);
    } catch {
      // Sin almacenamiento: no hay marca.
    }
  }, [app]);
  return null;
}

/** Dentro de las apps de escritorio (Tauri) no se ofrece instalar nada. */
function inDesktopShell() {
  return (
    '__TAURI_INTERNALS__' in window ||
    '__TAURI__' in window ||
    /\bAetherDesktop\//i.test(navigator.userAgent)
  );
}

/** Vive en el layout de cada app: el cuadro de instalación del navegador se usa una sola vez y debe sobrevivir a la navegación desde el ingreso. */
export function ApplicationInstallProvider({
  app: appId,
  children,
}: {
  app: AppId;
  children: ReactNode;
}) {
  const app = APPS[appId];
  const prompt = useRef<Prompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [elsewhere, setElsewhere] = useState(false);

  useEffect(() => {
    if (inDesktopShell()) return;
    const media = matchMedia('(display-mode: standalone)');
    const refresh = () => setInstalled(runsAsInstalledApp(app));
    refresh();
    media.addEventListener('change', refresh);

    const ready = (event: Event) => {
      event.preventDefault();
      prompt.current = event as Prompt;
      // Si el navegador ofrece instalar, la app NO está instalada (aunque otra señal diga lo contrario).
      setElsewhere(false);
    };
    const done = () => {
      prompt.current = null;
      setInstalled(true);
    };
    window.addEventListener('beforeinstallprompt', ready);
    window.addEventListener('appinstalled', done);

    // Visitada desde el navegador con la app ya instalada: lo sabemos por el manifest de la propia app.
    const related = navigator as Navigator & RelatedApps;
    if (related.getInstalledRelatedApps && !runsAsInstalledApp(app)) {
      const own = new URL(app.manifestPath, location.origin).toString();
      void related
        .getInstalledRelatedApps()
        .then((list) => {
          if (list.some((item) => item.platform === 'webapp' && (!item.url || item.url === own)) && !prompt.current) {
            setElsewhere(true);
          }
        })
        .catch(() => undefined);
    }

    if ('serviceWorker' in navigator && (!app.worker.productionOnly || process.env.NODE_ENV === 'production')) {
      void navigator.serviceWorker.register(app.worker.url, { scope: app.scope }).catch(() => undefined);
    }
    return () => {
      media.removeEventListener('change', refresh);
      window.removeEventListener('beforeinstallprompt', ready);
      window.removeEventListener('appinstalled', done);
    };
  }, [app]);

  async function install() {
    const event = prompt.current;
    if (!event) return false;
    // El cuadro del navegador solo se puede usar una vez; cerrarlo no es instalar.
    prompt.current = null;
    try {
      await event.prompt();
      return (await event.userChoice).outcome === 'accepted';
    } catch {
      return false;
    }
  }

  return (
    <InstallContext.Provider value={{ app, installed, elsewhere, install }}>
      {children}
    </InstallContext.Provider>
  );
}

export function useApplicationInstall(): ApplicationInstall {
  const context = useContext(InstallContext);
  if (!context) throw new Error('useApplicationInstall requires ApplicationInstallProvider');
  return context;
}

const devices = {
  iphone: 'iPhone / iPad',
  android: 'Android',
  desktop: 'Computador',
} as const;
type Device = keyof typeof devices;

export function detectDevice(): Device {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    ? 'iphone'
    : /Android/i.test(navigator.userAgent)
      ? 'android'
      : 'desktop';
}

export default function InstallApplication() {
  const context = useApplicationInstall();
  const { app } = context;
  const id = useId();
  const [guide, setGuide] = useState(false);
  const [device, setDevice] = useState<Device>('android');
  const [busy, setBusy] = useState(false);
  const [desktopShell, setDesktopShell] = useState(false);
  useEffect(() => setDesktopShell(inDesktopShell()), []);
  if (desktopShell) return null;

  const done = context.installed || context.elsewhere;

  async function install() {
    if (busy || done) return;
    setBusy(true);
    try {
      if (await context.install()) {
        setGuide(false);
        return;
      }
      setDevice(detectDevice());
      setGuide(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-2xl border border-border bg-card p-4 text-foreground">
      <div className="mb-3 flex items-center gap-3">
        {/* El ícono real de la app: es el que quedará en la pantalla de inicio. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={appIconPaths(app.id).any192}
          alt=""
          width={44}
          height={44}
          className="size-11 shrink-0 rounded-xl"
        />
        <p className="text-sm">
          Tu acceso directo a <strong>{app.name}</strong>
        </p>
      </div>
      <button
        type="button"
        onClick={() => void install()}
        disabled={busy || done}
        aria-expanded={guide && !done}
        aria-controls={id}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-60"
      >
        {done ? (
          <Check className="size-5 shrink-0" aria-hidden="true" />
        ) : (
          <Download className="size-5 shrink-0" aria-hidden="true" />
        )}
        {context.installed
          ? `${app.name} instalada`
          : context.elsewhere
            ? `${app.name} ya está en este equipo`
            : busy
              ? 'Abriendo instalación…'
              : `Instalar ${app.name}`}
      </button>
      {context.elsewhere && !context.installed && (
        <p className="mt-3 text-sm text-muted-foreground">
          Ábrela desde su ícono en la pantalla de inicio: allí funciona a
          pantalla completa.
        </p>
      )}
      {guide && !done && (
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
            <li>Confirma el nombre y abre {app.name} desde su nuevo icono.</li>
          </ol>
          <p className="mt-3 text-muted-foreground">
            Cada app de Aether se instala por separado y tiene su propio ícono:
            tener otra instalada no cambia este paso. Si abriste el enlace desde
            WhatsApp u otra app, usa primero «Abrir en el navegador». Necesitas
            conexión para consultar datos actualizados.
          </p>
        </div>
      )}
    </div>
  );
}
