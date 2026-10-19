// Convierte la definición de un proceso (datos simples) en BPMN 2.0 XML con su
// diagrama (BPMNDI): piscinas, carriles, posiciones y conectores ortogonales.
// Sin dependencias: corre con `node docs/procesos/generador/generar.mjs`.
//
// Formato de un proceso (ver procesos/*.mjs):
//   pools:    [{ id, nombre, externo?: true, tono?: 'aether'|'supersuite'|'externo', lanes?: [[id, nombre, filas?]] }]
//   nodos:    [[id, tipo, carril, columna, nombre, { f?: fila, doc?, cron?, dur? }]]
//   flujos:   [[desde, hasta, etiqueta?, { via?: 'arriba'|'abajo', carril?: [carril, fila], codo?: 'origen'|'destino' }]]
//   mensajes: [[desde, hasta, etiqueta?]]   (desde/hasta: id de nodo o de piscina)
//   notas:    [[id, carril, columna, fila, texto, nodoAsociado?]]

const TAREA = { w: 132, h: 84 };
const EVENTO = 36;
const COMPUERTA = 50;
const COL = 178;
const FILA = 132;
const CAB_POOL = 30;
const CAB_CARRIL = 30;
const MARGEN = 24;
const SEPARACION_POOLS = 56;
const ALTO_EXTERNO = 72;
const X0 = 20;
const Y0 = 20;

export const TIPOS = {
  inicio: { el: 'startEvent', forma: 'evento', grupo: 'inicio' },
  'inicio-msg': { el: 'startEvent', def: 'message', forma: 'evento', grupo: 'inicio' },
  'inicio-timer': { el: 'startEvent', def: 'timer', forma: 'evento', grupo: 'inicio' },
  'inicio-senal': { el: 'startEvent', def: 'signal', forma: 'evento', grupo: 'inicio' },
  'inicio-cond': { el: 'startEvent', def: 'conditional', forma: 'evento', grupo: 'inicio' },
  fin: { el: 'endEvent', forma: 'evento', grupo: 'fin' },
  'fin-msg': { el: 'endEvent', def: 'message', forma: 'evento', grupo: 'fin' },
  'fin-terminar': { el: 'endEvent', def: 'terminate', forma: 'evento', grupo: 'fin' },
  'fin-error': { el: 'endEvent', def: 'error', forma: 'evento', grupo: 'fin' },
  'msg-recibir': { el: 'intermediateCatchEvent', def: 'message', forma: 'evento', grupo: 'intermedio' },
  'msg-enviar': { el: 'intermediateThrowEvent', def: 'message', forma: 'evento', grupo: 'intermedio' },
  timer: { el: 'intermediateCatchEvent', def: 'timer', forma: 'evento', grupo: 'intermedio' },
  'senal-enviar': { el: 'intermediateThrowEvent', def: 'signal', forma: 'evento', grupo: 'intermedio' },
  usuario: { el: 'userTask', forma: 'tarea', grupo: 'persona' },
  manual: { el: 'manualTask', forma: 'tarea', grupo: 'persona' },
  servicio: { el: 'serviceTask', forma: 'tarea', grupo: 'sistema' },
  script: { el: 'scriptTask', forma: 'tarea', grupo: 'sistema' },
  regla: { el: 'businessRuleTask', forma: 'tarea', grupo: 'sistema' },
  enviar: { el: 'sendTask', forma: 'tarea', grupo: 'mensaje' },
  recibir: { el: 'receiveTask', forma: 'tarea', grupo: 'mensaje' },
  tarea: { el: 'task', forma: 'tarea', grupo: 'persona' },
  sub: { el: 'subProcess', forma: 'tarea', grupo: 'sub' },
  xor: { el: 'exclusiveGateway', forma: 'compuerta', grupo: 'compuerta' },
  and: { el: 'parallelGateway', forma: 'compuerta', grupo: 'compuerta' },
  or: { el: 'inclusiveGateway', forma: 'compuerta', grupo: 'compuerta' },
  evento: { el: 'eventBasedGateway', forma: 'compuerta', grupo: 'compuerta' },
};

