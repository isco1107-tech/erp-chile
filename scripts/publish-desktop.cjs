const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

function main() {
  const state = JSON.parse(fs.readFileSync('.vercel/desktop-build.json', 'utf8'));
  if (!['erp', 'pos'].includes(state.edition) || !/^[0-9a-f]{40}$/.test(state.sha) || !Number.isSafeInteger(state.runId)) throw new Error('Download a successful build with desktop-ci.cjs first');
  const expectedDirectory = path.join('.vercel', 'desktop-artifacts', state.sha, state.edition);
  if (state.artifactDirectory !== expectedDirectory) throw new Error('Unexpected artifact directory');
  const run = JSON.parse(execFileSync('gh', ['api', `repos/isco1107-tech/erp-chile/actions/runs/${state.runId}`], { encoding: 'utf8' }));
  if (run.conclusion !== 'success' || run.head_sha !== state.sha || run.head_branch !== state.branch) throw new Error('Installer provenance does not match a successful source build');
  const version = JSON.parse(fs.readFileSync('desktop-client/src-tauri/tauri.conf.json', 'utf8')).version;
  const targets = [
    { platform: 'windows', architecture: 'x64', folder: 'windows', extension: '.exe', suffix: 'windows.exe' },
    { platform: 'macos', architecture: 'arm64', folder: 'macos-arm64', extension: '.dmg', suffix: 'macos.dmg' },
    { platform: 'macos', architecture: 'x64', folder: 'macos-x64', extension: '.dmg', suffix: 'macos-intel.dmg' },
    { platform: 'linux', architecture: 'x64', folder: 'linux', extension: '.AppImage', suffix: 'linux.AppImage' },
  ];

  // Validate every installer before replacing any currently published file.
  const installers = targets.map(target => {
    const directory = path.join(expectedDirectory, `aether-${state.edition}-${target.folder}`);
    const files = fs.readdirSync(directory, { recursive: true }).filter(file => file.endsWith(target.extension));
    if (files.length !== 1) throw new Error(`Expected one installer in ${directory}, found ${files.length}`);
    if (!files[0].includes(version)) throw new Error(`Installer version mismatch: ${files[0]}`);
    if (state.edition === 'pos' && !files[0].includes('Aether POS')) throw new Error(`Expected POS edition: ${files[0]}`);
    const source = path.join(directory, files[0]);
    const data = fs.readFileSync(source);
    const valid = target.extension === '.exe' ? data.subarray(0, 2).toString() === 'MZ'
      : target.extension === '.dmg' ? data.subarray(data.length - 512, data.length - 508).toString() === 'koly'
      : data.subarray(0, 4).toString('hex') === '7f454c46';
    if (!valid || data.length < 100000) throw new Error(`Invalid installer: ${files[0]}`);
    const release = { platform: target.platform, architecture: target.architecture, version, file: `aether-${state.edition}-${target.suffix}`, size: data.length, sha256: createHash('sha256').update(data).digest('hex'), sourceSha: state.sha, workflowRunId: state.runId };
    return { source, release };
  });
  fs.mkdirSync('public/downloads', { recursive: true });
  for (const installer of installers) fs.copyFileSync(installer.source, path.join('public/downloads', installer.release.file));
  const releases = installers.map(installer => installer.release);
  const manifest = state.edition === 'pos' ? 'pos-releases.json' : 'releases.json';
  const sums = state.edition === 'pos' ? 'POS-SHA256SUMS.txt' : 'SHA256SUMS.txt';
  fs.writeFileSync(path.join('public/downloads', manifest), JSON.stringify(releases, null, 2) + '\n');
  fs.writeFileSync(path.join('public/downloads', sums), releases.map(release => `${release.sha256}  ${release.file}`).join('\n') + '\n');
  console.log(JSON.stringify(releases, null, 2));
}

try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
