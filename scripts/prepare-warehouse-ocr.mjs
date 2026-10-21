import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'public', 'warehouse-ocr');
await mkdir(output, { recursive: true });
await copyFile(path.join(root, 'node_modules/tesseract.js/dist/worker.min.js'), path.join(output, 'worker.min.js'));
await copyFile(path.join(root, 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'), path.join(output, 'eng.traineddata.gz'));
const core = path.join(root, 'node_modules/tesseract.js-core');
const files = (await readdir(core)).filter((name) => /^tesseract-core.*-lstm\.wasm(?:\.js)?$/.test(name));
for (const file of files) await copyFile(path.join(core, file), path.join(output, file));
const assets = ['worker.min.js', 'eng.traineddata.gz', ...files];
await writeFile(path.join(output, 'manifest.json'), JSON.stringify({ version: 1, files: assets.map((file) => `/warehouse-ocr/${file}`) }));
console.log(`OCR local preparado: ${assets.length} archivos, sin dependencias de CDN en ejecución.`);
