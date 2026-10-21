'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import type { IScannerControls } from '@zxing/browser';

type ScannerProps = { onClose: () => void } & ({ onCode: (code: string) => void; onDetected?: never } | { onCode?: never; onDetected: (code: string) => void });
export function CameraScanner({ onCode, onDetected, onClose }: ScannerProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const handleCode = onCode ?? onDetected;
  useEffect(() => {
    let disposed = false;
    let controls: IScannerControls | undefined;
    let found = false;
    const element = video.current;
    void import('@zxing/browser').then(async ({ BrowserMultiFormatReader }) => {
      if (disposed || !video.current) return;
      const reader = new BrowserMultiFormatReader();
      controls = await reader.decodeFromConstraints({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }, video.current, (result, _problem, current) => {
        if (!result || found || disposed) return;
        found = true; current.stop(); handleCode(result.getText());
      });
      if (disposed) controls.stop();
    }).catch(() => { if (!disposed) setError('No pudimos abrir la cámara. Permite el acceso en tu navegador o escribe el código.'); });
    return () => { disposed = true; controls?.stop(); const stream = element?.srcObject; if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop()); };
  }, [handleCode]);
  return <div className="fixed inset-0 z-50 flex flex-col bg-background p-5" role="dialog" aria-modal="true" aria-labelledby="scanner-title">
    <div className="mx-auto flex w-full max-w-lg items-center justify-between"><h2 id="scanner-title" className="text-lg font-semibold">Escanear código</h2><button type="button" onClick={onClose} className="rounded-xl border border-border p-3" aria-label="Cerrar cámara" autoFocus><X size={22} /></button></div>
    <div className="relative mx-auto my-auto w-full max-w-lg overflow-hidden rounded-3xl border border-border bg-card">
      <video ref={video} muted playsInline className="aspect-[3/4] w-full object-cover" />
      <div className="pointer-events-none absolute inset-12 rounded-2xl border-2 border-primary" />
    </div>
    <p className="mx-auto mt-4 max-w-lg text-center text-sm text-muted-foreground" role="status">{error || 'Centra un solo código dentro del recuadro. La lectura se detiene al reconocerlo.'}</p>
    <button type="button" onClick={onClose} className="mx-auto mt-4 flex min-h-12 items-center gap-2 rounded-xl border border-border px-5"><Camera size={18} /> Usar búsqueda manual</button>
  </div>;
}
