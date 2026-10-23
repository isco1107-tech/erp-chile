import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Video de cámara falsa para probar la lectura de códigos de barras sin
 * cámara real: un fotograma Y4M con un código EAN-13 dibujado a mano (sin
 * dependencias), que Chromium reproduce en bucle con
 * `--use-file-for-fake-video-capture`.
 */

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

/** Módulos (0/1) de un EAN-13: guarda, 6 dígitos con paridad, centro, 6 dígitos, guarda. */
export function ean13Modules(code: string): number[] {
  if (!/^\d{13}$/.test(code)) throw new Error('Se necesita un EAN-13 de 13 dígitos');
  const digits = [...code].map(Number);
  const parity = PARITY[digits[0]!]!;
  let bits = '101';
  for (let i = 0; i < 6; i++) bits += (parity[i] === 'L' ? L : G)[digits[i + 1]!]!;
  bits += '01010';
  for (let i = 0; i < 6; i++) bits += R[digits[i + 7]!]!;
  bits += '101';
  return [...bits].map(Number);
}

export function writeEan13Y4m(code: string, file: string, width = 640, height = 480, frames = 10): string {
  const modules = ean13Modules(code);
  const quiet = 9;
  const scale = Math.floor((width * 0.8) / (modules.length + quiet * 2));
  const barsWidth = (modules.length + quiet * 2) * scale;
  const left = Math.floor((width - barsWidth) / 2);
  const top = Math.floor(height * 0.25);
  const bottom = Math.floor(height * 0.75);

  const y = Buffer.alloc(width * height, 235); // blanco
  for (let x = 0; x < modules.length; x++) {
    if (modules[x] !== 1) continue;
    for (let row = top; row < bottom; row++) {
      for (let dx = 0; dx < scale; dx++) y[row * width + left + (x + quiet) * scale + dx] = 16; // negro
    }
  }
  const chroma = Buffer.alloc((width / 2) * (height / 2), 128);
  const header = Buffer.from(`YUV4MPEG2 W${width} H${height} F30:1 Ip A1:1 C420jpeg\n`);
  const frame = Buffer.concat([Buffer.from('FRAME\n'), y, chroma, chroma]);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, Buffer.concat([header, ...Array.from({ length: frames }, () => frame)]));
  return file;
}

/** Video sin ningún código: un fondo claro con ruido suave (para probar la foto del producto). */
export function writeBlankY4m(file: string, width = 640, height = 480, frames = 10): string {
  const y = Buffer.alloc(width * height);
  for (let i = 0; i < y.length; i++) y[i] = 200 + ((i * 7919) % 40);
  const chroma = Buffer.alloc((width / 2) * (height / 2), 128);
  const header = Buffer.from(`YUV4MPEG2 W${width} H${height} F30:1 Ip A1:1 C420jpeg\n`);
  const frame = Buffer.concat([Buffer.from('FRAME\n'), y, chroma, chroma]);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, Buffer.concat([header, ...Array.from({ length: frames }, () => frame)]));
  return file;
}
