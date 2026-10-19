// Visor interactivo del modelo de procesos. Una sola página con los datos y los
// BPMN embebidos; dibuja con bpmn-js (versión fija, desde unpkg).

const BPMN_JS = 'https://unpkg.com/bpmn-js@18.30.1/dist/bpmn-navigated-viewer.production.min.js';
const FUENTES = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Condensed:wght@500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap';

const CSS = `
/* Mesa de procesos: índice a la izquierda, lámina BPMN sobre papel claro y su ficha debajo. */
:root {
  --bg: #eceef2;
  --surface: #ffffff;
  --surface-2: #f5f6f8;
  --line: #d6dae1;
  --fg: #12161f;
  --muted: #586070;
  --gold: #8a6a14;
  --gold-soft: #f3ead0;
  --band: #12161f;
  --band-fg: #f1efe8;
  --band-gold: #dbc076;
  --paper: #ffffff;
  --alta: #b3261e;
  --alta-soft: #fbe7e5;
  --media: #8a5300;
  --media-soft: #fff1d6;
  --baja: #3d4f5c;
  --baja-soft: #e9eef2;
  --font-display: 'IBM Plex Sans Condensed', 'Arial Narrow', 'Helvetica Neue', sans-serif;
  --font-body: 'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0c0f15; --surface: #141922; --surface-2: #1a202b; --line: #2a3140; --fg: #e8e6df; --muted: #9ba3b1;
    --gold: #dbc076; --gold-soft: #2a2414; --band: #141922; --band-fg: #e8e6df; --band-gold: #dbc076; --paper: #fbfaf7;
    --alta: #ff9a8f; --alta-soft: #3a1d1a; --media: #ffcf86; --media-soft: #33270f; --baja: #b6c4cc; --baja-soft: #1e252d;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #0c0f15; --surface: #141922; --surface-2: #1a202b; --line: #2a3140; --fg: #e8e6df; --muted: #9ba3b1;
  --gold: #dbc076; --gold-soft: #2a2414; --band: #141922; --band-fg: #e8e6df; --band-gold: #dbc076; --paper: #fbfaf7;
  --alta: #ff9a8f; --alta-soft: #3a1d1a; --media: #ffcf86; --media-soft: #33270f; --baja: #b6c4cc; --baja-soft: #1e252d;
  color-scheme: dark;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body { background: var(--bg); color: var(--fg); font-family: var(--font-body); font-size: 15px; line-height: 1.55; margin: 0; overflow-wrap: break-word; }
a { color: inherit; }
:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
h1, h2, h3 { font-family: var(--font-display); font-weight: 600; line-height: 1.15; text-wrap: balance; margin: 0; }
.banda { background: var(--band); color: var(--band-fg); padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 22px 20px; }
.banda-int { max-width: 1480px; margin: 0 auto; display: flex; flex-wrap: wrap; gap: 8px 32px; align-items: end; justify-content: space-between; }
.eyebrow { font-family: var(--font-mono); font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: var(--band-gold); margin: 0 0 6px; }
.banda h1 { font-size: clamp(26px, 3.4vw, 38px); }
.banda p.sub { margin: 6px 0 0; max-width: 70ch; color: color-mix(in srgb, var(--band-fg) 78%, transparent); }
.cifras { display: flex; gap: 22px; flex-wrap: wrap; font-family: var(--font-mono); font-size: 13px; color: color-mix(in srgb, var(--band-fg) 80%, transparent); }
.boton-banda { align-self: center; background: transparent; color: var(--band-gold); border-color: color-mix(in srgb, var(--band-gold) 55%, transparent); }
.boton-banda:hover { border-color: var(--band-gold); }
.cifras b { display: block; font-family: var(--font-display); font-size: 24px; color: var(--band-gold); font-weight: 600; font-variant-numeric: tabular-nums; }
.marco { max-width: 1480px; margin: 0 auto; display: grid; grid-template-columns: 290px minmax(0, 1fr); gap: 24px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 24px 48px; }
.indice { position: sticky; top: env(safe-area-inset-top, 0px); align-self: start; max-height: 100vh; overflow: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px; }
.indice summary { display: none; }
.indice input[type="search"] { width: 100%; font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface-2); color: var(--fg); }
.grupo { margin-top: 16px; display: grid; gap: 2px; }
.grupo h2 { font-family: var(--font-mono); font-weight: 500; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); margin: 0 0 6px 8px; }
.grupo a { display: flex; gap: 10px; align-items: baseline; text-decoration: none; padding: 5px 8px; border-radius: 6px; font-size: 14px; line-height: 1.3; }
.grupo a:hover { background: var(--surface-2); }
.grupo a[aria-current="page"] { background: var(--gold-soft); }
.grupo a .cod { font-family: var(--font-mono); font-size: 12px; color: var(--gold); flex: none; width: 30px; }
.grupo a .cuenta { margin-left: auto; font-family: var(--font-mono); font-size: 11px; color: var(--alta); }
.vacio { color: var(--muted); font-size: 13px; padding: 6px 8px; }
.etiqueta { display: block; font-size: 12px; color: var(--muted); margin: 0 0 6px; }
main { min-width: 0; }
.vista { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; }
.titulo h1 { font-size: clamp(24px, 2.6vw, 32px); }
.titulo .ruta { font-family: var(--font-mono); font-size: 12px; color: var(--muted); letter-spacing: .04em; margin-bottom: 6px; }
.titulo p { margin: 8px 0 0; max-width: 78ch; color: var(--muted); }
.cod-grande { font-family: var(--font-mono); color: var(--gold); font-weight: 500; margin-right: 10px; }
.meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.meta div { background: var(--surface); padding: 12px 14px; min-width: 0; }
.meta dt { font-family: var(--font-mono); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
.meta dd { margin: 4px 0 0; font-size: 14px; }
.panel { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 16px; min-width: 0; }
.panel h2 { font-size: 18px; margin-bottom: 10px; }
.lamina { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: var(--surface); }
.barra { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px 12px; border-bottom: 1px solid var(--line); }
.barra .ayuda { font-size: 12px; color: var(--muted); margin-left: auto; }
button, .boton { font: inherit; font-size: 13px; font-weight: 500; padding: 6px 12px; border-radius: 7px; border: 1px solid var(--line); background: var(--surface-2); color: var(--fg); cursor: pointer; text-decoration: none; }
button:hover, .boton:hover { border-color: var(--gold); }
#lienzo { height: clamp(420px, 64vh, 780px); background: var(--paper); position: relative; }
.lienzo-error { position: absolute; inset: 0; display: grid; place-items: center; padding: 24px; text-align: center; color: #3d4f5c; font-size: 14px; }
.detalle { padding: 12px 14px; border-top: 1px solid var(--line); background: var(--surface-2); font-size: 14px; min-height: 56px; }
.detalle .tipo { font-family: var(--font-mono); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--gold); }
.detalle strong { display: block; margin: 2px 0; }
.detalle p { margin: 4px 0 0; color: var(--muted); max-width: 90ch; }
.dos { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 20px; }
ul.lista { margin: 0; padding-left: 18px; display: grid; gap: 6px; }
.brecha-caja { border-left: 3px solid var(--alta); background: var(--alta-soft); padding: 10px 12px; border-radius: 0 8px 8px 0; margin-top: 12px; font-size: 14px; }
.mono { font-family: var(--font-mono); font-size: 12.5px; overflow-wrap: anywhere; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { font-family: var(--font-mono); font-size: 12px; padding: 2px 8px; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--line); overflow-wrap: anywhere; }
.chip-proc { font-family: var(--font-mono); font-size: 12px; padding: 1px 7px; border-radius: 5px; background: var(--gold-soft); color: var(--gold); text-decoration: none; border: 1px solid transparent; }
.chip-proc:hover { border-color: var(--gold); }
.tabla { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 13.5px; min-width: 620px; }
th { text-align: left; font-family: var(--font-mono); font-weight: 500; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); padding: 8px 10px; border-bottom: 1px solid var(--line); }
td { padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
td.det { color: var(--muted); }
.pie-nav { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.pie-nav a { text-decoration: none; font-size: 14px; }
.niveles { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2.2fr) minmax(0, 1fr); gap: 16px; align-items: start; }
.nivel { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px; display: grid; gap: 10px; min-width: 0; }
.nivel > p { margin: 0; color: var(--muted); font-size: 13.5px; }
.nivel h2 { font-size: 20px; }
.subarea { font-family: var(--font-mono); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); margin-top: 6px; }
.tarjetas { display: grid; gap: 8px; }
.nivel-op .tarjetas { grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); }
.tarjeta { display: grid; gap: 4px; text-decoration: none; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-2); min-width: 0; }
.tarjeta:hover { border-color: var(--gold); }
.tarjeta b { font-weight: 600; font-size: 14px; line-height: 1.3; }
.tarjeta span { font-size: 12.5px; color: var(--muted); line-height: 1.4; }
.tarjeta .cod { font-family: var(--font-mono); font-size: 12px; color: var(--gold); }
.leyenda { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; }
.leyenda div { display: flex; gap: 12px; align-items: center; font-size: 13.5px; }
.leyenda svg { flex: none; background: var(--paper); border: 1px solid var(--line); border-radius: 6px; }
ol.pasos { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; counter-reset: paso; }
ol.pasos li { counter-increment: paso; display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 14px; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px; }
ol.pasos li::before { content: counter(paso, decimal-leading-zero); font-family: var(--font-mono); font-size: 18px; color: var(--gold); }
ol.pasos h3 { font-size: 17px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
ol.pasos p { margin: 6px 0 8px; color: var(--muted); }
.bloqueo { font-family: var(--font-mono); font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--alta); background: var(--alta-soft); padding: 2px 8px; border-radius: 999px; text-decoration: none; }
.brechas { display: grid; gap: 12px; }
.brecha { background: var(--surface); border: 1px solid var(--line); border-left-width: 4px; border-radius: 10px; padding: 14px 16px; display: grid; gap: 8px; }
.brecha[data-sev="alta"] { border-left-color: var(--alta); }
.brecha[data-sev="media"] { border-left-color: var(--media); }
.brecha[data-sev="baja"] { border-left-color: var(--baja); }
.brecha h3 { font-size: 17px; }
.brecha p { margin: 0; overflow-wrap: anywhere; }
.sev { font-family: var(--font-mono); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; }
.sev[data-sev="alta"] { color: var(--alta); background: var(--alta-soft); }
.sev[data-sev="media"] { color: var(--media); background: var(--media-soft); }
.sev[data-sev="baja"] { color: var(--baja); background: var(--baja-soft); }
.cab-brecha { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-family: var(--font-mono); font-size: 13px; }
.aviso { position: fixed; left: 50%; bottom: calc(20px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); background: var(--band); color: var(--band-fg); padding: 8px 16px; border-radius: 8px; font-size: 14px; box-shadow: 0 6px 24px rgb(0 0 0 / .25); }
.djs-container { position: relative; }
.djs-outline { fill: none; visibility: hidden; }
.djs-element.hover .djs-outline, .djs-element.selected .djs-outline { visibility: visible; stroke: #b08a2a; stroke-width: 2px; }
.djs-overlay-container { position: absolute; width: 0; height: 0; }
.bjs-drilldown, .bjs-breadcrumbs { display: none !important; }
.djs-cursor-grab { cursor: grab; }
.djs-cursor-grabbing { cursor: grabbing; }
@media (max-width: 1100px) {
  .niveles { grid-template-columns: minmax(0, 1fr); }
  .dos { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 900px) {
  .marco { grid-template-columns: minmax(0, 1fr); }
  .indice { position: static; max-height: none; }
  .indice summary { display: block; cursor: pointer; font-family: var(--font-display); font-weight: 600; font-size: 16px; }
  .barra .ayuda { margin-left: 0; width: 100%; }
}
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
`;

