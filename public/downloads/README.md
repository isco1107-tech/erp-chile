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

`releases.json` drives the download buttons and contains actual byte sizes and
SHA-256 digests. `SHA256SUMS.txt` provides independent integrity checks.
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
version, file signatures and hashes before replacing any published file.
The manifest records the source SHA and workflow run ID.
The helper creates a separate build branch and does not change `main`.
Keep package, Cargo and Tauri versions aligned when publishing a new version.
