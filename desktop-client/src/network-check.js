// Solo se comprueba conectividad antes de abrir la app. La edición decide su
// destino en Rust; ERP y POS usan el mismo servidor y esta ruta pública.
const CONNECTIVITY_URL = 'https://aetherp.online/login';

/**
 * `no-cors` no deja leer el status, pero sí distingue una respuesta real
 * (aunque sea un error del servidor) de un fallo de red — que es todo lo
 * que necesitamos para decidir si mostramos el dashboard o la pantalla de
 * sin conexión.
 */
async function probeConnectivity(timeoutMs) {
  try {
    await fetch(CONNECTIVITY_URL, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    return true;
  } catch (_err) {
    return false;
  }
}

async function switchWindow(mode) {
  try {
    await window.__TAURI__.core.invoke('switch_main_window', { mode });
    return true;
  } catch (_err) {
    // Si el comando falla, el reintento automático de la pantalla de origen
    // (setInterval en offline.html) lo vuelve a intentar solo.
    return false;
  }
}