const LEYENDA = [
  ['<rect x="6" y="8" width="40" height="26" rx="5" fill="#e6eefb" stroke="#1d4f91" stroke-width="1.6"/><circle cx="13" cy="15" r="3" fill="none" stroke="#1d4f91"/>', 'Tarea de usuario: alguien la hace en una pantalla'],
  ['<rect x="6" y="8" width="40" height="26" rx="5" fill="#edf1f4" stroke="#3d4f5c" stroke-width="1.6"/><circle cx="13" cy="15" r="3" fill="none" stroke="#3d4f5c" stroke-dasharray="2 1.5"/>', 'Tarea automática o regla del sistema'],
  ['<rect x="6" y="8" width="40" height="26" rx="5" fill="#efe9fa" stroke="#5b3a9e" stroke-width="1.6"/><rect x="10" y="12" width="9" height="6" fill="#5b3a9e"/>', 'Envío o recepción de un mensaje'],
  ['<rect x="6" y="8" width="40" height="26" rx="5" fill="#faf1d9" stroke="#7a5c12" stroke-width="1.6"/><rect x="21" y="25" width="10" height="8" fill="none" stroke="#7a5c12"/><path d="M26 27v4M24 29h4" stroke="#7a5c12"/>', 'Subproceso con su propio diagrama'],
  ['<circle cx="15" cy="21" r="9" fill="#e3f3e5" stroke="#2e7d32" stroke-width="1.6"/><circle cx="38" cy="21" r="9" fill="#fbe7e5" stroke="#b3261e" stroke-width="3"/>', 'Inicio y fin del proceso'],
  ['<circle cx="15" cy="21" r="9" fill="#fff4dc" stroke="#9a5b00" stroke-width="1.4"/><circle cx="15" cy="21" r="6.5" fill="none" stroke="#9a5b00"/><path d="M15 17v4l3 2" stroke="#9a5b00" fill="none"/><circle cx="38" cy="21" r="9" fill="#fff4dc" stroke="#9a5b00" stroke-width="1.4"/><rect x="33" y="17.5" width="10" height="7" fill="none" stroke="#9a5b00"/>', 'Espera: temporizador o cron, y llegada de un mensaje'],
  ['<path d="M15 9l12 12-12 12L3 21z" fill="#fff1bf" stroke="#8a6a00" stroke-width="1.6"/><path d="M11 17l8 8M19 17l-8 8" stroke="#8a6a00" stroke-width="2"/><path d="M38 9l12 12-12 12-12-12z" fill="#fff1bf" stroke="#8a6a00" stroke-width="1.6"/><path d="M38 15v12M32 21h12" stroke="#8a6a00" stroke-width="2"/>', 'Decisión exclusiva (X) y caminos en paralelo (+)'],
  ['<path d="M4 21h44" stroke="#5f6368" stroke-width="1.4" stroke-dasharray="4 3"/><circle cx="6" cy="21" r="2.5" fill="#fff" stroke="#5f6368"/><path d="M44 17l6 4-6 4z" fill="#fff" stroke="#5f6368"/>', 'Mensaje entre organizaciones o sistemas'],
];

