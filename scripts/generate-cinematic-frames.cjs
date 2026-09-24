/*
 * Convierte los videos de la landing v2 en las secuencias WebP que el canvas
 * recorre con el scroll.
 *
 * Uso: node scripts/generate-cinematic-frames.cjs [ruta/a/ffmpeg]
 *      (o la variable FFMPEG). ffprobe se busca junto a ffmpeg.
 *      Con --version-only solo recalcula la versión del manifiesto.
 *
 * Proceso local y sin conexión: no lee credenciales ni la base de datos.
 *
 * Fuentes, en public/marketing/cinematic/ (fuera del despliegue por .vercelignore):
 *   v1 → v1.mp4        del cielo de Atacama a la galaxia
 *   v2 → v2 (2).mp4    la galaxia, el logo se arma y termina sobre fondo claro
 *
 * Salida en public/marketing/cinematic/seq/:
 *   v1/d_001.webp …  escritorio, 18 fps, 1920×1080 (la resolución de la fuente)
 *   v1/m_001.webp …  móvil, 12 fps, 608×1080 (recorte vertical 9:16 del centro)
 *   v2/…             lo mismo para v2
 *   manifest.json    fotogramas, dimensiones, peso y tramos claros de cada set
 *
 * Decisiones que no salen del prompt original (documentadas aquí para que
 * no parezcan accidentes):
 * - Resolución de la fuente y calidad 80. A 1280 px y calidad 60 (lo que
 *   pedía el prompt) se perdían casi todas las estrellas y el cielo se veía
 *   borroso en pantallas de 1920 px. El peso sube, pero los fotogramas se
 *   descargan de a poco, primero los cercanos al scroll.
 * - El set móvil es un recorte vertical del centro: en un teléfono vertical
 *   el canvas cubre la pantalla y de un cuadro 16:9 solo se ve el centro. En
 *   v2, desde que se arma el logo, el encuadre se abre de a poco (MOBILE_OPENING)
 *   para que «AETHER» quepa entero; arriba y abajo se rellena con el borde del
 *   mismo cuadro, estirado y difuminado.
 * - «light» marca los tramos de fotogramas con la franja superior clara. Ahí
 *   la cabecera, de texto claro, necesita su fondo oscuro, y la landing lo
 *   lee de este manifiesto.
 * - Si un set se pasa del presupuesto, se baja la calidad (nunca la
 *   cantidad de fotogramas), igual que pedía el prompt.
 * - «version» es un hash del contenido de los fotogramas. Las URLs lo llevan
 *   (?v=…) y next.config.js los sirve con caché de un año: si se regeneran,
 *   la versión cambia y nadie ve fotogramas viejos.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const args = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
const ffmpeg = args[0] || process.env.FFMPEG || 'ffmpeg';
const ffprobe = /ffmpeg(\.exe)?$/i.test(ffmpeg) ? ffmpeg.replace(/ffmpeg(\.exe)?$/i, (_, ext) => `ffprobe${ext ?? ''}`) : 'ffprobe';

const root = path.resolve(__dirname, '..');
const media = path.join(root, 'public/marketing/cinematic');
const output = path.join(media, 'seq');

const SOURCES = { v1: 'v1.mp4', v2: 'v2 (2).mp4' };
const QUALITIES = [80, 76, 72, 68, 64, 60];
const SETS = [
  // Alto fijo de 1080: el ancho sale de la fuente (16:9 → 1920) o del recorte móvil.
  { name: 'desktop', prefix: 'd', fps: 18, width: 1920, height: 1080, maxBytes: 15_000_000 },
  { name: 'mobile', prefix: 'm', fps: 12, width: 608, height: 1080, maxBytes: 5_000_000 },
];
/**
 * Encuadre móvil de v2: entre `from` y `to` (segundos del video) el recorte
 * pasa de 608 px de ancho a `cropWidth` px de la fuente de 1080 de alto.
 */
const MOBILE_OPENING = { clip: 'v2', from: 1.6, to: 3.4, cropWidth: 1100 };
/** Luma media (0 a 255) de la franja superior desde la que un cuadro cuenta como claro. */
const LIGHT_LUMA = 90;
const PARALLEL = Math.max(2, Math.min(6, os.cpus().length - 1));

