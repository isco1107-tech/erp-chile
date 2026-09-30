/**
 * Tamaño en píxeles de una imagen leyendo solo su cabecera (JPEG, PNG, WEBP).
 * Sin dependencias ni decodificar: sirve para rechazar, antes de publicarla, una
 * portada de 150 × 150 que el sitio estiraría a pantalla completa. `null` si los
 * bytes no son una de esas imágenes o la cabecera está truncada.
 */
export interface ImageSize {
  width: number;
  height: number;
}

const u16be = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const u32be = (b: Uint8Array, i: number) => ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;
const u16le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8);
const u24le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);

function png(b: Uint8Array): ImageSize | null {
  if (b.length < 24) return null;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

function jpeg(b: Uint8Array): ImageSize | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i++; // relleno
      continue;
    }
    // SOF (inicio de cuadro): 0xC0–0xCF salvo DHT (C4), JPG (C8) y DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: u16be(b, i + 5), width: u16be(b, i + 7) };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2; // marcadores sin longitud
      continue;
    }
    i += 2 + u16be(b, i + 2);
  }
  return null;
}

function webp(b: Uint8Array): ImageSize | null {
  if (b.length < 30) return null;
  const kind = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
  if (kind === 'VP8X') return { width: 1 + u24le(b, 24), height: 1 + u24le(b, 27) };
  if (kind === 'VP8L') {
    const bits = (b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24)) >>> 0;
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (kind === 'VP8 ') return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  return null;
}

export function readImageSize(bytes: Uint8Array): ImageSize | null {
  let size: ImageSize | null = null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50) size = png(bytes);
  else if (bytes[0] === 0xff && bytes[1] === 0xd8) size = jpeg(bytes);
  else if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) size = webp(bytes);
  return size && size.width > 0 && size.height > 0 ? size : null;
}
