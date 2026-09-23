# Aether ERP desktop installers

Published Aether 0.1.1 desktop clients. All clients connect to the hosted ERP
and require internet access and an active account. They do not include a
local database or an ERP subscription. Installers are not commercially signed.

- `aether-erp-windows.exe`
- `aether-erp-macos.dmg` (Apple Silicon)
- `aether-erp-macos-intel.dmg` (Intel)
- `aether-erp-linux.AppImage`

`releases.json` drives the download buttons and contains actual byte sizes and
SHA-256 digests. `SHA256SUMS.txt` provides independent integrity checks.

## Rebuilding

The workflow `.github/workflows/desktop-release.yml` builds Linux, Windows,
macOS ARM64 and macOS Intel on their native hosts. The release helper uses
the existing Git credential without storing it. Run commands from the repo root:

```powershell
node scripts/desktop-ci.cjs start
node scripts/desktop-ci.cjs status
node scripts/desktop-ci.cjs download
Get-ChildItem .vercel/desktop-artifacts/*.zip | ForEach-Object {
  Expand-Archive -LiteralPath $_.FullName -DestinationPath (Join-Path $_.DirectoryName $_.BaseName) -Force
}
node scripts/publish-desktop.cjs
node scripts/verify-landing.cjs http://localhost:3000
vercel --prod --yes --scope erp-f3ca
node scripts/verify-landing.cjs https://erp-tawny-iota.vercel.app
```

Wait for all four successful workflow jobs before downloading artifacts.
The helper creates a separate build branch and does not change `main`.
Keep package, Cargo and Tauri versions aligned when publishing a new version.