/**
 * ZIP sin compresión (método "store"), suficiente para entregar los .bpmn juntos.
 * Corre en el navegador (se inyecta con toString) y en Node para probarlo.
 */
export function crearZip(archivos) {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  const crc32 = (bytes) => {
    let c = 0xffffffff;
    for (const b of bytes) c = tabla[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const enc = new TextEncoder();
  const fecha = ((2026 - 1980) << 9) | (10 << 5) | 19;
  const partes = [];
  const central = [];
  let offset = 0;
  for (const { nombre, texto } of archivos) {
    const n = enc.encode(nombre);
    const d = enc.encode(texto);
    const crc = crc32(d);
    const local = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, 0, 2], [12, fecha, 2], [14, crc, 4], [18, d.length, 4], [22, d.length, 4], [26, n.length, 2], [28, 0, 2]]
      .forEach(([o, v, t]) => (t === 4 ? local.setUint32(o, v, true) : local.setUint16(o, v, true)));
    const cen = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, 0, 2], [14, fecha, 2], [16, crc, 4], [20, d.length, 4], [24, d.length, 4], [28, n.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]]
      .forEach(([o, v, t]) => (t === 4 ? cen.setUint32(o, v, true) : cen.setUint16(o, v, true)));
    partes.push(new Uint8Array(local.buffer), n, d);
    central.push(new Uint8Array(cen.buffer), n);
    offset += 30 + n.length + d.length;
  }
  const tamCentral = central.reduce((s, p) => s + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, archivos.length, 2], [10, archivos.length, 2], [12, tamCentral, 4], [16, offset, 4], [20, 0, 2]]
    .forEach(([o, v, t]) => (t === 4 ? fin.setUint32(o, v, true) : fin.setUint16(o, v, true)));
  return new Blob([...partes, ...central, new Uint8Array(fin.buffer)], { type: 'application/zip' });
}

