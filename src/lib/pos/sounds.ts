export type PosSound = 'ok' | 'error' | 'done';

/** [frecuencia en Hz, duración en segundos] de cada tono. */
const TONES: Record<PosSound, [number, number][]> = {
  ok: [[1250, 0.07]],
  error: [[260, 0.16], [190, 0.22]],
  done: [[880, 0.09], [1320, 0.14]],
};

let audio: AudioContext | null = null;

/**
 * Pitido del mostrador: confirma que el lector agregó el producto (el cajero
 * mira al cliente, no a la pantalla) y avisa cuando algo no calzó. Nunca lanza:
 * sin audio, el POS funciona igual.
 */
export function playPosSound(kind: PosSound, enabled = true): void {
  if (!enabled || typeof window === 'undefined') return;
  try {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    audio ??= new Context();
    if (audio.state === 'suspended') void audio.resume();
    let at = audio.currentTime;
    for (const [frequency, seconds] of TONES[kind]) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'square';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.12, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(at);
      oscillator.stop(at + seconds + 0.02);
      at += seconds;
    }
  } catch {
    /* Sin audio disponible: no pasa nada. */
  }
}