// Colores (BPMN in Color): Bizagi y otros modeladores los ignoran sin problema.
const COLORES = {
  inicio: ['#2e7d32', '#e3f3e5'],
  fin: ['#b3261e', '#fbe7e5'],
  intermedio: ['#9a5b00', '#fff4dc'],
  compuerta: ['#8a6a00', '#fff1bf'],
  persona: ['#1d4f91', '#e6eefb'],
  sistema: ['#3d4f5c', '#edf1f4'],
  mensaje: ['#5b3a9e', '#efe9fa'],
  sub: ['#7a5c12', '#faf1d9'],
};
const TONOS = {
  aether: ['#6b5a24', '#fdfbf4'],
  supersuite: ['#284a7e', '#f5f8fd'],
  externo: ['#5f6368', '#f6f6f6'],
};

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r = (n) => Math.round(n);

function lineas(texto, porLinea) {
  const palabras = String(texto).split(/\s+/);
  let n = 1;
  let largo = 0;
  for (const p of palabras) {
    if (largo && largo + 1 + p.length > porLinea) { n += 1; largo = p.length; } else largo += (largo ? 1 : 0) + p.length;
  }
  return n;
}

/** Valida la definición y calcula posiciones. Lanza con un mensaje claro si algo no cuadra. */
export function maquetar(proc) {
  const P = proc.id;
  const errores = [];
  const carriles = new Map();
  const pools = [];
  const nodos = new Map();

  for (const pool of proc.pools) {
    const p = { ...pool, carriles: [] };
    pools.push(p);
    if (pool.externo) continue;
    for (const [id, nombre, filas] of pool.lanes) {
      if (carriles.has(id)) errores.push(`carril repetido: ${id}`);
      const c = { id, nombre, pool: p, filas: filas ?? 1 };
      carriles.set(id, c);
      p.carriles.push(c);
    }
  }

  for (const [id, tipo, carril, col, nombre, op = {}] of proc.nodos) {
    if (nodos.has(id)) errores.push(`nodo repetido: ${id}`);
    if (!TIPOS[tipo]) errores.push(`tipo desconocido en ${id}: ${tipo}`);
    const c = carriles.get(carril);
    if (!c) { errores.push(`carril inexistente en ${id}: ${carril}`); continue; }
    const fila = op.f ?? 0;
    c.filas = Math.max(c.filas, fila + 1);
    nodos.set(id, { id, tipo, def: TIPOS[tipo], carril: c, col, fila, nombre, op, entra: [], sale: [] });
  }
  for (const [, carril, , fila] of proc.notas ?? []) {
    const c = carriles.get(carril);
    if (!c) errores.push(`nota en carril inexistente: ${carril}`);
    else c.filas = Math.max(c.filas, fila + 1);
  }
  for (const [, , , op] of proc.flujos) {
    if (op?.carril) {
      const c = carriles.get(op.carril[0]);
      if (c) c.filas = Math.max(c.filas, op.carril[1] + 1);
    }
  }

  const maxCol = Math.max(...[...nodos.values()].map((n) => n.col), ...(proc.notas ?? []).map((n) => n[2]));
  const anchoContenido = (maxCol + 1) * COL;
  const anchoPool = CAB_POOL + CAB_CARRIL + MARGEN + anchoContenido + MARGEN;
  let y = Y0;
  for (const p of pools) {
    p.x = X0;
    p.y = y;
    p.w = anchoPool;
    if (p.externo) {
      p.h = ALTO_EXTERNO;
    } else {
      let yc = y;
      for (const c of p.carriles) {
        c.x = X0 + CAB_POOL;
        c.y = yc;
        c.w = anchoPool - CAB_POOL;
        c.h = c.filas * FILA;
        yc += c.h;
      }
      p.h = yc - y;
    }
    y += p.h + SEPARACION_POOLS;
  }
  const alto = y - SEPARACION_POOLS + Y0;

  const centroX = (col) => X0 + CAB_POOL + CAB_CARRIL + MARGEN + col * COL + COL / 2;
  const centroY = (c, fila) => c.y + fila * FILA + FILA / 2;
  for (const n of nodos.values()) {
    const [w, h] = n.def.forma === 'tarea' ? [TAREA.w, TAREA.h] : n.def.forma === 'evento' ? [EVENTO, EVENTO] : [COMPUERTA, COMPUERTA];
    n.cx = centroX(n.col);
    n.cy = centroY(n.carril, n.fila);
    n.w = w; n.h = h;
    n.x = n.cx - w / 2; n.y = n.cy - h / 2;
    n.pool = n.carril.pool;
    n.filaY0 = n.carril.y + n.fila * FILA;
    n.filaY1 = n.filaY0 + FILA;
  }

  const flujos = proc.flujos.map(([desde, hasta, etiqueta, op = {}], i) => {
    const s = nodos.get(desde);
    const t = nodos.get(hasta);
    if (!s || !t) { errores.push(`flujo con nodo inexistente: ${desde} → ${hasta}`); return null; }
    if (s.pool !== t.pool) errores.push(`flujo de secuencia cruza piscinas: ${desde} → ${hasta} (usa un mensaje)`);
    const f = { id: `${P}_flujo_${i + 1}`, s, t, etiqueta, op };
    s.sale.push(f); t.entra.push(f);
    return f;
  }).filter(Boolean);

  const poolDe = (ref) => nodos.get(ref)?.pool ?? pools.find((p) => p.id === ref);
  const mensajes = (proc.mensajes ?? []).map(([desde, hasta, etiqueta], i) => {
    const ps = poolDe(desde);
    const pt = poolDe(hasta);
    if (!ps || !pt) { errores.push(`mensaje con extremo inexistente: ${desde} → ${hasta}`); return null; }
    if (ps === pt) errores.push(`mensaje dentro de la misma piscina: ${desde} → ${hasta}`);
    for (const ref of [desde, hasta]) {
      const n = nodos.get(ref);
      if (n && n.def.forma === 'compuerta') errores.push(`un mensaje no puede tocar una compuerta: ${ref}`);
    }
    return { id: `${P}_mensaje_${i + 1}`, desde, hasta, s: nodos.get(desde), t: nodos.get(hasta), ps, pt, etiqueta };
  }).filter(Boolean);

  for (const n of nodos.values()) {
    if (n.def.grupo !== 'inicio' && n.entra.length === 0) errores.push(`nodo sin entrada: ${n.id}`);
    if (n.def.grupo !== 'fin' && n.sale.length === 0) errores.push(`nodo sin salida: ${n.id}`);
    if (n.tipo === 'evento') {
      for (const f of n.sale) if (!['msg-recibir', 'timer', 'recibir'].includes(f.t.tipo)) errores.push(`tras la compuerta de eventos ${n.id} debe ir un evento de espera, no ${f.t.id}`);
    }
  }
  if (errores.length) throw new Error(`${P}: ${errores.join('; ')}`);

  for (const f of flujos) f.puntos = rutear(f, carriles);
  for (const m of mensajes) m.puntos = rutearMensaje(m);
  const notas = (proc.notas ?? []).map(([id, carril, col, fila, texto, asociado]) => {
    const c = carriles.get(carril);
    const w = 168;
    const h = Math.min(120, Math.max(36, lineas(texto, 26) * 15 + 10));
    const cx = centroX(col);
    const cy = centroY(c, fila);
    const nota = { id: `${P}_nota_${id}`, carril: c, texto, x: cx - w / 2, y: cy - h / 2, w, h };
    if (asociado) {
      const n = nodos.get(asociado);
      if (!n) throw new Error(`${P}: nota asociada a nodo inexistente ${asociado}`);
      nota.asoc = { id: `${P}_asoc_${id}`, n, puntos: puntosAsociacion(nota, n) };
    }
    return nota;
  });

  return { P, pools, carriles: [...carriles.values()], nodos: [...nodos.values()], flujos, mensajes, notas, ancho: anchoPool + X0 * 2, alto };
}

