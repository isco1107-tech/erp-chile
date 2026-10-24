# Aether ERP / POS Desktop

Tauri 2 desktop client for the hosted Aether ERP. It requires internet access
and an active ERP account; it is not an offline ERP server — offline data
entry with automatic sync is a separate, larger project not built yet.

What this client adds on top of "a browser window pointed at the ERP"
(`src-tauri/src/lib.rs`):

- **Branded splash window** (`src/splash.html`) shown at launch while it
  probes connectivity, instead of a blank/white window.
- **System tray icon** with a "Mostrar Aether" / "Salir" menu and a
  left-click to show/focus the app.
- **Local offline screen at launch** (`src/offline.html`) when the ERP cannot
  be reached. It retries automatically and opens the app when connected.
  Once the app is open, network events never destroy or reload its window:
  a pending cart or payment result must remain available for verification.
- The main window is rebuilt (not navigated in place) between the remote
  dashboard and the local offline page via the `switch_main_window` command,
  which only ever accepts `"app"` or `"offline"` — never an arbitrary URL —
  Only packaged local pages may invoke it; it rejects calls from the hosted
  ERP and refuses to replace an already opened remote app.

The full ERP edition's `AetherDesktop` user agent keeps root navigation inside
the ERP and falls back to login when the session has expired. The POS edition
keeps the native WebView2/WKWebView user agent for browser and Turnstile login
compatibility; its dedicated `/pos` route determines the destination.

## Dedicated point of sale

`npm run build:pos` builds **Aether POS**, using the Cargo `pos` feature and
`src-tauri/tauri.pos.conf.json`. It has a separate application identifier
(`com.aether.pos`) and launches `https://aetherp.online/pos`. The cashier signs
in at the dedicated POS login. The standard ERP installer still launches the
full ERP. Sessions persist in the application's own profile; changing cashiers
requires signing out and using the next person's account. The native client
does not store raw passwords.

## Build and distribution

Run `npm ci` and `npm run tauri -- build` on the target operating system with
the Tauri prerequisites installed. The desktop-release GitHub workflow builds
Windows NSIS, Linux AppImage, and macOS DMG for both Apple Silicon and Intel.
Choose `erp` or `pos` when dispatching the workflow. POS artifacts and download
metadata are separate from the existing ERP installers.

See `../public/downloads/README.md` for the publishing and verification workflow.
The current installers are not commercially signed or notarized.
