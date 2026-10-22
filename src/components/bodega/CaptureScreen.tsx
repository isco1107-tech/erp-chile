'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, ImagePlus, Zap, ZapOff, X } from 'lucide-react';
import { CameraError, openCamera, type CameraHandle } from '@/lib/warehouse-mobile/client/camera';
import { prepareFromFile, prepareFromVideo, type PreparedPhoto } from '@/lib/warehouse-mobile/client/image';
import { createScanner, type CodeScanner } from '@/lib/warehouse-mobile/client/scanner';
import { BigButton } from './ui';

/**
 * Cámara a pantalla completa para agregar productos a la lista:
 *  - Si en el cuadro aparece un código de barras creíble, se lee solo y se agrega
 *    (sin IA, sin costo). Leer de nuevo el mismo código suma otra unidad.
 *  - Si no hay código, el botón redondo saca una foto del producto: queda en la
 *    lista "identificándose" y se sigue trabajando mientras se reconoce.
 * La cámara queda abierta para agregar varios seguidos; "Listo" vuelve a la lista.
 *
 * Si la cámara no se puede abrir (permiso negado, navegador sin soporte), se
 * ofrece la cámara del teléfono, que sí entrega la foto.
 */

interface Props {
  onCode: (code: string) => void;
  onPhoto?: (photo: PreparedPhoto) => Promise<void>;
  onClose: () => void;
  /** Solo leer UN código y cerrar (para llenar el código de barras de un producto nuevo). */
  scanOnly?: boolean;
}

/**
 * Un mismo código vuelve a contar solo si salió del cuadro un momento: apuntar
 * y quedarse mirando no debe sumar una unidad cada segundo. Para sumar otra
 * unidad, se aparta la cámara y se vuelve a apuntar (o se usa el botón +).
 */
const ABSENCE_MS = 700;
const SCAN_INTERVAL_MS = 140;

function beep(): void {
  try {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    const context = new Context();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880;
    gain.gain.value = 0.08;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.09);
    oscillator.onended = () => void context.close();
  } catch {
    /* sin sonido: el aviso en pantalla basta */
  }
}