const der = (n) => [n.x + n.w, n.cy];
const izq = (n) => [n.x, n.cy];
const arr = (n) => [n.cx, n.y];
const aba = (n) => [n.cx, n.y + n.h];

function rutear(f, carriles) {
  const { s, t, op } = f;
  const dy = t.cy - s.cy;
  const dx = t.cx - s.cx;
  if (op.carril) {
    const c = carriles.get(op.carril[0]);
    const y = c.y + op.carril[1] * FILA + FILA / 2;
    const sal = y > s.cy ? aba(s) : arr(s);
    const ent = y > t.cy ? aba(t) : arr(t);
    return [sal, [s.cx, y], [t.cx, y], ent];
  }
  // Los retornos corren por el borde de la fila, lejos de las tareas y sus etiquetas.
  if (op.via === 'abajo' || (Math.abs(dy) < 1 && dx < 0 && op.via !== 'arriba')) {
    const y = Math.max(s.filaY1, t.filaY1) - 10;
    return [aba(s), [s.cx, y], [t.cx, y], aba(t)];
  }
  if (op.via === 'arriba') {
    const y = Math.min(s.filaY0, t.filaY0) + 10;
    return [arr(s), [s.cx, y], [t.cx, y], arr(t)];
  }
  if (Math.abs(dy) < 1) return [der(s), izq(t)];
  if (Math.abs(dx) < 1) return dy > 0 ? [aba(s), arr(t)] : [arr(s), aba(t)];
  if (dx < 0) {
    // Retroceso entre filas: sale por arriba/abajo y entra por el costado derecho.
    return [dy > 0 ? aba(s) : arr(s), [s.cx, t.cy], der(t)];
  }
  const sCompuerta = s.def.forma === 'compuerta';
  const tCompuerta = t.def.forma === 'compuerta';
  if ((sCompuerta && op.codo !== 'destino') || op.codo === 'origen') {
    return [dy > 0 ? aba(s) : arr(s), [s.cx, t.cy], izq(t)];
  }
  if (tCompuerta || op.codo === 'destino') {
    return [der(s), [t.cx, s.cy], dy > 0 ? arr(t) : aba(t)];
  }
  // Desde un evento el codo va junto al destino, para no cruzar la etiqueta del evento.
  const holgura = Math.min(28, (t.x - (s.x + s.w)) / 2);
  const mx = s.def.forma === 'evento' ? t.x - holgura : s.x + s.w + holgura;
  return [der(s), [mx, s.cy], [mx, t.cy], izq(t)];
}

