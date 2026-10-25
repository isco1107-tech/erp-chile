# Aether desktop installers

`releases.json` describes published ERP clients. `pos-releases.json` describes
the dedicated POS edition only after its native builds succeed.
All clients connect to the hosted ERP
and require internet access and an active account. They do not include a
local database or an ERP subscription. Installers are not commercially signed.

- `aether-erp-windows.exe`
- `aether-erp-macos.dmg` (Apple Silicon)
- `aether-erp-macos-intel.dmg` (Intel)
- `aether-erp-linux.AppImage`

`releases.json` drives the download buttons and contains actual byte sizes,
SHA-256 digests and the versioned GitHub Releases URL. `SHA256SUMS.txt` provides
independent integrity checks. Only these small manifests/checksums are deployed
to Vercel. The eight installers live in public GitHub Releases, saving about
182.5 MiB per deployment and moving installer traffic away from Vercel.
`next.config.js` redirects each existing `/downloads/<file>` URL with HTTP 307
so buttons and saved links continue to work when a new version is published.
The POS edition uses `aether-pos-*` filenames and `POS-SHA256SUMS.txt`.
An empty POS manifest means installers are still being prepared.

## Rebuilding

The workflow `.github/workflows/desktop-release.yml` builds Linux, Windows,
macOS ARM64 and macOS Intel on their native hosts. The release helper uses the
authenticated GitHub CLI. Commit and push reviewed sources first: the helper
builds that exact SHA, including all Rust, HTML and configuration files.
Run commands from the repo root:

```powershell
node scripts/desktop-ci.cjs start --edition=pos
node scripts/desktop-ci.cjs status
node scripts/desktop-ci.cjs download
node scripts/publish-desktop.cjs
node scripts/verify-landing.cjs http://localhost:3000
vercel --prod --yes --scope erp-f3ca
node scripts/verify-landing.cjs https://aetherp.online
```

Use `--edition=erp` for the full ERP client. Wait for all four successful jobs
before downloading. Downloads are extracted under `.vercel/desktop-artifacts/`
by source SHA and edition. The publisher verifies workflow provenance, edition,
version, file signatures and hashes, stages the binaries outside `public/`,
and uploads a draft tagged `desktop-<edition>-v<version>`. It verifies GitHub's
byte counts and SHA-256 digests before publishing. Only then does it update
the small manifests. The manifest records source SHA, workflow run ID and URL.
Published release assets must never be overwritten: bump the desktop version
for another build. If an upload fails, the previous manifests remain active;
inspect/delete only that unpublished draft before retrying the same version.
Do not copy installers back into `public/downloads/` or commit them again.
Publishing requires a GitHub identity with release/asset write access (including
`uploads.github.com`), such as the workflow's scoped `GITHUB_TOKEN` or a normally
authenticated local GitHub CLI.
The helper creates a separate build branch and does not change `main`.
Keep package, Cargo and Tauri versions aligned when publishing a new version.

Reducing deployment assets does not delete historical Vercel deployments and
does not reduce Blob Storage or reverse transfer/build usage already consumed.
Those limits require the account's actual Usage metrics and authenticated
Vercel access before deciding on retention or orphan-file cleanup.
