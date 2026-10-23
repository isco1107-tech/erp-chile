import { isValidGtin, normalizeScannedCode } from '../codes';

/**
 * Lectura de códigos de barras desde la cámara en vivo. Solo navegador.
 *
 * - Android/Chrome trae un lector nativo (`BarcodeDetector`): rápido y sin
 *   descargar nada.
 * - iPhone (Safari) no lo trae: se carga un lector en JavaScript solo en ese caso
 *   (`@zxing/library`), para no pesarle a los demás.
 *
 * Un código solo se acepta si es creíble: un EAN/UPC con su dígito verificador
 * correcto, o un código corto alfanumérico (etiquetas internas Code 128).
 */

export interface CodeScanner {
  readonly engine: 'native' | 'zxing';
  /** Busca un código en el fotograma actual del video. `null` si no hay ninguno creíble. */
  scan(video: HTMLVideoElement): Promise<string | null>;
  dispose(): void;
}

interface NativeDetector {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}

interface NativeDetectorConstructor {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats?: () => Promise<string[]>;
}

const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];

/** ¿Un código leído es creíble? (Los numéricos de largo GTIN deben tener su dígito verificador.) */
export function acceptCode(raw: string): string | null {
  const code = normalizeScannedCode(raw);
  if (code.length < 3) return null;
  if (/^\d+$/.test(code)) {
    if ([8, 12, 13, 14].includes(code.length)) return isValidGtin(code) ? code : null;
    // Otros largos numéricos (UPC-E de 8 ya cubierto, ITF o Code 128 internos): solo si no son cortos.
    return code.length >= 4 ? code : null;
  }
  return /^[\x21-\x7e]+$/.test(code) ? code : null;
}

async function createNativeScanner(Ctor: NativeDetectorConstructor): Promise<CodeScanner | null> {
  let formats = NATIVE_FORMATS;
  if (Ctor.getSupportedFormats) {
    const supported = await Ctor.getSupportedFormats().catch(() => [] as string[]);
    formats = NATIVE_FORMATS.filter((format) => supported.includes(format));
    if (formats.length === 0) return null;
  }
  const detector = new Ctor({ formats });
  return {
    engine: 'native',
    async scan(video) {
      if (video.readyState < 2) return null;
      const found = await detector.detect(video).catch(() => []);
      for (const item of found) {
        const code = acceptCode(item.rawValue);
        if (code) return code;
      }
      return null;
    },
    dispose() {},
  };
}

/** Ancho al que se reduce el recorte central antes de decodificar con el lector en JavaScript. */
const ZXING_WIDTH = 640;

async function createZxingScanner(): Promise<CodeScanner> {
  const zxing = await import('@zxing/library');
  const reader = new zxing.MultiFormatReader();
  reader.setHints(
    new Map<number, unknown>([
      [
        zxing.DecodeHintType.POSSIBLE_FORMATS,
        [
          zxing.BarcodeFormat.EAN_13,
          zxing.BarcodeFormat.EAN_8,
          zxing.BarcodeFormat.UPC_A,
          zxing.BarcodeFormat.UPC_E,
          zxing.BarcodeFormat.CODE_128,
          zxing.BarcodeFormat.CODE_39,
          zxing.BarcodeFormat.ITF,
        ],
      ],
      [zxing.DecodeHintType.TRY_HARDER, true],
    ])
  );
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });

  return {
    engine: 'zxing',
    async scan(video) {
      if (!context || video.readyState < 2 || video.videoWidth === 0) return null;
      // Banda central: ahí se apunta al código, y es mucho menos que el fotograma entero.
      const cropWidth = video.videoWidth;
      const cropHeight = Math.round(video.videoHeight * 0.5);
      const cropTop = Math.round((video.videoHeight - cropHeight) / 2);
      const scale = Math.min(1, ZXING_WIDTH / cropWidth);
      canvas.width = Math.max(1, Math.round(cropWidth * scale));
      canvas.height = Math.max(1, Math.round(cropHeight * scale));
      context.drawImage(video, 0, cropTop, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      const luminance = new Uint8ClampedArray(canvas.width * canvas.height);
      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        luminance[j] = (data[i]! * 299 + data[i + 1]! * 587 + data[i + 2]! * 114) / 1000;
      }
      try {
        const source = new zxing.RGBLuminanceSource(luminance, canvas.width, canvas.height);
        const result = reader.decode(new zxing.BinaryBitmap(new zxing.HybridBinarizer(source)));
        return acceptCode(result.getText());
      } catch {
        // `NotFoundException` es lo normal mientras no hay un código en cuadro.
        return null;
      } finally {
        reader.reset();
      }
    },
    dispose() {},
  };
}

export async function createScanner(): Promise<CodeScanner> {
  const Native = (globalThis as { BarcodeDetector?: NativeDetectorConstructor }).BarcodeDetector;
  if (Native) {
    const native = await createNativeScanner(Native).catch(() => null);
    if (native) return native;
  }
  return createZxingScanner();
}
