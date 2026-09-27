# Aether ERP Desktop

Tauri 2 desktop client for the hosted Aether ERP. It requires internet access
and an active ERP account; it is not an offline ERP server — offline data
entry with automatic sync is a separate, larger project not built yet.

What this client adds on top of "a browser window pointed at the ERP"
(`src-tauri/src/lib.rs`):

- **Branded splash window** (`src/splash.html`) shown at launch while it
  probes connectivity, instead of a blank/white window.
- **System tray icon** with a "Mostrar Aether" / "Salir" menu and a
  left-click to show/focus the app.
- **Local offline screen** (`src/offline.html`) instead of the webview's
  generic network-error page when the ERP can't be reached — it retries
  automatically (and on a manual button) and swaps back to the dashboard the
  moment connectivity returns, with no user action needed. This only
  recovers the app *shell*; it does not queue or replay anything a person
  did while disconnected.
- The main window is rebuilt (not navigated in place) between the remote
  dashboard and the local offline page via the `switch_main_window` command,
  which only ever accepts `"app"` or `"offline"` — never an arbitrary URL —
  since `withGlobalTauri` exposes `invoke()` to the hosted page too.

The `AetherDesktop` user agent (`src/network-check.js` and
`src-tauri/src/lib.rs` — keep both in sync) also keeps root navigation inside
the ERP, and falls back to login when the session has expired.

## Build and distribution

Run `npm ci` and `npm run tauri -- build` on the target operating system with
the Tauri prerequisites installed. The desktop-release GitHub workflow builds
Windows NSIS, Linux AppImage, and macOS DMG for both Apple Silicon and Intel.

See `../public/downloads/README.md` for the publishing and verification workflow.
The current installers are not commercially signed or notarized.