function rutearMensaje(m) {
  const yMedio = (a, b) => (a.y + a.h <= b.y ? (a.y + a.h + b.y) / 2 : (b.y + b.h + a.y) / 2);
  const abajoDe = m.ps.y < m.pt.y;
  const x1 = m.s ? m.s.cx : m.t ? m.t.cx : m.ps.x + m.ps.w / 2;
  const x2 = m.t ? m.t.cx : x1;
  const y1 = m.s ? (abajoDe ? m.s.y + m.s.h : m.s.y) : abajoDe ? m.ps.y + m.ps.h : m.ps.y;
  const y2 = m.t ? (abajoDe ? m.t.y : m.t.y + m.t.h) : abajoDe ? m.pt.y : m.pt.y + m.pt.h;
  const xs = m.s ? x1 : x2;
  if (Math.abs(xs - x2) < 1) return [[xs, y1], [x2, y2]];
  const ym = yMedio(m.ps, m.pt);
  return [[xs, y1], [xs, ym], [x2, ym], [x2, y2]];
}

function puntosAsociacion(nota, n) {
  const ax = nota.x + nota.w / 2;
  if (n.y > nota.y + nota.h) return [[ax, nota.y + nota.h], [n.cx, n.y]];
  if (n.y + n.h < nota.y) return [[ax, nota.y], [n.cx, n.y + n.h]];
  return n.cx > ax ? [[nota.x + nota.w, nota.y + nota.h / 2], [n.x, n.cy]] : [[nota.x, nota.y + nota.h / 2], [n.x + n.w, n.cy]];
}

