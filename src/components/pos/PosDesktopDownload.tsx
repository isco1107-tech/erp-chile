'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Download, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import manifest from '../../../public/downloads/pos-releases.json';

type DesktopRelease = {
  platform: string;
  architecture: string;
  version: string;
  file: string;
  size: number;
  sha256: string;
};

const releases: DesktopRelease[] = manifest;
const systems = [
  { platform: 'windows', architecture: 'x64', label: 'Windows 10 / 11', detail: '64 bits · instalador .exe' },
  { platform: 'macos', architecture: 'arm64', label: 'Mac con Apple Silicon', detail: 'M1 o posterior · .dmg' },
  { platform: 'macos', architecture: 'x64', label: 'Mac con Intel', detail: 'Intel · .dmg' },
  { platform: 'linux', architecture: 'x64', label: 'Linux', detail: '64 bits · AppImage' },
];

/** Only verified POS releases appear here; the general ERP installer is separate. */
export function PosDesktopDownload() {
  const [open, setOpen] = useState(false);
  return <>
    <Button type="button" variant="outline" size="sm" onClick={() => { if (document.querySelector('[data-pos-pending="true"]')) { toast.warning('Confirma la operación pendiente antes de abrir las descargas.'); return; } setOpen(true); }}>
      <Download className="size-4" aria-hidden="true" /> Descargar app POS
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="theme-saas-light">
        <DialogHeader>
          <DialogTitle>Instalar Aether POS</DialogTitle>
          <DialogDescription>Abre tu punto de venta desde el escritorio y entra con tu cuenta de cajero. Ventas, stock y caja se confirman en el ERP con conexión a internet.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {systems.map(system => {
            const release = releases.find(item => item.platform === system.platform && item.architecture === system.architecture);
            return <div key={`${system.platform}-${system.architecture}`} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
              <Monitor className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1"><p className="text-sm font-medium">{system.label}</p><p className="text-xs text-muted-foreground">{system.detail}{release ? ` · v${release.version} · ${(release.size / 1024 / 1024).toFixed(1)} MB` : ''}</p></div>
              {release ? <a href={`/downloads/${release.file}`} download className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground" aria-label={`Descargar Aether POS para ${system.label}`}><Download className="size-4" aria-hidden="true" />Descargar</a> : <span className="text-xs text-muted-foreground">En preparación</span>}
            </div>;
          })}
        </div>
        <a href="/apps" className="mt-4 block text-sm underline">Ver todas las aplicaciones Aether</a>
        <p className="mt-4 text-xs text-muted-foreground">Instala la aplicación y fíjala en el escritorio, el menú Inicio o el Dock. La aplicación requiere una cuenta activa con acceso al POS. Cada persona debe usar su propia cuenta.</p>
        {releases.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Los instaladores aún no tienen firma comercial. <a className="underline" href="/downloads/POS-SHA256SUMS.txt" target="_blank" rel="noreferrer">Verificar integridad SHA-256</a>.</p>}
      </DialogContent>
    </Dialog>
  </>;
}