function run(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(binary)} falló (${code}): ${stderr.slice(-800)}`));
    });
  });
}

/** Corre `task` sobre cada elemento con a lo más `limit` procesos a la vez. */
async function eachLimited(items, limit, task) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await task(item);
    }
  });
  await Promise.all(workers);
}

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function sourcePath(clip) {
  const file = path.join(media, SOURCES[clip]);
  if (!fs.existsSync(file)) throw new Error(`No encontré ${SOURCES[clip]} en ${media}`);
  return file;
}

async function probe(file) {
  const { stdout } = await run(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames:format=duration', '-of', 'json', file]);
  const data = JSON.parse(stdout);
  const stream = data.streams[0];
  const [num, den] = stream.r_frame_rate.split('/').map(Number);
  return { width: stream.width, height: stream.height, fps: num / den, frames: Number(stream.nb_frames), duration: Number(data.format.duration) };
}

function folderBytes(folder) {
  return fs.readdirSync(folder).reduce((total, file) => total + fs.statSync(path.join(folder, file)).size, 0);
}

const quiet = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y'];

/** SSIM entre el último cuadro de v1 y el primero de v2, sobre el video fuente. */
async function boundarySsim(v1, v2, v1Frames) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-boundary-'));
  try {
    const last = path.join(work, 'v1-last.png');
    const first = path.join(work, 'v2-first.png');
    await run(ffmpeg, [...quiet, '-i', v1, '-vf', `select=eq(n\\,${v1Frames - 1})`, '-frames:v', '1', last]);
    await run(ffmpeg, [...quiet, '-i', v2, '-frames:v', '1', first]);
    const { stderr } = await run(ffmpeg, ['-hide_banner', '-nostdin', '-i', last, '-i', first, '-lavfi', 'ssim', '-f', 'null', '-']);
    const match = /All:([0-9.]+)/.exec(stderr);
    return match ? Number(match[1]) : null;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/** Ancho del recorte móvil (en píxeles de la fuente a 1080 de alto) en el segundo `seconds`. */
function mobileCropWidth(clip, seconds, set) {
  if (clip !== MOBILE_OPENING.clip) return set.width;
  const opening = smoothstep(MOBILE_OPENING.from, MOBILE_OPENING.to, seconds);
  return set.width + (MOBILE_OPENING.cropWidth - set.width) * opening;
}

/**
 * Fotogramas móviles de v2 como PNG sin pérdida: el cuadro reducido al ancho
 * del recorte, centrado, sobre su propio borde estirado y difuminado, con los
 * bordes fundidos para que la unión no se vea.
 */
async function renderOpening(video, clip, set, work) {
  const raw = path.join(work, 'raw');
  const framed = path.join(work, 'framed');
  fs.mkdirSync(raw);
  fs.mkdirSync(framed);
  await run(ffmpeg, [...quiet, '-i', video, '-an', '-vf', `fps=${set.fps},scale=-2:${set.height}:flags=lanczos,crop=${MOBILE_OPENING.cropWidth}:${set.height}`, path.join(raw, 'f_%03d.png')]);
  const files = fs.readdirSync(raw).sort();
  await eachLimited(files, PARALLEL, async file => {
    const index = Number(/(\d+)/.exec(file)[1]) - 1;
    const width = mobileCropWidth(clip, index / set.fps, set);
    const source = path.join(raw, file);
    const target = path.join(framed, file);
    if (width <= set.width + 0.5) {
      await run(ffmpeg, [...quiet, '-i', source, '-vf', `crop=${set.width}:${set.height}`, target]);
      return;
    }
    const scale = set.width / width;
    const scaledWidth = Math.ceil((MOBILE_OPENING.cropWidth * scale) / 2) * 2;
    const band = Math.round((set.height * scale) / 2) * 2;
    const top = (set.height - band) / 2;
    const feather = Math.max(1, Math.min(64, Math.round(top * 0.8)));
    await run(ffmpeg, [
      ...quiet, '-i', source, '-filter_complex',
      `[0:v]scale=${scaledWidth}:${band}:flags=lanczos,crop=${set.width}:${band},split[band][edge];` +
      `[edge]pad=${set.width}:${set.height}:0:${top},fillborders=top=${top}:bottom=${top}:mode=smear,boxblur=60:3[fill];` +
      `[band]format=yuva444p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='255*min(1,min(Y,H-1-Y)/${feather})'[soft];` +
      '[fill][soft]overlay=0:' + top + ':format=auto,format=rgb24',
      target,
    ]);
  });
  return framed;
}

/** Codifica un set y baja la calidad hasta que entra en el presupuesto. */
async function encode(video, clip, set) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), `aether-${clip}-${set.prefix}-`));
  try {
    const opening = set.name === 'mobile' && clip === MOBILE_OPENING.clip;
    const input = opening
      ? ['-framerate', String(set.fps), '-i', path.join(await renderOpening(video, clip, set, work), 'f_%03d.png')]
      : ['-i', video];
    const filter = opening ? 'null'
      : set.name === 'desktop' ? `fps=${set.fps},scale=-2:${set.height}:flags=lanczos`
        : `fps=${set.fps},scale=-2:${set.height}:flags=lanczos,crop=${set.width}:${set.height}`;
    for (const quality of QUALITIES) {
      const attempt = path.join(work, `q${quality}`);
      fs.mkdirSync(attempt);
      await run(ffmpeg, [
        ...quiet, ...input, '-map', '0:v:0', '-an', '-vf', filter,
        '-c:v', 'libwebp', '-quality', String(quality), '-compression_level', '6',
        path.join(attempt, `${set.prefix}_%03d.webp`),
      ]);
      const bytes = folderBytes(attempt);
      const count = fs.readdirSync(attempt).length;
      console.log(`  ${clip} ${set.name}: ${count} fotogramas, calidad ${quality}, ${(bytes / 1e6).toFixed(2)} MB (máx. ${(set.maxBytes / 1e6).toFixed(1)} MB)`);
      if (bytes > set.maxBytes) continue;
      const destination = path.join(output, clip);
      for (const file of fs.readdirSync(attempt)) fs.copyFileSync(path.join(attempt, file), path.join(destination, file));
      const light = await lightRanges(path.join(destination, `${set.prefix}_%03d.webp`), count);
      return { count, fps: set.fps, width: set.width, height: set.height, quality, bytes, maxBytes: set.maxBytes, light };
    }
    throw new Error(`${clip} ${set.name} no cabe en ${set.maxBytes} bytes ni con la calidad mínima`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/** Tramos [primero, último] (índices desde 0) cuya franja superior es clara. */
async function lightRanges(pattern, count) {
  const { stderr } = await run(ffmpeg, [
    '-hide_banner', '-nostdin', '-i', pattern,
    '-vf', 'crop=iw:ih*0.12:0:0,signalstats,metadata=mode=print:key=lavfi.signalstats.YAVG', '-f', 'null', '-',
  ]);
  const lumas = [...stderr.matchAll(/lavfi\.signalstats\.YAVG=([0-9.]+)/g)].map(match => Number(match[1]));
  if (lumas.length !== count) throw new Error(`Esperaba ${count} lecturas de luma y hubo ${lumas.length}`);
  const ranges = [];
  lumas.forEach((luma, index) => {
    if (luma < LIGHT_LUMA) return;
    const last = ranges.at(-1);
    if (last && last[1] === index - 1) last[1] = index;
    else ranges.push([index, index]);
  });
  return ranges;
}

/** Hash corto del contenido de todos los fotogramas, en orden. */
function frameVersion() {
  const hash = crypto.createHash('sha1');
  for (const clip of ['v1', 'v2']) {
    const folder = path.join(output, clip);
    for (const file of fs.readdirSync(folder).sort()) hash.update(file).update(fs.readFileSync(path.join(folder, file)));
  }
  return hash.digest('hex').slice(0, 10);
}

function writeVersionOnly() {
  const file = path.join(output, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const next = { generatedBy: manifest.generatedBy, version: frameVersion(), clips: manifest.clips, boundary: manifest.boundary };
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}
`);
  console.log(`Versión de los fotogramas: ${next.version}`);
}