// La etiqueta va debajo del evento, salvo que algún conector entre o salga por abajo.
function etiquetaEvento(n, m) {
  const h = lineas(n.nombre, 18) * 14;
  const abajo = n.y + n.h;
  const tocaAbajo = (pts) => pts.some(([x, y]) => Math.abs(x - n.cx) < 1 && Math.abs(y - abajo) < 1);
  const usada = [...m.flujos.filter((f) => f.s === n || f.t === n), ...m.mensajes.filter((x) => x.s === n || x.t === n)].some((c) => tocaAbajo(c.puntos));
  return usada ? { x: n.cx - 60, y: n.y - 6 - h, w: 120, h } : { x: n.cx - 60, y: abajo + 6, w: 120, h };
}

function etiquetaCompuerta(n, flujos) {
  const h = lineas(n.nombre, 20) * 14;
  const usaArriba = flujos.some((f) => (f.s === n && f.puntos[0][1] < n.cy - 1) || (f.t === n && f.puntos.at(-1)[1] < n.cy - 1));
  // Si un conector usa el vértice de arriba, la etiqueta se corre a la derecha de esa línea.
  return usaArriba ? { x: n.cx + 8, y: n.y - 6 - h, w: 128, h } : { x: n.cx - 64, y: n.y - 6 - h, w: 128, h };
}

function etiquetaFlujo(f) {
  const [a, b] = f.puntos;
  const vertical = Math.abs(a[0] - b[0]) < 1;
  const w = Math.max(30, f.etiqueta.length * 6.4);
  // Tramo vertical: hacia abajo la etiqueta va junto al origen; hacia arriba, junto al codo (lejos de la etiqueta de la compuerta).
  if (vertical) return b[1] > a[1] ? { x: a[0] + 6, y: a[1] + 8, w, h: 16 } : { x: a[0] + 6, y: b[1] + 6, w, h: 16 };
  return { x: a[0] + 6, y: a[1] - 20, w, h: 16 };
}

const bounds = (b) => `<dc:Bounds x="${r(b.x)}" y="${r(b.y)}" width="${r(b.w)}" height="${r(b.h)}" />`;
const color = ([stroke, fill]) => ` bioc:stroke="${stroke}" bioc:fill="${fill}" color:border-color="${stroke}" color:background-color="${fill}"`;
const doc = (texto, sangria) => (texto ? `${sangria}<bpmn:documentation>${esc(texto)}</bpmn:documentation>\n` : '');

function definicionEvento(n) {
  const d = n.def.def;
  if (!d) return '';
  if (d === 'timer') {
    if (n.op.cron) return `<bpmn:timerEventDefinition><bpmn:timeCycle xsi:type="bpmn:tFormalExpression">${esc(n.op.cron)}</bpmn:timeCycle></bpmn:timerEventDefinition>`;
    if (n.op.dur) return `<bpmn:timerEventDefinition><bpmn:timeDuration xsi:type="bpmn:tFormalExpression">${esc(n.op.dur)}</bpmn:timeDuration></bpmn:timerEventDefinition>`;
    return '<bpmn:timerEventDefinition />';
  }
  if (d === 'conditional') return `<bpmn:conditionalEventDefinition><bpmn:condition xsi:type="bpmn:tFormalExpression">${esc(n.op.cond ?? '')}</bpmn:condition></bpmn:conditionalEventDefinition>`;
  return `<bpmn:${d}EventDefinition />`;
}

