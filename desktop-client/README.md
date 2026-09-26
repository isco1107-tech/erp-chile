# Aether ERP Desktop

Tauri 2 desktop client for the hosted Aether ERP. The application opens
`https://aetherp.online/dashboard` in its own window, falling back to
login when the session has expired. The `AetherDesktop` user agent also keeps
root navigation inside the ERP. It requires internet
access and an active ERP account; it is not an offline ERP server.

## Build and distribution

Run `npm ci` and `npm run tauri -- build` on the target operating system with
the Tauri prerequisites installed. The desktop-release GitHub workflow builds
Windows NSIS, Linux AppImage, and macOS DMG for both Apple Silicon and Intel.

See `../public/downloads/README.md` for the publishing and verification workflow.
The current installers are not commercially signed or notarized.
