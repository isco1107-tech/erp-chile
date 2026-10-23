/**
 * Cámara trasera del teléfono. Solo navegador.
 *
 * Funciona únicamente en HTTPS (o localhost) y con permiso de la persona. Si no
 * hay cámara o se negó el permiso, la app ofrece la alternativa del selector de
 * archivos (que en el teléfono abre la cámara nativa).
 */

export type CameraProblem = 'denied' | 'unavailable' | 'unsupported';

export interface CameraHandle {
  stream: MediaStream;
  /** El teléfono tiene linterna controlable desde el navegador (Android/Chrome). */
  torchSupported: boolean;
  setTorch(on: boolean): Promise<void>;
  stop(): void;
}

interface TorchCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
}

interface TorchConstraint extends MediaTrackConstraintSet {
  torch?: boolean;
}

export class CameraError extends Error {
  constructor(
    readonly problem: CameraProblem,
    message: string
  ) {
    super(message);
  }
}

export function cameraSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

export async function openCamera(): Promise<CameraHandle> {
  if (!cameraSupported()) throw new CameraError('unsupported', 'Este navegador no permite usar la cámara.');
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new CameraError('denied', 'No diste permiso para usar la cámara. Actívalo en los ajustes del navegador o usa la cámara del teléfono.');
    }
    throw new CameraError('unavailable', 'No se pudo abrir la cámara. Usa la cámara del teléfono.');
  }

  const [track] = stream.getVideoTracks();
  const capabilities = (track?.getCapabilities?.() ?? {}) as TorchCapabilities;
  return {
    stream,
    torchSupported: Boolean(capabilities.torch),
    async setTorch(on) {
      if (!track || !capabilities.torch) return;
      const constraint: TorchConstraint = { torch: on };
      await track.applyConstraints({ advanced: [constraint] });
    },
    stop() {
      for (const t of stream.getTracks()) t.stop();
    },
  };
}
