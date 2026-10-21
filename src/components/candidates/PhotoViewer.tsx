'use client';

import { useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

/**
 * Envuelve una miniatura recortada (marco cuadrado/redondeado con
 * `object-cover`) y, al pincharla, abre la foto completa en grande, sin
 * recorte. `src` es la misma URL que ya usa la miniatura, así que no cambia
 * qué ruta ni qué permisos se aplican a la imagen.
 */
export default function PhotoViewer({
  src,
  alt,
  className,
  children,
}: {
  src: string;
  alt: string;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Ver foto completa: ${alt}`}
        className={className ?? 'block cursor-zoom-in outline-none focus-visible:ring-3 focus-visible:ring-ring/50'}
      >
        {children}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl bg-black/90 p-2 sm:p-3" showClose>
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="mx-auto max-h-[80vh] w-auto max-w-full rounded-lg object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}
