const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const version = JSON.parse(fs.readFileSync('desktop-client/src-tauri/tauri.conf.json', 'utf8')).version;
const targets = [
  { platform: 'windows', architecture: 'x64', folder: 'aether-windows', extension: '.exe', file: 'aether-erp-windows.exe' },
  { platform: 'macos', architecture: 'arm64', folder: 'aether-macos-arm64', extension: '.dmg', file: 'aether-erp-macos.dmg' },
  { platform: 'macos', architecture: 'x64', folder: 'aether-macos-x64', extension: '.dmg', file: 'aether-erp-macos-intel.dmg' },
  { platform: 'linux', architecture: 'x64', folder: 'aether-linux', extension: '.AppImage', file: 'aether-erp-linux.AppImage' },
];

const releases = targets.map(target => {
  const directory = path.join('.vercel/desktop-artifacts', target.folder);
  const files = fs.readdirSync(directory, { recursive: true }).filter(file => file.endsWith(target.extension));
  if (files.length !== 1) throw new Error(`Expected one installer in ${directory}, found ${files.length}`);
  if (!files[0].includes(version)) throw new Error(`Installer version mismatch: ${files[0]}`);
  const data = fs.readFileSync(path.join(directory, files[0]));
  const valid = target.extension === '.exe' ? data.subarray(0, 2).toString() === 'MZ'
    : target.extension === '.dmg' ? data.subarray(data.length - 512, data.length - 508).toString() === 'koly'
    : data.subarray(0, 4).toString('hex') === '7f454c46';
  if (!valid || data.length < 100000) throw new Error(`Invalid installer: ${files[0]}`);
  fs.mkdirSync('public/downloads', { recursive: true });
  fs.copyFileSync(path.join(directory, files[0]), path.join('public/downloads', target.file));
  return { platform: target.platform, architecture: target.architecture, version, file: target.file, size: data.length, sha256: createHash('sha256').update(data).digest('hex') };
});
fs.writeFileSync('public/downloads/releases.json', JSON.stringify(releases, null, 2) + '\n');
fs.writeFileSync('public/downloads/SHA256SUMS.txt', releases.map(release => `${release.sha256}  ${release.file}`).join('\n') + '\n');
console.log(JSON.stringify(releases, null, 2));
