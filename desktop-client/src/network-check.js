// La URL debe coincidir con DASHBOARD_URL en src-tauri/src/lib.rs — si el
// dominio cambia, hay que actualizar los dos lados (no hay un paso de build
// que los mantenga sincronizados).
const DASHBOARD_URL = 'https://aetherp.online/dashboard';

/**
 * `no-cors` no deja leer el status, pero sí distingue una respuesta real
 * (aunque sea un error del servidor) de un fallo de red — que es todo lo
 * que necesitamos para decidir si mostramos el dashboard o la pantalla de
 * sin conexión.
 */
async function probeConnectivity(timeoutMs) {
  try {
    await fetch(DASHBOARD_URL, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    return true;
  } catch (_err) {
    return false;
  }
}

async function switchWindow(mode) {
  try {
    await window.__TAURI__.core.invoke('switch_main_window', { mode });
  } catch (_err) {
    // Si el comando falla, el reintento automático de la pantalla de origen
    // (setInterval en offline.html) lo vuelve a intentar solo.
  }
}