/** Copia de una maqueta corrida dy hacia abajo (para poner varios procesos en un mismo lienzo). */
export function desplazar(m, dy) {
  const c = structuredClone(m);
  const mover = (pts) => pts.forEach((p) => { p[1] += dy; });
  for (const p of c.pools) p.y += dy;
  for (const l of c.carriles) l.y += dy;
  for (const n of c.nodos) { n.y += dy; n.cy += dy; n.filaY0 += dy; n.filaY1 += dy; }
  for (const f of c.flujos) mover(f.puntos);
  for (const msg of c.mensajes) mover(msg.puntos);
  for (const nota of c.notas) { nota.y += dy; if (nota.asoc) mover(nota.asoc.puntos); }
  return c;
}

/** Procesos uno debajo del otro, cada uno con su título encima: lo que muestran los archivos "todo en uno". */
export function apilar(procesos) {
  const ALTO_TITULO = 64;
  const SEPARACION = 110;
  let cursor = 20;
  return procesos.map((proc) => {
    const base = maquetar(proc);
    const titulo = { x: 20, y: cursor, w: Math.min(1400, Math.max(700, base.ancho - 40)), h: 48 };
    const m = desplazar(base, cursor + ALTO_TITULO - 20);
    cursor += ALTO_TITULO + base.alto - 20 + SEPARACION;
    return { proc, m, titulo, alto: cursor };
  });
}

const CABECERA = '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bioc="http://bpmn.io/schema/bpmn/biocolor/1.0" xmlns:color="http://www.omg.org/spec/BPMN/non-normative/color/1.0"';