async function main() {
  const videos = { v1: sourcePath('v1'), v2: sourcePath('v2') };
  const sources = { v1: await probe(videos.v1), v2: await probe(videos.v2) };
  for (const [clip, info] of Object.entries(sources)) {
    console.log(`${clip}: ${path.basename(videos[clip])} ${info.width}×${info.height}, ${info.fps} fps, ${info.duration.toFixed(2)} s, ${info.frames} cuadros`);
    if (info.height < 1080) console.warn(`  Aviso: ${clip} mide menos de 1080 px de alto; los fotogramas quedarán ampliados.`);
  }

  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(path.join(output, 'v1'), { recursive: true });
  fs.mkdirSync(path.join(output, 'v2'), { recursive: true });

  const jobs = ['v1', 'v2'].flatMap(clip => SETS.map(set => ({ clip, set })));
  const encoded = await Promise.all(jobs.map(({ clip, set }) => encode(videos[clip], clip, set)));

  const manifest = { generatedBy: 'scripts/generate-cinematic-frames.cjs', version: '', clips: {} };
  for (const clip of ['v1', 'v2']) {
    const entry = { source: path.basename(videos[clip]), sourceSeconds: sources[clip].duration, usedSeconds: sources[clip].duration };
    jobs.forEach((job, index) => {
      if (job.clip === clip) entry[job.set.name] = encoded[index];
    });
    manifest.clips[clip] = entry;
  }

  const ssim = await boundarySsim(videos.v1, videos.v2, sources.v1.frames);
  // Dos cuadros seguidos dentro de un mismo video dan ~0,94. Bajo 0,9 el
  // salto entre videos se nota, y la landing lo cubre con un fundido de 300 ms.
  manifest.boundary = { ssim, crossfadeMs: ssim !== null && ssim >= 0.9 ? 0 : 300 };
  manifest.version = frameVersion();
  fs.writeFileSync(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const total = name => Object.values(manifest.clips).reduce((sum, clip) => sum + clip[name].bytes, 0);
  console.log(`Unión v1→v2: SSIM ${ssim}, fundido ${manifest.boundary.crossfadeMs} ms`);
  console.log(`Tramos claros: v2 escritorio ${JSON.stringify(manifest.clips.v2.desktop.light)} · v2 móvil ${JSON.stringify(manifest.clips.v2.mobile.light)}`);
  console.log(`Total escritorio ${(total('desktop') / 1e6).toFixed(2)} MB · móvil ${(total('mobile') / 1e6).toFixed(2)} MB`);
  console.log(`Escribí ${path.relative(root, path.join(output, 'manifest.json'))}`);
}

(process.argv.includes('--version-only') ? Promise.resolve().then(writeVersionOnly) : main()).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
