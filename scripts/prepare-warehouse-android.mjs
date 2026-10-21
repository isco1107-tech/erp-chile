/** Herramientas de compilación aisladas en .codex-audit; no instala nada global. */
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { createWriteStream, createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
const root = fileURLToPath(new URL('../', import.meta.url));
const toolsRoot = path.resolve(root, '.codex-audit/warehouse/android-tools');
const child = (name) => { const target = path.resolve(toolsRoot, name); if (!target.startsWith(toolsRoot + path.sep)) throw new Error('Ruta de herramientas fuera del laboratorio'); return target; };
await mkdir(toolsRoot, { recursive: true });
const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const process = spawn(command, args, { windowsHide: true, stdio: ['pipe', 'inherit', 'inherit'], ...options });
  process.stdin.end('y\n'.repeat(100));
  process.on('error', reject); process.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`La herramienta terminó con código ${code}`)));
});
async function download(url, filename, algorithm, expected) {
  let cached = false;
  try { const hash = createHash(algorithm); for await (const chunk of createReadStream(filename)) hash.update(chunk); cached = hash.digest('hex') === expected; } catch { /* Primera descarga. */ }
  if (cached) return;
  console.log(`Descargando ${path.basename(filename)} desde ${new URL(url).hostname}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Descarga fallida: ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(filename));
  const hash = createHash(algorithm); for await (const chunk of createReadStream(filename)) hash.update(chunk);
  if (hash.digest('hex') !== expected) throw new Error('No coincide la firma de la descarga oficial');
}
const javaAssets = await (await fetch('https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse')).json();
const javaPackage = javaAssets[0].binary.package;
const repository = new DOMParser().parseFromString(await (await fetch('https://dl.google.com/android/repository/repository2-3.xml')).text(), 'text/xml');
const packages = Array.from(repository.getElementsByTagName('remotePackage'));
const commandLine = packages.find((node) => node.getAttribute('path') === 'cmdline-tools;latest');
if (!commandLine) throw new Error('No se encontró Android Command Line Tools');
const windowsArchive = Array.from(commandLine.getElementsByTagName('archive')).find((node) => node.getElementsByTagName('host-os')[0]?.textContent === 'windows');
const archive = windowsArchive.getElementsByTagName('complete')[0];
const sdkUrl = new URL(archive.getElementsByTagName('url')[0].textContent, 'https://dl.google.com/android/repository/').href;
const sdkHash = archive.getElementsByTagName('checksum')[0].textContent;
await download(javaPackage.link, child('jdk.zip'), 'sha256', javaPackage.checksum);
await download(sdkUrl, child('sdk-tools.zip'), 'sha1', sdkHash);
for (const [file, destination] of [['jdk.zip', 'java'], ['sdk-tools.zip', 'cli']]) {
  await mkdir(child(destination), { recursive: true });
  const command = `Expand-Archive -LiteralPath '${child(file).replaceAll("'", "''")}' -DestinationPath '${child(destination).replaceAll("'", "''")}' -Force`;
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command]);
}
const javaHome = path.join(child('java'), (await readdir(child('java'))).find((name) => name.startsWith('jdk-')));
const sdkHome = child('sdk'); await mkdir(sdkHome, { recursive: true });
const env = { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: sdkHome, ANDROID_SDK_ROOT: sdkHome, PATH: `${path.join(javaHome, 'bin')};${process.env.PATH}` };
const manager = path.join(child('cli'), 'cmdline-tools/bin/android.exe');
for (const sdkPackage of ['platform-tools', 'platforms/android-37.0', 'build-tools/37.0.0', 'ndk/27.1.12297006', 'cmake/3.30.5']) {
  await run(manager, ['--sdk', sdkHome, 'sdk', 'install', sdkPackage], { env });
}
await writeFile(path.join(root, 'mobile/aether-warehouse/android/local.properties'), `sdk.dir=${sdkHome.replaceAll('\\', '/').replace(':', '\\:')}\n`);
await writeFile(child('environment.json'), JSON.stringify({ javaHome, sdkHome }));
console.log('Herramientas Android listas, aisladas del entorno global.');
