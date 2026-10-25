const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repository = 'isco1107-tech/erp-chile';

// Only publish an edition after all four installers have been validated by the
// caller. Keep binaries outside public/: Vercel only needs the small manifests.
function publishInstallers({ edition, version, sourceSha, installers }) {
  if (!['erp', 'pos'].includes(edition) || !/^\d+\.\d+\.\d+$/.test(version) || !/^[a-f0-9]{40}$/.test(sourceSha)) {
    throw new Error('Invalid desktop release identity');
  }
  const tag = `desktop-${edition}-v${version}`;
  const directory = path.join('.vercel', 'desktop-releases', tag);
  fs.mkdirSync(directory, { recursive: true });
  const files = installers.map(({ source, release }) => {
    const destination = path.join(directory, release.file);
    fs.copyFileSync(source, destination);
    return destination;
  });
  const sums = path.join(directory, 'SHA256SUMS.txt');
  fs.writeFileSync(sums, installers.map(({ release }) => `${release.sha256}  ${release.file}`).join('\n') + '\n');
  const notes = path.join(directory, 'release-notes.md');
  fs.writeFileSync(notes, `Instaladores de Aether ${edition.toUpperCase()} ${version}.\n\nRequieren conexión a internet y una cuenta activa. Instaladores sin firma comercial. Los SHA-256 permiten verificar la integridad de cada descarga.\n`);
  const gh = (args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

  // A published version is immutable. A retry must use a new version or remove
  // its unpublished draft explicitly; never replace a live installer's bytes.
  gh(['release', 'create', tag, '--repo', repository, '--target', sourceSha,
    '--draft', '--title', `Aether ${edition.toUpperCase()} ${version}`,
    '--notes-file', notes, ...files, sums]);
  // The release-by-tag REST endpoint does not expose unpublished drafts. Find
  // our newly created draft in the authenticated list, then use its stable ID.
  const drafts = JSON.parse(gh(['api', `repos/${repository}/releases?per_page=100`]));
  const draft = drafts.find((item) => item.tag_name === tag);
  if (!draft?.draft || draft.assets.length !== installers.length + 1) throw new Error('Incomplete desktop release draft');
  const endpoint = `repos/${repository}/releases/${draft.id}`;
  const releases = installers.map(({ release }) => {
    const asset = draft.assets.find((item) => item.name === release.file);
    const url = `https://github.com/${repository}/releases/download/${tag}/${release.file}`;
    if (!asset || asset.size !== release.size || asset.digest !== `sha256:${release.sha256}`) {
      throw new Error(`Uploaded installer does not match its verified SHA-256: ${release.file}`);
    }
    return { ...release, url };
  });
  gh(['release', 'edit', tag, '--repo', repository, '--draft=false', '--latest=false']);
  const published = JSON.parse(gh(['api', endpoint]));
  if (published.draft) throw new Error('Desktop release is not public yet');
  for (const release of releases) {
    // Draft assets use a temporary untagged-* URL until publication.
    const asset = published.assets.find((item) => item.name === release.file);
    if (asset?.browser_download_url !== release.url) throw new Error(`Unexpected public download URL: ${release.file}`);
  }
  return releases;
}

module.exports = { publishInstallers };
