import * as fs from 'node:fs';
import * as path from 'node:path';

interface DesktopRelease { file: string; url: string; version: string; size: number; sha256: string }

it('keeps every existing installer URL as a temporary redirect to its exact public release', async () => {
  const config = jest.requireActual('../next.config.js') as {
    redirects: () => Promise<{ source: string; destination: string; permanent: boolean }[]>;
  };
  const manifests = ['releases.json', 'pos-releases.json'].flatMap(file =>
    JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/downloads', file), 'utf8')) as DesktopRelease[]);
  const redirects = await config.redirects();
  expect(manifests).toHaveLength(8);
  expect(redirects).toHaveLength(manifests.length);
  for (const release of manifests) {
    const edition = release.file.startsWith('aether-pos-') ? 'pos' : 'erp';
    expect(release.url).toBe(`https://github.com/isco1107-tech/erp-chile/releases/download/desktop-${edition}-v${release.version}/${release.file}`);
    expect(redirects).toContainEqual({ source: `/downloads/${release.file}`, destination: release.url, permanent: false });
    expect(fs.existsSync(path.join(process.cwd(), 'public/downloads', release.file))).toBe(false);
  }
});
