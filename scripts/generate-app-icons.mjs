/**
 * Genera los íconos de cada app instalable en `public/branding/apps/`.
 *
 *   node scripts/generate-app-icons.mjs
 *
 * Cada app tiene su propio color y su propio símbolo para que en la pantalla de
 * inicio no se confundan (el nombre solo no basta con diez íconos juntos):
 *   erp      → el logo de Aether sobre blanco
 *   control  → barras de indicadores, azul marino
 *   pos      → boleta, verde
 *   bodega   → caja, naranja
 *   seller   → local con toldo, violeta
 * Las cuatro llevan la estrella dorada de Aether en una esquina.
 *
 * Por app se escriben cuatro archivos: `-192` y `-512` (esquinas redondeadas,
 * `purpose: any`), `-maskable-512` (a sangre, símbolo dentro de la zona segura
 * del 80 %: Android lo recorta en círculo, gota o cuadrado) y `-180` (iOS:
 * cuadrado a sangre, el sistema pone las esquinas).
 *
 * Los colores son los de `src/lib/apps/registry.ts` (`iconColor`); si cambias
 * uno, vuelve a correr el script y sube los PNG.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public', 'branding', 'apps');
const GOLD = '#dbc076';

/** Lee `iconColor` del registro sin compilar TypeScript. */
async function iconColors() {
  const source = await readFile(path.join(root, 'src/lib/apps/registry.ts'), 'utf8');
  const colors = {};
  for (const id of ['control', 'pos', 'bodega', 'seller']) {
    const block = source.slice(source.indexOf(`  ${id}: {`));
    const match = block.match(/iconColor: '(#[0-9a-fA-F]{6})'/);
    if (!match) throw new Error(`Sin iconColor para ${id}`);
    colors[id] = match[1];
  }
  return colors;
}

/** Estrella de cuatro puntas de Aether. */
const star = (cx, cy, r) =>
  `<path d="M${cx} ${cy - r} Q${cx + r * 0.14} ${cy - r * 0.14} ${cx + r} ${cy} Q${cx + r * 0.14} ${cy + r * 0.14} ${cx} ${cy + r} Q${cx - r * 0.14} ${cy + r * 0.14} ${cx - r} ${cy} Q${cx - r * 0.14} ${cy - r * 0.14} ${cx} ${cy - r}Z" fill="${GOLD}"/>`;

/** Símbolos blancos en un lienzo de 512 × 512, centrados. `bg` es el color de fondo (para los huecos). */
const glyphs = {
  control: () => `
    <rect x="124" y="288" width="64" height="104" rx="14" fill="#fff"/>
    <rect x="224" y="220" width="64" height="172" rx="14" fill="#fff"/>
    <rect x="324" y="140" width="64" height="252" rx="14" fill="#fff"/>
    <rect x="104" y="410" width="304" height="16" rx="8" fill="#fff" opacity=".55"/>`,
  pos: (bg) => `
    <path d="M148 108h216a16 16 0 0 1 16 16v288l-36-26-36 26-36-26-36 26-36-26-36 26-36-26V124a16 16 0 0 1 16-16z" fill="#fff"/>
    <rect x="186" y="170" width="140" height="18" rx="9" fill="${bg}"/>
    <rect x="186" y="224" width="140" height="18" rx="9" fill="${bg}"/>
    <rect x="186" y="278" width="84" height="18" rx="9" fill="${bg}"/>
    <rect x="282" y="278" width="44" height="18" rx="9" fill="${bg}"/>`,
  bodega: (bg) => `
    <path d="M256 104l136 72-136 72-136-72z" fill="#fff"/>
    <path d="M120 188l128 68v148l-128-68z" fill="#fff" opacity=".82"/>
    <path d="M392 188l-128 68v148l128-68z" fill="#fff" opacity=".62"/>
    <path d="M256 104l136 72-136 72-136-72zM120 188l128 68v148l-128-68zM392 188l-128 68v148l128-68z" fill="none" stroke="${bg}" stroke-width="10" stroke-linejoin="round"/>
    <path d="M190 140l136 72" stroke="${bg}" stroke-width="10" stroke-linecap="round"/>`,
  seller: (bg) => `
    <path d="M132 120h248l34 100H98z" fill="#fff"/>
    <path d="M98 220a39 39 0 0 0 78 0a39 39 0 0 0 78 0a39 39 0 0 0 78 0a39 39 0 0 0 78 0z" fill="#fff" opacity=".82"/>
    <rect x="132" y="296" width="248" height="116" rx="10" fill="#fff"/>
    <rect x="226" y="330" width="60" height="82" rx="8" fill="${bg}"/>
    <rect x="152" y="326" width="52" height="40" rx="8" fill="${bg}"/>
    <rect x="308" y="326" width="52" height="40" rx="8" fill="${bg}"/>`,
};

/** SVG de 512 × 512. `shape`: 'rounded' (esquinas redondeadas) o 'full' (a sangre). `scale`: tamaño del símbolo. */
function svg(id, color, { shape, scale }) {
  const bg = shape === 'rounded' ? `<rect width="512" height="512" rx="112" fill="${color}"/>` : `<rect width="512" height="512" fill="${color}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${bg}
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${glyphs[id](color)}${star(420, 96, 32)}</g></svg>`;
}

async function png(buffer, size, file) {
  await sharp(buffer, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toFile(path.join(out, file));
}

async function erpIcons() {
  const logo = await sharp(path.join(root, 'public/branding/app-icon-512.png')).resize(512, 512).toBuffer();
  const onWhite = async (scale, rounded) => {
    const size = Math.round(512 * scale);
    const mark = await sharp(logo).resize(size, size).toBuffer();
    const flat = await sharp({ create: { width: 512, height: 512, channels: 4, background: '#ffffff' } })
      .composite([{ input: mark, gravity: 'center' }])
      .png()
      .toBuffer();
    if (!rounded) return flat;
    // Segundo `composite` aparte: encadenarlo en el mismo `sharp` reemplazaría el primero.
    const mask = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" rx="112"/></svg>');
    return sharp(flat).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  };
  const rounded = await onWhite(0.9, true);
  await png(rounded, 192, 'erp-192.png');
  await png(rounded, 512, 'erp-512.png');
  await png(await onWhite(0.66, false), 512, 'erp-maskable-512.png');
  await png(await onWhite(0.84, false), 180, 'erp-180.png');
}

await mkdir(out, { recursive: true });
const colors = await iconColors();
for (const [id, color] of Object.entries(colors)) {
  const rounded = Buffer.from(svg(id, color, { shape: 'rounded', scale: 1 }));
  await png(rounded, 192, `${id}-192.png`);
  await png(rounded, 512, `${id}-512.png`);
  await png(Buffer.from(svg(id, color, { shape: 'full', scale: 0.74 })), 512, `${id}-maskable-512.png`);
  await png(Buffer.from(svg(id, color, { shape: 'full', scale: 0.9 })), 180, `${id}-180.png`);
}
await erpIcons();
await writeFile(path.join(out, 'README.md'), 'Íconos de las apps instalables. Se generan con `node scripts/generate-app-icons.mjs`; no los edites a mano.\n');
console.log('Íconos escritos en', path.relative(root, out));