/** Las piezas XML de un proceso ya maquetado: participantes, mensajes, procesos y diagrama. */
function piezas(proc, m, { prefijoNombre = '' } = {}) {
  const { P } = m;
  const idPool = (p) => `${P}_pool_${p.id}`;
  const idProc = (p) => `${P}_proc_${p.id}`;
  const idNodo = (n) => `${P}_${n.id}`;
  const colab = [];
  const procesos = [];
  const formas = [];
  const aristas = [];
  for (const p of m.pools) {
    colab.push(`    <bpmn:participant id="${idPool(p)}" name="${esc(prefijoNombre + p.nombre)}"${p.externo ? '' : ` processRef="${idProc(p)}"`}>${p.doc ? `\n${doc(p.doc, '      ')}    ` : ''}</bpmn:participant>`);
  }
  for (const msg of m.mensajes) {
    const ref = (x, n) => (n ? idNodo(n) : `${P}_pool_${x}`);
    colab.push(`    <bpmn:messageFlow id="${msg.id}"${msg.etiqueta ? ` name="${esc(msg.etiqueta)}"` : ''} sourceRef="${ref(msg.desde, msg.s)}" targetRef="${ref(msg.hasta, msg.t)}" />`);
  }

  for (const p of m.pools.filter((x) => !x.externo)) {
    const propios = m.nodos.filter((n) => n.pool.id === p.id);
    procesos.push(`  <bpmn:process id="${idProc(p)}" name="${esc(prefijoNombre + p.nombre)}" isExecutable="false">`);
    procesos.push(`    <bpmn:laneSet id="${P}_carriles_${p.id}">`);
    for (const c of p.carriles) {
      procesos.push(`      <bpmn:lane id="${P}_carril_${c.id}" name="${esc(c.nombre)}">`);
      for (const n of propios.filter((x) => x.carril.id === c.id)) procesos.push(`        <bpmn:flowNodeRef>${idNodo(n)}</bpmn:flowNodeRef>`);
      procesos.push('      </bpmn:lane>');
    }
    procesos.push('    </bpmn:laneSet>');
    for (const n of propios) {
      const attrs = n.def.el === 'subProcess' ? ' triggeredByEvent="false"' : '';
      procesos.push(`    <bpmn:${n.def.el} id="${idNodo(n)}" name="${esc(n.nombre)}"${attrs}>`);
      procesos.push(doc(n.op.doc, '      ').trimEnd());
      for (const f of n.entra) procesos.push(`      <bpmn:incoming>${f.id}</bpmn:incoming>`);
      for (const f of n.sale) procesos.push(`      <bpmn:outgoing>${f.id}</bpmn:outgoing>`);
      const def = definicionEvento(n);
      if (def) procesos.push(`      ${def}`);
      procesos.push(`    </bpmn:${n.def.el}>`);
    }
    for (const f of m.flujos.filter((x) => x.s.pool.id === p.id)) {
      procesos.push(`    <bpmn:sequenceFlow id="${f.id}"${f.etiqueta ? ` name="${esc(f.etiqueta)}"` : ''} sourceRef="${idNodo(f.s)}" targetRef="${idNodo(f.t)}" />`);
    }
    for (const nota of m.notas.filter((x) => x.carril.pool.id === p.id)) {
      procesos.push(`    <bpmn:textAnnotation id="${nota.id}"><bpmn:text>${esc(nota.texto)}</bpmn:text></bpmn:textAnnotation>`);
      if (nota.asoc) procesos.push(`    <bpmn:association id="${nota.asoc.id}" associationDirection="None" sourceRef="${nota.id}" targetRef="${idNodo(nota.asoc.n)}" />`);
    }
    procesos.push('  </bpmn:process>');
  }

  for (const p of m.pools) {
    formas.push(`      <bpmndi:BPMNShape id="${idPool(p)}_di" bpmnElement="${idPool(p)}" isHorizontal="true"${color(TONOS[p.tono ?? (p.externo ? 'externo' : 'aether')])}>${bounds(p)}</bpmndi:BPMNShape>`);
    for (const c of p.carriles) {
      formas.push(`      <bpmndi:BPMNShape id="${P}_carril_${c.id}_di" bpmnElement="${P}_carril_${c.id}" isHorizontal="true"${color(TONOS[p.tono ?? 'aether'])}>${bounds(c)}</bpmndi:BPMNShape>`);
    }
  }
  for (const n of m.nodos) {
    const extra = n.def.el === 'exclusiveGateway' ? ' isMarkerVisible="true"' : n.def.el === 'subProcess' ? ' isExpanded="false"' : '';
    const etiqueta = n.def.forma === 'evento' ? etiquetaEvento(n, m) : n.def.forma === 'compuerta' && n.nombre ? etiquetaCompuerta(n, m.flujos) : null;
    formas.push(`      <bpmndi:BPMNShape id="${idNodo(n)}_di" bpmnElement="${idNodo(n)}"${extra}${color(COLORES[n.def.grupo])}>${bounds(n)}${etiqueta ? `<bpmndi:BPMNLabel>${bounds(etiqueta)}</bpmndi:BPMNLabel>` : ''}</bpmndi:BPMNShape>`);
  }
  for (const nota of m.notas) formas.push(`      <bpmndi:BPMNShape id="${nota.id}_di" bpmnElement="${nota.id}">${bounds(nota)}</bpmndi:BPMNShape>`);
  const wps = (pts) => pts.map(([x, y]) => `<di:waypoint x="${r(x)}" y="${r(y)}" />`).join('');
  for (const f of m.flujos) {
    aristas.push(`      <bpmndi:BPMNEdge id="${f.id}_di" bpmnElement="${f.id}">${wps(f.puntos)}${f.etiqueta ? `<bpmndi:BPMNLabel>${bounds(etiquetaFlujo(f))}</bpmndi:BPMNLabel>` : ''}</bpmndi:BPMNEdge>`);
  }
  for (const msg of m.mensajes) {
    const lb = msg.etiqueta ? etiquetaMensaje(msg) : null;
    aristas.push(`      <bpmndi:BPMNEdge id="${msg.id}_di" bpmnElement="${msg.id}">${wps(msg.puntos)}${lb ? `<bpmndi:BPMNLabel>${bounds(lb)}</bpmndi:BPMNLabel>` : ''}</bpmndi:BPMNEdge>`);
  }
  for (const nota of m.notas.filter((x) => x.asoc)) {
    aristas.push(`      <bpmndi:BPMNEdge id="${nota.asoc.id}_di" bpmnElement="${nota.asoc.id}">${wps(nota.asoc.puntos)}</bpmndi:BPMNEdge>`);
  }
  return { colab, procesos, formas, aristas };
}