export default function CaptureScreen({ onCode, onPhoto, onClose, scanOnly = false }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const camera = useRef<CameraHandle | null>(null);
  const [problem, setProblem] = useState<CameraError | null>(null);
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [added, setAdded] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCodeRef = useRef(onCode);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCodeRef.current = onCode;
    onCloseRef.current = onClose;
  }, [onCode, onClose]);

  const announce = useCallback((message: string) => {
    setFlash(message);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 1600);
  }, []);

  // Cámara + lector de códigos.
  useEffect(() => {
    let cancelled = false;
    let scanner: CodeScanner | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last = { code: '', seenAt: 0 };

    void (async () => {
      try {
        const handle = await openCamera();
        if (cancelled) {
          handle.stop();
          return;
        }
        camera.current = handle;
        setTorchSupported(handle.torchSupported);
        const element = video.current;
        if (!element) return;
        element.srcObject = handle.stream;
        await element.play().catch(() => undefined);
        setReady(true);

        scanner = await createScanner();
        const tick = async () => {
          if (cancelled) return;
          if (!document.hidden && scanner && element.readyState >= 2) {
            const code = await scanner.scan(element).catch(() => null);
            const now = Date.now();
            const reappeared = code !== null && (code !== last.code || now - last.seenAt >= ABSENCE_MS);
            if (code) last = { code: reappeared ? code : last.code, seenAt: now };
            if (code && reappeared) {
              beep();
              navigator.vibrate?.(60);
              onCodeRef.current(code);
              if (scanOnly) {
                onCloseRef.current();
                return;
              }
              setAdded((count) => count + 1);
              announce(`Código ${code} leído`);
            }
          }
          timer = setTimeout(tick, SCAN_INTERVAL_MS);
        };
        void tick();
      } catch (error) {
        if (!cancelled) setProblem(error instanceof CameraError ? error : new CameraError('unavailable', 'No se pudo abrir la cámara.'));
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      scanner?.dispose();
      camera.current?.stop();
      camera.current = null;
    };
  }, [announce, scanOnly]);

  const takePhoto = async () => {
    const element = video.current;
    if (!element || busy || !onPhoto) return;
    setBusy(true);
    try {
      const photo = await prepareFromVideo(element);
      beep();
      navigator.vibrate?.(40);
      await onPhoto(photo);
      setAdded((count) => count + 1);
      announce('Foto guardada. Se está identificando.');
    } catch {
      announce('No se pudo sacar la foto. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const fromFile = async (file: File | undefined) => {
    if (!file || !onPhoto) return;
    setBusy(true);
    try {
      await onPhoto(await prepareFromFile(file));
      setAdded((count) => count + 1);
      announce('Foto guardada. Se está identificando.');
    } catch {
      announce('No se pudo leer esa foto.');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const toggleTorch = async () => {
    const next = !torch;
    await camera.current?.setTorch(next).catch(() => undefined);
    setTorch(next);
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Cámara">
      {/* Cámara en vivo */}
      <video ref={video} playsInline muted autoPlay className="absolute inset-0 size-full object-cover" />

      {/* Marco de apuntado */}
      {ready && !problem ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[28%] w-[82%] rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>
      ) : null}

      <div className="relative z-10 flex items-center justify-between gap-2 p-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} aria-label="Cerrar cámara" className="flex size-12 items-center justify-center rounded-full bg-black/55">
          <X className="size-6" />
        </button>
        <span className="rounded-full bg-black/55 px-3 py-1.5 text-sm font-medium" aria-live="polite">
          {scanOnly ? 'Lee el código de barras' : added === 0 ? 'Nada agregado aún' : `${added} agregado${added === 1 ? '' : 's'}`}
        </span>
        {torchSupported ? (
          <button type="button" onClick={() => void toggleTorch()} aria-label={torch ? 'Apagar linterna' : 'Encender linterna'} aria-pressed={torch} className="flex size-12 items-center justify-center rounded-full bg-black/55">
            {torch ? <Zap className="size-6 text-brand-gold" /> : <ZapOff className="size-6" />}
          </button>
        ) : (
          <span className="size-12" />
        )}
      </div>

      {flash ? (
        <div role="status" className="relative z-10 mx-auto mt-2 flex max-w-[90%] items-center gap-2 rounded-full bg-success px-4 py-2 text-sm font-medium text-white shadow-lg">
          <Check className="size-4 shrink-0" />
          <span className="truncate">{flash}</span>
        </div>
      ) : null}

      {problem ? (
        <div className="relative z-10 m-4 mt-8 rounded-2xl bg-black/70 p-5 text-center">
          <Camera className="mx-auto size-10 text-white/80" />
          <p className="mt-3 text-base font-medium">{problem.message}</p>
          <div className="mt-4 flex flex-col gap-2">
            {onPhoto ? (
              <BigButton onClick={() => fileInput.current?.click()} disabled={busy}>
                <ImagePlus className="size-5" /> Abrir la cámara del teléfono
              </BigButton>
            ) : null}
            <BigButton variant="secondary" onClick={onClose}>
              Volver a la lista
            </BigButton>
          </div>
        </div>
      ) : null}

      <div className="flex-1" />

      <div className="relative z-10 flex flex-col items-center gap-3 bg-gradient-to-t from-black/80 to-transparent px-4 pt-10 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {!problem ? (
          <p className="max-w-xs text-center text-sm text-white/90">
            {scanOnly ? 'Apunta al código de barras del producto.' : 'Apunta al código de barras y se lee solo. Si no tiene, saca una foto del producto.'}
          </p>
        ) : null}
        {scanOnly ? (
          <BigButton variant="secondary" onClick={onClose} className="w-full">
            Cancelar
          </BigButton>
        ) : (
          <div className="flex w-full items-center justify-between gap-4">
            <button type="button" onClick={() => fileInput.current?.click()} disabled={busy} aria-label="Elegir una foto del teléfono" className="flex size-14 items-center justify-center rounded-full bg-white/15 disabled:opacity-50">
              <ImagePlus className="size-6" />
            </button>
            <button
              type="button"
              onClick={() => void takePhoto()}
              disabled={!ready || busy || problem !== null}
              aria-label="Sacar foto del producto"
              className="flex size-20 items-center justify-center rounded-full border-4 border-white bg-white/25 transition-transform active:scale-95 disabled:opacity-40"
            >
              <span className="size-14 rounded-full bg-white" />
            </button>
            <BigButton onClick={onClose} className="h-14 min-w-24 bg-brand-gold text-brand-ink">
              Listo
            </BigButton>
          </div>
        )}
      </div>

      {/* Cámara nativa del teléfono (alternativa cuando la de la página no abre). */}
      <input ref={fileInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => void fromFile(event.target.files?.[0])} />
    </div>
  );
}
