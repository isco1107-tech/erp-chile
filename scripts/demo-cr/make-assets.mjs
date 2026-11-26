/**
 * Assets SIMULADOS para la demo de CR Producciones (retratos ilustrados sin
 * rostro, logos de marcas ficticias y portadas). Todo se dibuja con SVG → PNG/JPG
 * con `sharp`; no hay fotos de personas reales ni marcas reales.
 *
 *   node scripts/demo-cr/make-assets.mjs <carpeta-de-salida>
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const out = process.argv[2];
if (!out) throw new Error('Uso: node make-assets.mjs <carpeta-de-salida>');
for (const dir of ['portraits', 'logos', 'covers']) mkdirSync(path.join(out, dir), { recursive: true });

// Generador pseudoaleatorio determinista: la demo se ve igual cada vez.
function rng(seed) {
  let a = (Math.imul(seed + 0x9e3779b9, 2654435761) ^ 0xa5a5a5a5) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BACKGROUNDS = [
  ['#f6d5e0', '#e9b8cc', '#c98aa6'], // rosa
  ['#dcebd9', '#b7d4b4', '#7fa97d'], // verde
  ['#f4e6c3', '#e7cd97', '#c9a45c'], // dorado
  ['#e3dcf3', '#c7b8e6', '#9a86c9'], // lila
  ['#d6e8ee', '#a9cfdb', '#6fa3b6'], // celeste
  ['#fbe0cf', '#f2bc9b', '#d98c64'], // durazno
];
const SKINS = ['#f3d2b8', '#e8bb98', '#d9a47c', '#c48a63', '#a96f4b', '#8c5a3c'];
const HAIRS = ['#2a1b14', '#3d2418', '#5a3a22', '#1c1613', '#7a4b2a', '#a1672f', '#241a2b'];
const DRESSES = ['#1f3d2e', '#7a1f3d', '#12161f', '#2b3a67', '#b5395b', '#0f5e5a', '#5b2a6e', '#c28f2c'];
const STYLES = ['long', 'curly', 'bob', 'bun', 'wavy'];

function portraitSvg(i) {
  const r = rng(1000 + i * 77);
  const bg = BACKGROUNDS[i % BACKGROUNDS.length];
  const skin = SKINS[Math.floor(r() * SKINS.length)];
  const hair = HAIRS[Math.floor(r() * HAIRS.length)];
  const dress = DRESSES[Math.floor(r() * DRESSES.length)];
  const style = STYLES[i % STYLES.length];
  const bokeh = Array.from({ length: 9 }, () => {
    const x = Math.round(r() * 800);
    const y = Math.round(r() * 700);
    const rad = Math.round(30 + r() * 90);
    const op = (0.12 + r() * 0.25).toFixed(2);
    return `<circle cx="${x}" cy="${y}" r="${rad}" fill="#fff" opacity="${op}"/>`;
  }).join('');

  // Cabello detrás de la cabeza.
  const hairBack = {
    long: `<path d="M210 430 C190 250 300 200 400 200 C500 200 610 250 590 430 C600 600 620 760 640 860 L160 860 C180 760 200 600 210 430 Z" fill="${hair}"/>`,
    wavy: `<path d="M170 440 C130 240 280 170 400 170 C520 170 670 240 630 440 C690 560 640 650 700 800 C640 860 590 800 560 860 L240 860 C210 800 160 860 100 800 C160 650 110 560 170 440 Z" fill="${hair}"/>`,
    bob: `<path d="M225 440 C205 260 300 205 400 205 C500 205 595 260 575 440 C580 520 570 560 560 590 L240 590 C230 560 220 520 225 440 Z" fill="${hair}"/>`,
    bun: `<circle cx="400" cy="170" r="62" fill="${hair}"/><path d="M240 430 C230 270 310 215 400 215 C490 215 570 270 560 430 Z" fill="${hair}"/>`,
    curly: `<circle cx="400" cy="330" r="215" fill="${hair}"/><circle cx="250" cy="430" r="95" fill="${hair}"/><circle cx="550" cy="430" r="95" fill="${hair}"/><circle cx="300" cy="260" r="100" fill="${hair}"/><circle cx="500" cy="260" r="100" fill="${hair}"/>`,
  }[style];
  // Flequillo / raya por delante.
  const hairFront = {
    long: `<path d="M282 400 C300 290 360 262 400 262 C450 262 510 290 520 400 C480 330 430 312 400 312 C360 312 318 330 282 400 Z" fill="${hair}"/>`,
    wavy: `<path d="M280 410 C290 290 350 258 400 258 C455 258 515 290 522 410 C490 335 440 305 380 318 C330 328 300 360 280 410 Z" fill="${hair}"/>`,
    bob: `<path d="M278 420 C285 290 350 262 400 262 C455 262 515 290 522 420 C500 340 450 320 400 320 C350 320 300 340 278 420 Z" fill="${hair}"/>`,
    bun: `<path d="M282 400 C300 290 360 270 400 270 C450 270 510 290 520 400 C480 335 430 322 400 322 C360 322 318 335 282 400 Z" fill="${hair}"/>`,
    curly: `<path d="M285 380 C300 300 350 285 400 285 C455 285 505 300 518 380 C470 330 330 330 285 380 Z" fill="${hair}"/>`,
  }[style];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="0.55" stop-color="${bg[1]}"/><stop offset="1" stop-color="${bg[2]}"/></linearGradient>
    <linearGradient id="skin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${skin}"/><stop offset="1" stop-color="${skin}" stop-opacity="0.82"/></linearGradient>
    <linearGradient id="dress" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${dress}"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></linearGradient>
    <linearGradient id="sash" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4e6c3"/><stop offset="0.5" stop-color="#d9b86a"/><stop offset="1" stop-color="#b98f3c"/></linearGradient>
    <radialGradient id="vig" cx="0.5" cy="0.42" r="0.75"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.38"/></radialGradient>
    <radialGradient id="spot" cx="0.5" cy="0.3" r="0.6"><stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="800" height="1000" fill="url(#bg)"/>
  <rect width="800" height="1000" fill="url(#spot)"/>
  ${bokeh}
  ${hairBack}
  <path d="M100 1000 C120 810 270 745 400 745 C530 745 680 810 700 1000 Z" fill="url(#dress)"/>
  <rect x="354" y="560" width="92" height="200" rx="38" fill="url(#skin)"/>
  <path d="M322 748 C350 790 380 836 400 846 C420 836 450 790 478 748 C440 770 360 770 322 748 Z" fill="url(#skin)"/>
  <ellipse cx="400" cy="440" rx="118" ry="150" fill="url(#skin)"/>
  <ellipse cx="400" cy="590" rx="70" ry="22" fill="#000" opacity="0.10"/>
  ${hairFront}
  <polygon points="214,792 300,768 716,1000 566,1000" fill="url(#sash)" opacity="0.97"/>
  <line x1="214" y1="792" x2="566" y2="1000" stroke="#fff" stroke-opacity="0.6" stroke-width="3"/>
  <line x1="300" y1="768" x2="716" y2="1000" stroke="#8a6a25" stroke-opacity="0.5" stroke-width="3"/>
  <rect width="800" height="1000" fill="url(#vig)"/>
</svg>`;
}

async function toJpg(svg, file, quality = 88) {
  await sharp(Buffer.from(svg)).jpeg({ quality }).toFile(path.join(out, file));
}

// ── Retratos ────────────────────────────────────────────────────────────────
// 0..13: candidatas · 20..23: ganadoras anteriores · 30: directora
for (let i = 0; i < 24; i++) await toJpg(portraitSvg(i), `portraits/cand-${String(i + 1).padStart(2, '0')}.jpg`);
for (let i = 0; i < 4; i++) await toJpg(portraitSvg(20 + i), `portraits/winner-${i + 1}.jpg`);
await toJpg(portraitSvg(30), 'portraits/director.jpg');

// ── Portadas ────────────────────────────────────────────────────────────────
function petals(cx, cy, scale, color, count = 8, op = 0.55) {
  return Array.from({ length: count }, (_, k) => {
    const a = (360 / count) * k;
    return `<ellipse cx="${cx}" cy="${cy - 70 * scale}" rx="${34 * scale}" ry="${74 * scale}" fill="${color}" opacity="${op}" transform="rotate(${a} ${cx} ${cy})"/>`;
  }).join('');
}

function coverSvg(palette, seed) {
  const r = rng(seed);
  const [c1, c2, c3, flower1, flower2] = palette;
  const flowers = Array.from({ length: 14 }, (_, k) => {
    const x = Math.round(r() * 1920);
    const y = Math.round(80 + r() * 900);
    const s = 0.7 + r() * 2.2;
    const col = k % 2 ? flower1 : flower2;
    return petals(x, y, s, col, 8, (0.28 + r() * 0.4).toFixed(2)) + `<circle cx="${x}" cy="${y}" r="${12 * s}" fill="#f4e6c3" opacity="0.9"/>`;
  }).join('');
  const lights = Array.from({ length: 18 }, () => `<circle cx="${Math.round(r() * 1920)}" cy="${Math.round(r() * 1080)}" r="${Math.round(10 + r() * 46)}" fill="#fff" opacity="${(0.06 + r() * 0.16).toFixed(2)}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="0.5" stop-color="${c2}"/><stop offset="1" stop-color="${c3}"/></linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.35" r="0.7"><stop offset="0" stop-color="#fff" stop-opacity="0.45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#g)"/>
  <rect width="1920" height="1080" fill="url(#glow)"/>
  ${flowers}
  ${lights}
</svg>`;
}

await toJpg(coverSvg(['#1f5a3c', '#c97a9c', '#e7cd97', '#f4a3c4', '#ffe9f1'], 7), 'covers/primavera.jpg', 86);
await toJpg(coverSvg(['#0e3a5c', '#1f7a9c', '#f2c879', '#ffd9a8', '#fff3dc'], 19), 'covers/verano.jpg', 86);
await toJpg(coverSvg(['#3d1f2b', '#8a3d2e', '#d9a441', '#e8a065', '#fbd9a0'], 31), 'covers/otono.jpg', 86);

// ── Logos de marcas FICTICIAS ───────────────────────────────────────────────
const LOGOS = [
  { file: 'Clínica Dental Sonríe', l1: 'Clínica Dental', l2: 'SONRÍE', color: '#0f7a8a', shape: 'circle', glyph: '☺' },
  { file: 'Inmobiliaria Cordillera Sur', l1: 'Inmobiliaria', l2: 'CORDILLERA SUR', color: '#2b3a67', shape: 'tri', glyph: '' },
  { file: 'Radio Pewma FM', l1: 'Radio', l2: 'PEWMA FM 98.3', color: '#b5395b', shape: 'circle', glyph: '♪' },
  { file: 'Viña Los Aromos', l1: 'Viña', l2: 'LOS AROMOS', color: '#6b2a4e', shape: 'round', glyph: '❦' },
  { file: 'Ferretería El Roble', l1: 'Ferretería', l2: 'EL ROBLE', color: '#2f6b3a', shape: 'hex', glyph: '' },
  { file: 'Hotel Pillán', l1: 'Hotel', l2: 'PILLÁN', color: '#8a5a1f', shape: 'round', glyph: '★' },
  { file: 'Supermercados Del Sur', l1: 'Supermercados', l2: 'DEL SUR', color: '#c0392b', shape: 'circle', glyph: '' },
  { file: 'Pastelería Maitén', l1: 'Pastelería', l2: 'MAITÉN', color: '#c26a8a', shape: 'round', glyph: '✿' },
  { file: 'Taller Lafkén Joyas', l1: 'Joyas', l2: 'LAFKÉN', color: '#a9822d', shape: 'hex', glyph: '◆' },
  { file: 'Transportes Araucanía Bus', l1: 'Transportes', l2: 'ARAUCANÍA BUS', color: '#1a4f8b', shape: 'tri', glyph: '' },
];

function logoSvg(l) {
  const c = l.color;
  const mark =
    l.shape === 'circle'
      ? `<circle cx="110" cy="120" r="70" fill="${c}"/>`
      : l.shape === 'hex'
        ? `<polygon points="110,48 172,84 172,156 110,192 48,156 48,84" fill="${c}"/>`
        : l.shape === 'tri'
          ? `<polygon points="110,46 176,184 44,184" fill="${c}"/>`
          : `<rect x="42" y="52" width="136" height="136" rx="38" fill="${c}"/>`;
  const glyph = l.glyph ? `<text x="110" y="${l.shape === 'tri' ? 150 : 142}" text-anchor="middle" font-family="DejaVu Sans" font-size="64" fill="#fff">${l.glyph}</text>` : '';
  const second = l.l2.length > 12 ? 34 : 44;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="240" viewBox="0 0 760 240">
  ${mark}${glyph}
  <text x="212" y="104" font-family="Inter" font-weight="500" font-size="34" fill="${c}" opacity="0.85">${l.l1}</text>
  <text x="210" y="${104 + second + 8}" font-family="Inter" font-weight="900" font-size="${second}" letter-spacing="2" fill="${c}">${l.l2}</text>
</svg>`;
}

for (const l of LOGOS) {
  await sharp(Buffer.from(logoSvg(l))).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 }).extend({ top: 16, bottom: 16, left: 16, right: 16, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(path.join(out, 'logos', `${l.file}.png`));
}

writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ logos: LOGOS.map((l) => l.file) }, null, 2));
console.log('Assets simulados generados en', out);