// Código que corre en el navegador. Se serializa con toString(): todo lo que usa vive adentro.
function cliente() {
  const datos = JSON.parse(document.getElementById('datos').textContent);
  const procesos = datos.procesos;
  const porId = new Map(procesos.map((p) => [p.id, p]));
  const areas = Object.fromEntries(datos.areas.map((a) => [a.id, a.nombre]));
  const niveles = Object.fromEntries(datos.niveles.map((n) => [n.id, n.nombre]));
  const brechaPorId = new Map(datos.brechas.map((b) => [b.id, b]));
  const TIPO = {
    inicio: 'Inicio', 'inicio-msg': 'Inicio por mensaje', 'inicio-timer': 'Inicio programado', 'inicio-senal': 'Inicio por señal', 'inicio-cond': 'Inicio condicional',
    fin: 'Fin', 'fin-msg': 'Fin con mensaje', 'fin-terminar': 'Fin del proceso completo', 'fin-error': 'Fin con error',
    'msg-recibir': 'Espera un mensaje', 'msg-enviar': 'Envía un mensaje', timer: 'Espera de tiempo', 'senal-enviar': 'Señal',
    usuario: 'Tarea de usuario', manual: 'Tarea manual', servicio: 'Tarea automática', script: 'Script', regla: 'Regla de negocio',
    enviar: 'Envío', recibir: 'Recepción', tarea: 'Tarea', sub: 'Subproceso',
    xor: 'Decisión exclusiva', and: 'Caminos en paralelo', or: 'Decisión inclusiva', evento: 'Espera el primer evento',
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const plano = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const enlace = (id) => (porId.has(id) ? `<a class="chip-proc" href="#${id}" title="${esc(porId.get(id).nombre)}">${id}</a>` : esc(id));
  const angosto = window.matchMedia('(max-width: 900px)');

  let aviso = null;
  function avisar(texto) {
    aviso?.remove();
    aviso = document.createElement('div');
    aviso.className = 'aviso';
    aviso.setAttribute('role', 'status');
    aviso.textContent = texto;
    document.body.append(aviso);
    setTimeout(() => aviso?.remove(), 2400);
  }

  // ── Índice ──
  const buscar = document.getElementById('buscar');
  function pintarIndice() {
    const q = plano(buscar.value.trim());
    const coincide = (p) => !q || plano(`${p.id} ${p.nombre} ${p.resumen} ${p.modulos.join(' ')}`).includes(q);
    const grupos = datos.areas.map((a) => {
      const lista = procesos.filter((p) => p.area === a.id && coincide(p));
      if (!lista.length) return '';
      return `<nav class="grupo" aria-label="${esc(a.nombre)}"><h2>${esc(a.nombre)}</h2>${lista
        .map((p) => `<a href="#${p.id}" data-id="${p.id}"><span class="cod">${p.id}</span><span>${esc(p.nombre)}</span>${p.brechas.length ? '<span class="cuenta" title="Tiene brechas">●</span>' : ''}</a>`)
        .join('')}</nav>`;
    }).join('');
    document.getElementById('lista').innerHTML = grupos || '<p class="vacio">Ningún proceso coincide con la búsqueda.</p>';
    marcarActual();
  }
  function marcarActual() {
    const h = location.hash.slice(1) || 'mapa';
    for (const a of document.querySelectorAll('.indice a')) {
      if ((a.dataset.id ?? a.getAttribute('href').slice(1)) === h) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
  }
  buscar.addEventListener('input', pintarIndice);

  // ── Vistas generales ──
  function vistaMapa() {
    const tarjeta = (p) => `<a class="tarjeta" href="#${p.id}"><span class="cod">${p.id}</span><b>${esc(p.nombre)}</b><span>${esc(p.resumen)}</span></a>`;
    document.getElementById('v-mapa').innerHTML = `
      <div class="titulo"><div class="ruta">Vista general</div><h1>Mapa de procesos</h1>
        <p>Cada tarjeta abre su diagrama BPMN. El ciclo completo de una empresa está en ${enlace('P00')}; la secuencia para dejar todo andando, en <a href="#puesta">Puesta en marcha</a>.</p></div>
      <div class="niveles">${datos.niveles.map((n) => {
        const lista = procesos.filter((p) => p.nivel === n.id);
        const cuerpo = n.id === 'operativo'
          ? datos.areas.map((a) => {
            const sub = lista.filter((p) => p.area === a.id);
            return sub.length ? `<div class="subarea">${esc(a.nombre)}</div><div class="tarjetas">${sub.map(tarjeta).join('')}</div>` : '';
          }).join('')
          : `<div class="tarjetas">${lista.map(tarjeta).join('')}</div>`;
        return `<section class="nivel ${n.id === 'operativo' ? 'nivel-op' : ''}"><h2>${esc(n.nombre)}</h2><p>${esc(n.texto)}</p>${cuerpo}</section>`;
      }).join('')}</div>
      <section class="panel"><h2>Cómo leer los diagramas</h2><div class="leyenda">${document.getElementById('leyenda').innerHTML}</div></section>`;
  }

  function vistaPuesta() {
    document.getElementById('v-puesta').innerHTML = `
      <div class="titulo"><div class="ruta">Vista general</div><h1>Puesta en marcha, de punta a punta</h1>
        <p>El orden real para dejar Aether y la Supersuite funcionando y una empresa operando. Cada paso enlaza al proceso que lo detalla.</p></div>
      <ol class="pasos">${datos.puesta.map((p) => `
        <li><div><h3>${esc(p.paso)} ${p.procesos.map(enlace).join(' ')}${p.bloqueo ? ` <a class="bloqueo" href="#brechas">Bloqueado: ${esc(p.bloqueo)}</a>` : ''}</h3>
          <p>${esc(p.texto)}</p>${p.variables ? `<div class="chips">${p.variables.map((v) => `<span class="chip">${esc(v)}</span>`).join('')}</div>` : ''}</div></li>`).join('')}
      </ol>`;
  }

  function vistaBrechas() {
    document.getElementById('v-brechas').innerHTML = `
      <div class="titulo"><div class="ruta">Vista general</div><h1>Brechas encontradas</h1>
        <p>Lo que los procesos necesitan y el código todavía no tiene, ordenado por severidad. Cada una indica dónde está y qué se propone.</p></div>
      <div class="brechas">${datos.brechas.map((b) => `
        <article class="brecha" data-sev="${b.severidad}">
          <div class="cab-brecha"><b>${esc(b.id)}</b><span class="sev" data-sev="${b.severidad}">${esc(b.severidad)}</span>${b.procesos.map(enlace).join(' ')}</div>
          <h3>${esc(b.titulo)}</h3><p>${esc(b.detalle)}</p>
          <p class="mono">${esc(b.donde)}</p><p><b>Propuesta:</b> ${esc(b.propuesta)}</p>
        </article>`).join('')}</div>`;
  }

  // ── Vista de un proceso ──
  let visor = null;
  let actual = null;
  const lienzo = document.getElementById('lienzo');

  function crearVisor() {
    if (visor) return visor;
    if (!window.BpmnJS) {
      lienzo.innerHTML = '<p class="lienzo-error">No se pudo cargar el dibujante de diagramas (bpmn-js). Revisa la conexión a internet. Los archivos .bpmn están en docs/procesos/bpmn/.</p>';
      return null;
    }
    visor = new window.BpmnJS({ container: lienzo });
    visor.on('element.click', (e) => mostrarDetalle(e.element));
    return visor;
  }

  function mostrarDetalle(el) {
    const caja = document.getElementById('detalle');
    const info = actual?.elementos[el.id];
    if (!info) {
      const bo = el.businessObject ?? {};
      const tipo = { 'bpmn:Participant': 'Piscina', 'bpmn:Lane': 'Carril', 'bpmn:SequenceFlow': 'Flujo', 'bpmn:MessageFlow': 'Mensaje', 'bpmn:TextAnnotation': 'Nota' }[bo.$type] ?? '';
      const nombre = bo.name ?? bo.text ?? '';
      caja.innerHTML = tipo && nombre ? `<div class="tipo">${esc(tipo)}</div><strong>${esc(nombre)}</strong>` : '<p>Haz clic en una actividad, evento o decisión para ver su detalle.</p>';
      return;
    }
    const sub = info.tipo === 'sub' ? /^P\d\d/.exec(info.nombre)?.[0] : null;
    caja.innerHTML = `<div class="tipo">${esc(TIPO[info.tipo] ?? info.tipo)} · ${esc(info.carril)}</div><strong>${esc(info.nombre || '(sin nombre)')}</strong>${info.doc ? `<p>${esc(info.doc)}</p>` : ''}${sub && porId.has(sub) ? `<p><a class="chip-proc" href="#${sub}">Abrir ${sub}</a></p>` : ''}`;
  }

  async function dibujar(p) {
    const v = crearVisor();
    if (!v) return;
    try {
      await v.importXML(p.xml);
      // Un diagrama ancho completo queda ilegible: se abre a tamaño de lectura desde su inicio.
      const c = v.get('canvas');
      c.zoom('fit-viewport', 'auto');
      if (c.zoom() < 0.55) {
        const vb = c.viewbox();
        c.viewbox({ x: vb.inner.x - 16, y: vb.inner.y - 16, width: vb.outer.width / 0.62, height: vb.outer.height / 0.62 });
      }
    } catch (error) {
      lienzo.insertAdjacentHTML('beforeend', `<p class="lienzo-error">No se pudo dibujar ${esc(p.id)}: ${esc(error.message)}</p>`);
    }
  }

  function vistaProceso(p) {
    actual = p;
    const i = procesos.indexOf(p);
    const ant = procesos[i - 1];
    const sig = procesos[i + 1];
    const brechas = p.brechas.map((id) => brechaPorId.get(id));
    document.getElementById('p-cabeza').innerHTML = `
      <div class="titulo"><div class="ruta">${esc(areas[p.area])} · ${esc(niveles[p.nivel])}</div>
        <h1><span class="cod-grande">${p.id}</span>${esc(p.nombre)}</h1><p>${esc(p.resumen)}</p></div>
      <dl class="meta">
        <div><dt>Objetivo</dt><dd>${esc(p.objetivo)}</dd></div>
        <div><dt>Disparador</dt><dd>${esc(p.disparador)}</dd></div>
        <div><dt>Resultado</dt><dd>${esc(p.resultado)}</dd></div>
        <div><dt>Dueño del proceso</dt><dd>${esc(p.duenio)}</dd></div>
      </dl>`;
    document.getElementById('detalle').innerHTML = '<p>Haz clic en una actividad, evento o decisión para ver su detalle.</p>';
    document.getElementById('p-ficha').innerHTML = `
      <div class="dos">
        <section class="panel"><h2>Reglas de negocio</h2><ul class="lista">${p.reglas.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
          ${brechas.map((b) => `<div class="brecha-caja"><b>Brecha ${esc(b.id)}.</b> ${esc(b.titulo)} · <a href="#brechas">ver detalle</a></div>`).join('')}</section>
        <section class="panel"><h2>Participantes</h2><ul class="lista">${p.actores.map((a) => `<li><b>${esc(a.nombre)}</b>${a.externo ? ' · externo' : `: ${esc(a.carriles.join(', '))}`}</li>`).join('')}</ul>
          <h2 style="margin-top:16px">Código</h2><ul class="lista">${p.codigo.map((c) => `<li class="mono">${esc(c)}</li>`).join('')}</ul>
          <h2 style="margin-top:16px">Módulos</h2><div class="chips">${p.modulos.map((m) => `<span class="chip">${esc(m)}</span>`).join('')}</div>
          <p class="mono" style="margin-top:14px;color:var(--muted)">docs/procesos/${esc(p.archivo)}</p></section>
      </div>
      <section class="panel"><h2>Actividades</h2><div class="tabla"><table>
        <thead><tr><th>Carril</th><th>Actividad</th><th>Tipo</th><th>Detalle</th></tr></thead>
        <tbody>${p.actividades.map((a) => `<tr><td>${esc(a.carril)}</td><td>${esc(a.nombre)}</td><td>${esc(a.tipo)}</td><td class="det">${esc(a.doc)}</td></tr>`).join('')}</tbody>
      </table></div></section>
      <nav class="pie-nav" aria-label="Procesos vecinos">${ant ? `<a href="#${ant.id}">← ${ant.id} ${esc(ant.nombre)}</a>` : '<span></span>'}${sig ? `<a href="#${sig.id}">${sig.id} ${esc(sig.nombre)} →</a>` : ''}</nav>`;
    dibujar(p);
  }

  document.getElementById('ajustar').addEventListener('click', () => visor?.get('canvas').zoom('fit-viewport', 'auto'));
  document.getElementById('acercar').addEventListener('click', () => { const c = visor?.get('canvas'); c?.zoom(c.zoom() * 1.25); });
  document.getElementById('alejar').addEventListener('click', () => { const c = visor?.get('canvas'); c?.zoom(c.zoom() / 1.25); });
  document.getElementById('copiar').addEventListener('click', () => {
    if (!actual) return;
    const xml = actual.xml;
    navigator.clipboard.writeText(xml).then(() => avisar(`BPMN de ${actual.id} copiado`), () => {
      const t = document.createElement('textarea');
      t.value = xml;
      t.style.position = 'fixed';
      t.style.opacity = '0';
      document.body.append(t);
      t.select();
      avisar('Selecciona y copia con Ctrl + C');
      setTimeout(() => t.remove(), 4000);
    });
  });
  // Descargas: en claude.ai pasan por la capacidad "downloads" (el visor pide confirmación);
  // abierto como archivo local, con un enlace normal. Van en .zip: .bpmn no está entre los formatos permitidos.
  const local = location.protocol === 'file:';
  let descargas = null;
  const LEEME = 'Modelo de procesos de Aether y la Supersuite (BPMN 2.0).\r\n\r\nBizagi Modeler: importa cada archivo .bpmn con la opción de importar BPMN 2.0.\r\nCamunda Modeler y bpmn.io los abren directamente.\r\nFuente: docs/procesos/ del repositorio erp-chile.\r\n';
  function mostrarDescargas() {
    for (const id of ['descargar', 'descargar-todo']) document.getElementById(id).hidden = false;
  }
  async function guardar(nombre, blob) {
    if (descargas) {
      try {
        await descargas.save({ filename: nombre, data: blob });
        avisar(`${nombre} listo`);
      } catch (error) {
        if (error?.code === 'declined') return;
        avisar(error?.code === 'rate_limited' ? 'Ya hay una descarga esperando confirmación' : 'Esta vista no permite descargar archivos');
      }
      return;
    }
    if (!local) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  document.getElementById('descargar').addEventListener('click', () => {
    if (!actual) return;
    const nombre = actual.archivo.replace('bpmn/', '');
    guardar(nombre.replace(/\.bpmn$/, '.zip'), crearZip([{ nombre, texto: actual.xml }, { nombre: 'LEEME.txt', texto: LEEME }]));
  });
  document.getElementById('descargar-todo').addEventListener('click', () => {
    const archivos = procesos.map((p) => ({ nombre: p.archivo.replace('bpmn/', ''), texto: p.xml }));
    guardar('procesos-aether-bpmn.zip', crearZip([...archivos, { nombre: 'LEEME.txt', texto: LEEME }]));
  });
  if (local) mostrarDescargas();
  else {
    Promise.resolve(window.claude?.use?.('downloads')).then((d) => {
      descargas = d ?? null;
      if (descargas) mostrarDescargas();
    }, () => {});
  }

  // ── Navegación por el ancla ──
  const vistas = ['v-mapa', 'v-puesta', 'v-brechas', 'v-proceso'];
  function mostrar(id) {
    for (const v of vistas) document.getElementById(v).hidden = v !== id;
  }
  function ir() {
    const h = location.hash.slice(1);
    if (porId.has(h)) {
      mostrar('v-proceso');
      vistaProceso(porId.get(h));
    } else if (h === 'puesta') {
      mostrar('v-puesta');
    } else if (h === 'brechas') {
      mostrar('v-brechas');
    } else {
      mostrar('v-mapa');
    }
    marcarActual();
  }
  window.addEventListener('hashchange', () => {
    ir();
    if (angosto.matches) document.querySelector('.indice').open = false;
    window.scrollTo(0, 0);
  });

  vistaMapa();
  vistaPuesta();
  vistaBrechas();
  pintarIndice();
  if (angosto.matches) document.querySelector('.indice').open = false;
  ir();
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Página del visor. documento: true = HTML completo (archivo local); false = fragmento para publicar como Artifact. */
export function paginaVisor(datos, { documento }) {
  const total = datos.procesos.length;
  const elementos = datos.procesos.reduce((s, p) => s + p.tamano.nodos, 0);
  const json = JSON.stringify(datos).replace(/</g, '\\u003c');
  const leyenda = LEYENDA.map(([svg, texto]) => `<div><svg width="54" height="42" viewBox="0 0 54 42" aria-hidden="true">${svg}</svg><span>${esc(texto)}</span></div>`).join('');
  const cuerpo = `
<header class="banda"><div class="banda-int">
  <div><p class="eyebrow">Aether ERP · Supersuite</p><h1>Modelo de procesos</h1>
  <p class="sub">Diagramas BPMN 2.0 sacados del código: cómo llega, se da de alta, se pone en marcha y opera una empresa en Aether, y cómo la monitorea, la cobra y la administra la Supersuite.</p></div>
  <div class="cifras"><span><b>${total}</b>procesos</span><span><b>${elementos}</b>elementos</span><span><b>${datos.brechas.length}</b>brechas</span>
    <button id="descargar-todo" class="boton-banda" type="button" hidden>Descargar los ${total} BPMN (.zip)</button></div>
</div></header>
<div class="marco">
  <details class="indice" open><summary>Índice de procesos</summary>
    <label for="buscar" class="etiqueta">Buscar proceso</label>
    <input id="buscar" type="search" placeholder="Código, nombre o módulo" autocomplete="off">
    <nav class="grupo" aria-label="Vista general"><h2>Vista general</h2>
      <a href="#mapa">Mapa de procesos</a><a href="#puesta">Puesta en marcha</a><a href="#brechas">Brechas encontradas<span class="cuenta">${datos.brechas.length}</span></a></nav>
    <div id="lista"></div>
  </details>
  <main>
    <section id="v-mapa" class="vista"></section>
    <section id="v-puesta" class="vista" hidden></section>
    <section id="v-brechas" class="vista" hidden></section>
    <section id="v-proceso" class="vista" hidden>
      <div id="p-cabeza" class="vista"></div>
      <div class="lamina">
        <div class="barra">
          <button id="ajustar" type="button">Ajustar</button><button id="alejar" type="button" aria-label="Alejar">−</button><button id="acercar" type="button" aria-label="Acercar">+</button>
          <button id="copiar" type="button">Copiar BPMN</button><button id="descargar" type="button" hidden>Descargar este BPMN (.zip)</button>
          <span class="ayuda">Arrastra para moverte · Ctrl + rueda para acercar · «Ajustar» muestra todo · Clic en un elemento para ver su detalle</span>
        </div>
        <div id="lienzo"></div>
        <div id="detalle" class="detalle" aria-live="polite"></div>
      </div>
      <div id="p-ficha" class="vista"></div>
    </section>
  </main>
</div>
<template id="leyenda">${leyenda}</template>
<script type="application/json" id="datos">${json}</script>
<script src="${BPMN_JS}"></script>
<script>${crearZip.toString()}\n(${cliente.toString()})();</script>`;
  const cabeza = `<title>Modelo de procesos Aether</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FUENTES}">
<style>${CSS}</style>`;
  if (!documento) return `${cabeza}\n${cuerpo}\n`;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${cabeza}
</head>
<body>
${cuerpo}
</body>
</html>
`;
}