/** La etiqueta de un mensaje va en el espacio entre las dos piscinas, donde no hay tareas. */
export function etiquetaMensaje(msg) {
  const [arriba, abajo] = msg.ps.y < msg.pt.y ? [msg.ps, msg.pt] : [msg.pt, msg.ps];
  const yHueco = (arriba.y + arriba.h + abajo.y) / 2;
  const x = Math.min(...msg.puntos.map(([px]) => px));
  return { x: x + 6, y: yHueco - (msg.puntos.length > 2 ? 20 : 8), w: Math.max(40, msg.etiqueta.length * 6.2), h: 16 };
}

function documento(id, nombre, docColab, partes, extraColab = [], extraFormas = []) {
  const out = ['<?xml version="1.0" encoding="UTF-8"?>'];
  out.push(`${CABECERA} id="${id}_definiciones" targetNamespace="https://aetherp.online/procesos" exporter="Aether · generador de procesos" exporterVersion="1.0">`);
  out.push(`  <bpmn:collaboration id="${id}_colaboracion">`);
  out.push(doc(docColab, '    ').trimEnd());
  for (const p of partes) out.push(...p.colab);
  out.push(...extraColab);
  out.push('  </bpmn:collaboration>');
  for (const p of partes) out.push(...p.procesos);
  out.push(`  <bpmndi:BPMNDiagram id="${id}_diagrama" name="${esc(nombre)}">`);
  out.push(`    <bpmndi:BPMNPlane id="${id}_plano" bpmnElement="${id}_colaboracion">`);
  for (const p of partes) out.push(...p.formas);
  out.push(...extraFormas);
  for (const p of partes) out.push(...p.aristas);
  out.push('    </bpmndi:BPMNPlane>');
  out.push('  </bpmndi:BPMNDiagram>');
  out.push('</bpmn:definitions>');
  return `${out.filter((l) => l !== '').join('\n')}\n`;
}

/** BPMN 2.0 de un proceso (colaboración + procesos + diagrama). */
export function aXml(proc) {
  const m = maquetar(proc);
  const xml = documento(m.P, `${proc.id} ${proc.nombre}`, `${proc.id} ${proc.nombre}. ${proc.resumen}`, [piezas(proc, m)]);
  return { xml, maqueta: m };
}

/** Un solo BPMN con todos los procesos en un mismo diagrama, apilados y con su título. */
export function aXmlCompleto(procesos, { nombre, descripcion }) {
  const bloques = apilar(procesos);
  const partes = bloques.map((b) => piezas(b.proc, b.m, { prefijoNombre: `${b.proc.id} · ` }));
  const titulos = bloques.map((b) => `    <bpmn:textAnnotation id="${b.proc.id}_titulo"><bpmn:text>${esc(`${b.proc.id} · ${b.proc.nombre}. ${b.proc.resumen}`)}</bpmn:text></bpmn:textAnnotation>`);
  const formas = bloques.map((b) => `      <bpmndi:BPMNShape id="${b.proc.id}_titulo_di" bpmnElement="${b.proc.id}_titulo">${bounds(b.titulo)}</bpmndi:BPMNShape>`);
  return documento('Aether', nombre, descripcion, partes, titulos, formas);
}
