const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const directory = '.next/server';
  const traces = fs.readdirSync(directory, { recursive: true }).filter(file => file.endsWith('.nft.json'));
  assert.ok(traces.length, 'Build Next.js before checking function storage');
  const sizes = new Map();
  const routes = [];
  let manualScreenshots = 0;
  for (const file of traces) {
    const trace = path.join(directory, file);
    const files = new Set(JSON.parse(fs.readFileSync(trace, 'utf8')).files.map(item => path.resolve(path.dirname(trace), item)));
    let bytes = 0;
    for (const source of files) {
      const relative = path.relative(process.cwd(), source).split(path.sep).join('/');
      assert.ok(!/^public\/downloads\/.*\.(exe|dmg|AppImage)$/.test(relative), `Installer leaked into function: ${file}: ${relative}`);
      if (file.split(path.sep).join('/') === 'app/api/manual/docx/route.js.nft.json' && relative.startsWith('public/')) {
        assert.ok(relative.startsWith('public/manual/screenshots/'), `Unneeded public file in Word function: ${relative}`);
        manualScreenshots++;
      }
      if (!sizes.has(source)) sizes.set(source, fs.existsSync(source) && fs.statSync(source).isFile() ? fs.statSync(source).size : 0);
      bytes += sizes.get(source);
    }
    routes.push({ route: file, bytes });
  }
  assert.ok(manualScreenshots > 0, 'Word manual must retain its screenshots');
  if (process.platform === 'linux' && process.report?.getReport().header.glibcVersionRuntime) {
    for (const file of ['.next/next-server.js.nft.json', '.next/next-minimal-server.js.nft.json']) {
      const trace = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.ok(!trace.files.some(source => /@img\/sharp-(?:libvips-)?(?:linuxmusl-|wasm32)/.test(source)), `Unused image runtime in base server trace: ${file}`);
    }
  }
  // Exercise the image codec used by mobile warehouse uploads and Next Image.
  // Its native runtime binary must remain in the traced deployment files.
  const sharp = require('sharp');
  const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } }).webp().toBuffer();
  assert.ok(image.length > 0, 'Native image processing failed');
  const nativeFiles = Object.keys(require.cache).filter(file => /[\\/]@img[\\/]sharp-.*\.node$/.test(file));
  assert.ok(nativeFiles.length > 0, 'No native Sharp runtime loaded');
  for (const file of nativeFiles) assert.ok(sizes.has(file), `Native image runtime missing from function traces: ${file}`);
  const mib = bytes => (bytes / 1024 ** 2).toFixed(2);
  console.log(`Function packaging: ${traces.length} traces, ${mib([...sizes.values()].reduce((sum, bytes) => sum + bytes, 0))} MiB of unique files.`);
  for (const item of routes.sort((a, b) => b.bytes - a.bytes).slice(0, 5)) console.log(`  ${mib(item.bytes)} MiB ${item.route}`);
  console.log(`Word screenshots retained: ${manualScreenshots}. Native image processing passed. Trace sizes are local packaging measurements, not Vercel account usage.`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
