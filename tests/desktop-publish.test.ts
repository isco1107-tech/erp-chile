import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runInNewContext } from 'node:vm';

const publisher = fs.readFileSync(path.join(process.cwd(), 'scripts/publish-desktop.cjs'), 'utf8');
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

function publish(run = { conclusion: 'success', head_sha: sha, head_branch: 'test-build' }) {
  const output = { exitCode: 0 };
  const error = jest.fn();
  const scopedFs = {
    readFileSync: (file: string, encoding?: BufferEncoding) => encoding ? fs.readFileSync(local(file), encoding) : fs.readFileSync(local(file)),
    readdirSync: (file: string, options: { recursive: boolean }) => fs.readdirSync(local(file), options),
    mkdirSync: (file: string, options: { recursive: boolean }) => fs.mkdirSync(local(file), options),
    copyFileSync: (source: string, destination: string) => fs.copyFileSync(local(source), local(destination)),
    writeFileSync: (file: string, data: string) => fs.writeFileSync(local(file), data),
  };
  runInNewContext(publisher, {
    process: output,
    console: { error, log: jest.fn() },
    require: (name: string): unknown => {
      if (name === 'node:fs') return scopedFs;
      if (name === 'node:path') return path;
      if (name === 'node:crypto') return jest.requireActual('node:crypto');
      if (name === 'node:child_process') return { execFileSync: () => JSON.stringify(run) };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { ...output, error };
}

beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-desktop-publish-')); fixture(); });
afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }); });

it('publishes all verified POS installers with provenance and preserves the ERP edition', () => {
  expect(publish().exitCode).toBe(0);
  const releases = JSON.parse(fs.readFileSync(local('public/downloads/pos-releases.json'), 'utf8')) as { file: string; sha256: string; sourceSha: string; workflowRunId: number }[];
  expect(releases).toHaveLength(4);
  for (const release of releases) {
    expect(release.file).toMatch(/^aether-pos-/);
    expect(release.sourceSha).toBe(sha);
    expect(release.workflowRunId).toBe(123);
    expect(release.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(fs.statSync(local(`public/downloads/${release.file}`)).size).toBe(100_100);
  }
  expect(fs.readFileSync(local('public/downloads/releases.json'), 'utf8')).toBe('[{"edition":"original ERP"}]');
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
