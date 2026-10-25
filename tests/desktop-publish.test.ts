import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';

const publisher = fs.readFileSync(path.join(process.cwd(), 'scripts/publish-desktop.cjs'), 'utf8');
const releasePublisher = fs.readFileSync(path.join(process.cwd(), 'scripts/lib/desktop-release.cjs'), 'utf8');
const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'desktop-client/src-tauri/tauri.conf.json'), 'utf8')) as { version: string };
const sha = 'a'.repeat(40);
const artifactDirectory = `.vercel/desktop-artifacts/${sha}/pos`;
let directory: string;

function local(file: string) { return path.join(directory, file); }
function write(file: string, value: string | Buffer) {
  fs.mkdirSync(path.dirname(local(file)), { recursive: true });
  fs.writeFileSync(local(file), value);
}

function fixture() {
  write('.vercel/desktop-build.json', JSON.stringify({ edition: 'pos', sha, branch: 'test-build', runId: 123, artifactDirectory }));
  write('desktop-client/src-tauri/tauri.conf.json', JSON.stringify(config));
  write('public/downloads/releases.json', '[{"edition":"original ERP"}]');
  write('public/downloads/pos-releases.json', '[]');
  for (const [target, extension] of [['windows', '.exe'], ['macos-arm64', '.dmg'], ['macos-x64', '.dmg'], ['linux', '.AppImage']]) {
    const data = Buffer.alloc(100_100);
    if (extension === '.exe') data.write('MZ');
    else if (extension === '.dmg') data.write('koly', data.length - 512);
    else data.set([0x7f, 0x45, 0x4c, 0x46]);
    write(`${artifactDirectory}/aether-pos-${target}/Aether POS_${config.version}_${target}${extension}`, data);
  }
}

function publish(run = { conclusion: 'success', head_sha: sha, head_branch: 'test-build' }, options: { failUpload?: boolean; badDigest?: boolean } = {}) {
  const output = { exitCode: 0 };
  const error = jest.fn();
  const scopedFs = {
    readFileSync: (file: string, encoding?: BufferEncoding) => encoding ? fs.readFileSync(local(file), encoding) : fs.readFileSync(local(file)),
    readdirSync: (file: string, options: { recursive: boolean }) => fs.readdirSync(local(file), options),
    mkdirSync: (file: string, options: { recursive: boolean }) => fs.mkdirSync(local(file), options),
    copyFileSync: (source: string, destination: string) => fs.copyFileSync(local(source), local(destination)),
    writeFileSync: (file: string, data: string) => fs.writeFileSync(local(file), data),
  };
  const remote: { id: number; tag_name: string; draft: boolean; assets: { name: string; size: number; digest: string; browser_download_url: string }[] } = { id: 42, tag_name: `desktop-pos-v${config.version}`, draft: true, assets: [] };
  const execFileSync = jest.fn((_command: string, args: string[]) => {
    if (args[0] === 'api' && args[1].includes('/actions/runs/')) return JSON.stringify(run);
    if (args[0] === 'release' && args[1] === 'create') {
      if (options.failUpload) throw new Error('GitHub upload failed');
      remote.assets = args.filter(file => file.startsWith('.vercel/') && !file.endsWith('.md')).map(file => {
        const data = fs.readFileSync(local(file));
        const name = path.basename(file);
        return {
          name, size: data.length,
          digest: `sha256:${options.badDigest ? '0'.repeat(64) : createHash('sha256').update(data).digest('hex')}`,
          browser_download_url: `https://github.com/isco1107-tech/erp-chile/releases/download/untagged-draft/${name}`,
        };
      });
      return '';
    }
    if (args[0] === 'api' && args[1].endsWith('/releases?per_page=100')) return JSON.stringify([remote]);
    if (args[0] === 'api' && args[1].endsWith('/releases/42')) return JSON.stringify(remote);
    if (args[0] === 'release' && args[1] === 'edit') {
      remote.draft = false;
      for (const asset of remote.assets) asset.browser_download_url = asset.browser_download_url.replace('untagged-draft', remote.tag_name);
      return '';
    }
    throw new Error(`Unexpected GitHub call: ${args.join(' ')}`);
  });
  const releaseModule = { exports: {} };
  const requireDependency = (name: string): unknown => {
    if (name === 'node:fs') return scopedFs;
    if (name === 'node:path') return path;
    if (name === 'node:crypto') return jest.requireActual('node:crypto');
    if (name === 'node:child_process') return { execFileSync };
    if (name === './lib/desktop-release.cjs') return releaseModule.exports;
    throw new Error(`Unexpected dependency: ${name}`);
  };
  runInNewContext(releasePublisher, { module: releaseModule, require: requireDependency });
  runInNewContext(publisher, {
    process: output,
    console: { error, log: jest.fn() },
    require: requireDependency,
  });
  return { ...output, error, execFileSync };
}

beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-desktop-publish-')); fixture(); });
afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }); });

it('publishes verified installers to GitHub with provenance without adding binary weight to Vercel', () => {
  expect(publish().exitCode).toBe(0);
  const releases = JSON.parse(fs.readFileSync(local('public/downloads/pos-releases.json'), 'utf8')) as { file: string; sha256: string; sourceSha: string; workflowRunId: number; url: string }[];
  expect(releases).toHaveLength(4);
  for (const release of releases) {
    expect(release.file).toMatch(/^aether-pos-/);
    expect(release.sourceSha).toBe(sha);
    expect(release.workflowRunId).toBe(123);
    expect(release.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(release.url).toBe(`https://github.com/isco1107-tech/erp-chile/releases/download/desktop-pos-v${config.version}/${release.file}`);
    expect(fs.existsSync(local(`public/downloads/${release.file}`))).toBe(false);
  }
  expect(fs.readFileSync(local('public/downloads/releases.json'), 'utf8')).toBe('[{"edition":"original ERP"}]');
});

it.each([{ failUpload: true }, { badDigest: true }])('keeps the active manifests and does not publish when upload verification fails: %j', options => {
  const result = publish(undefined, options);
  expect(result.exitCode).toBe(1);
  expect(fs.readFileSync(local('public/downloads/pos-releases.json'), 'utf8')).toBe('[]');
  expect(result.execFileSync.mock.calls.some(([, args]) => args[0] === 'release' && args[1] === 'edit')).toBe(false);
});

it('does not replace any published file when a later installer is corrupt', () => {
  write('public/downloads/aether-pos-windows.exe', 'previous verified installer');
  write(`${artifactDirectory}/aether-pos-macos-x64/Aether POS_${config.version}_macos-x64.dmg`, Buffer.alloc(100_100));
  expect(publish().exitCode).toBe(1);
  expect(fs.readFileSync(local('public/downloads/aether-pos-windows.exe'), 'utf8')).toBe('previous verified installer');
  expect(fs.readFileSync(local('public/downloads/pos-releases.json'), 'utf8')).toBe('[]');
});

it.each([
  { conclusion: 'failure', head_sha: sha, head_branch: 'test-build' },
  { conclusion: 'success', head_sha: 'b'.repeat(40), head_branch: 'test-build' },
  { conclusion: 'success', head_sha: sha, head_branch: 'another-build' },
])('rejects unsuccessful or mismatched build provenance', run => {
  expect(publish(run).exitCode).toBe(1);
  expect(fs.readFileSync(local('public/downloads/pos-releases.json'), 'utf8')).toBe('[]');
});
