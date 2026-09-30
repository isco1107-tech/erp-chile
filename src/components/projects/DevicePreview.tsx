'use client';

import { useState } from 'react';
import { ExternalLink, Monitor, RefreshCw, Smartphone, Tablet } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Device {
  id: string;
  label: string;
  width: number;
  height: number;
  kind: 'phone' | 'tablet' | 'desktop';
}

/** Las pantallas más comunes de quienes visitan el sitio (las mismas que revisa `npm run verify:responsive`). */
const DEVICES: Device[] = [
  { id: 'iphone-se', label: 'iPhone SE', width: 375, height: 667, kind: 'phone' },
  { id: 'android', label: 'Android', width: 360, height: 740, kind: 'phone' },
  { id: 'iphone-15', label: 'iPhone 15', width: 390, height: 844, kind: 'phone' },
  { id: 'ipad', label: 'iPad', width: 768, height: 1024, kind: 'tablet' },
  { id: 'notebook', label: 'Notebook', width: 1280, height: 720, kind: 'desktop' },
  { id: 'escritorio', label: 'Escritorio', width: 1440, height: 900, kind: 'desktop' },
  { id: 'full-hd', label: 'Full HD', width: 1920, height: 1080, kind: 'desktop' },
];

const FRAME_MAX_HEIGHT = 560;
const FRAME_MAX_WIDTH = 760;

const ICONS = { phone: Smartphone, tablet: Tablet, desktop: Monitor } as const;

/**
 * Visor para ver el sitio del certamen en varias pantallas ANTES de publicarlo.
 * Incrusta la vista previa del equipo (`/preview/certamen/[id]`, que muestra el
 * sitio aunque aún esté apagado) en marcos del tamaño real de cada dispositivo,
 * reducidos para que quepan. Muestra lo último que se guardó: si cambias algo,
 * guarda y pulsa "Actualizar".
 */
export function DevicePreview({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<string>('all');
  const src = `/preview/certamen/${projectId}`;
  const shown = selected === 'all' ? DEVICES : DEVICES.filter((d) => d.id === selected);

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-card" aria-labelledby="device-preview-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="device-preview-title" className="text-base font-semibold">
            Vista previa por dispositivos
          </h2>
          <p className="text-xs text-muted-foreground">
            Revisa cómo se ve el sitio en teléfonos, tabletas y pantallas grandes antes de publicarlo. Muestra lo último que guardaste, aunque el sitio esté apagado.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {open && (
            <>
              <Button type="button" size="sm" variant="outline" onClick={() => setReload((n) => n + 1)}>
                <RefreshCw aria-hidden="true" />
                Actualizar
              </Button>
              <a href={src} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted">
                <ExternalLink className="size-4" aria-hidden="true" />
                Abrir aparte
              </a>
            </>
          )}
          <Button type="button" size="sm" variant={open ? 'ghost' : 'default'} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? 'Ocultar' : 'Ver en dispositivos'}
          </Button>
        </div>
      </div>

      {open && (
        <>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Dispositivo">
            {[{ id: 'all', label: 'Todos' }, ...DEVICES].map((d) => (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={selected === d.id}
                onClick={() => setSelected(d.id)}
                className={`rounded-full border px-3 py-1 text-sm ${selected === d.id ? 'border-foreground font-medium' : 'border-border text-muted-foreground'}`}
              >
                {d.label}
              </button>
            ))}
          </div>

          <div className="flex gap-6 overflow-x-auto pb-3" tabIndex={0} aria-label="Marcos de dispositivos (desliza para ver más)">
            {shown.map((device) => {
              const scale = Math.min(1, FRAME_MAX_HEIGHT / device.height, FRAME_MAX_WIDTH / device.width);
              const Icon = ICONS[device.kind];
              return (
                <figure key={device.id} className="m-0 shrink-0 space-y-2">
                  <figcaption className="flex items-center gap-1.5 text-sm">
                    <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                    <span className="font-medium">{device.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {device.width} × {device.height}
                    </span>
                  </figcaption>
                  <div className="overflow-hidden rounded-xl border-4 border-foreground/80 bg-background shadow-md" style={{ width: device.width * scale, height: device.height * scale }}>
                    <iframe
                      key={reload}
                      src={src}
                      title={`Vista previa en ${device.label}`}
                      loading="lazy"
                      style={{ width: device.width, height: device.height, transform: `scale(${scale})`, transformOrigin: 'top left', border: 0 }}
                    />
                  </div>
                </figure>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
