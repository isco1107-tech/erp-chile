// XPDL 2.2 para importar en Bizagi Modeler (pestaña Exportar/Importar → XPDL).
//
// Sigue las convenciones con que Bizagi escribe XPDL al exportar (piscina
// principal oculta, ids GUID, carriles relativos a su piscina con 50 px de
// cabecera, colores ARGB con signo y sus colores por defecto) y además es
// válido contra el esquema oficial de la WfMC (bpmnxpdl_40a.xsd): mismo orden
// de elementos, referencias que existen y subprocesos contenidos en el archivo.
// Coordenadas: piscinas y actividades absolutas (esquina superior izquierda).

import { createHash } from 'node:crypto';
import { organizar } from './bpmn.mjs';

const HERRAMIENTA = 'BizAgi_Process_Modeler';
const NEGRO = -16777216;
const BLANCO = -1;
// Colores por defecto de Bizagi (tomados de sus propias exportaciones).
const COLOR = {
  tarea: [-16553830, -1249281],
  inicio: [-10311914, -1638505],
  fin: [-6750208, -1135958],
  intermedio: [-6909623, -66833],
  compuerta: [-5855715, -52],
  pool: [NEGRO, BLANCO],
  carril: [-11513776, BLANCO],
  nota: [-2763307, -2763307],
};
const CABECERA_CARRIL = 50;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
const num = (n) => String(Math.round(n));

/** GUID estable a partir de un id legible (y del archivo), así el mismo modelo da siempre los mismos ids. */
export function guid(texto) {
  const h = createHash('sha1').update(`aether-procesos:${texto}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const grafico = (x, y, w, h, [borde, relleno]) => [
  '<NodeGraphicsInfos>',
  `  <NodeGraphicsInfo ToolId="${HERRAMIENTA}" Height="${num(h)}" Width="${num(w)}" BorderColor="${borde}" FillColor="${relleno}">`,
  `    <Coordinates XCoordinate="${num(x)}" YCoordinate="${num(y)}" />`,
  '  </NodeGraphicsInfo>',
  '</NodeGraphicsInfos>',
];

const conector = (puntos) => [
  '<ConnectorGraphicsInfos>',
  `  <ConnectorGraphicsInfo ToolId="${HERRAMIENTA}" BorderColor="${NEGRO}">`,
  ...puntos.map(([x, y]) => `    <Coordinates XCoordinate="${num(x)}" YCoordinate="${num(y)}" />`),
  '  </ConnectorGraphicsInfo>',
  '</ConnectorGraphicsInfos>',
];

const mensaje = (g, catchThrow) => [`<TriggerResultMessage CatchThrow="${catchThrow}">`, `  <Message Id="${g}" />`, '</TriggerResultMessage>'];
const sangrar = (n, lineas) => lineas.map((l) => ' '.repeat(n) + l);
// El esquema exige el momento del temporizador: la expresión cron, la duración o, si no hay, el nombre del evento.
const temporizador = (n) => ['<TriggerTimer>', `  <TimeCycle>${esc(n.op.cron ?? n.op.dur ?? n.nombre)}</TimeCycle>`, '</TriggerTimer>'];

/** El cuerpo de la actividad según su tipo: evento, compuerta, tarea o subproceso. */
function cuerpo(n, gid, subproceso) {
  const g = gid(n);
  const evento = (inner) => ['<Event>', ...sangrar(2, inner), '</Event>'];
  switch (n.tipo) {
    case 'inicio': return evento(['<StartEvent Trigger="None" />']);
    case 'inicio-msg': return evento(['<StartEvent Trigger="Message">', ...sangrar(2, mensaje(`${g}-m`, 'CATCH')), '</StartEvent>']);
    case 'inicio-timer': return evento(['<StartEvent Trigger="Timer">', ...sangrar(2, temporizador(n)), '</StartEvent>']);
    case 'inicio-senal': return evento(['<StartEvent Trigger="Signal">', '  <TriggerResultSignal CatchThrow="CATCH" />', '</StartEvent>']);
    case 'inicio-cond': return evento(['<StartEvent Trigger="Conditional">', '  <TriggerConditional />', '</StartEvent>']);
    case 'fin': return evento(['<EndEvent Result="None" />']);
    case 'fin-msg': return evento(['<EndEvent Result="Message">', ...sangrar(2, mensaje(`${g}-m`, 'THROW')), '</EndEvent>']);
    case 'fin-terminar': return evento(['<EndEvent Result="Terminate" />']);
    case 'fin-error': return evento(['<EndEvent Result="Error">', '  <ResultError ErrorCode="ERROR" />', '</EndEvent>']);
    case 'msg-recibir': return evento(['<IntermediateEvent Trigger="Message">', ...sangrar(2, mensaje(`${g}-m`, 'CATCH')), '</IntermediateEvent>']);
    case 'msg-enviar': return evento(['<IntermediateEvent Trigger="Message">', ...sangrar(2, mensaje(`${g}-m`, 'THROW')), '</IntermediateEvent>']);
    case 'timer': return evento(['<IntermediateEvent Trigger="Timer">', ...sangrar(2, temporizador(n)), '</IntermediateEvent>']);
    case 'senal-enviar': return evento(['<IntermediateEvent Trigger="Signal">', '  <TriggerResultSignal CatchThrow="THROW" />', '</IntermediateEvent>']);
    case 'xor': return ['<Route />'];
    case 'and': return ['<Route GatewayType="Parallel" />'];
    case 'or': return ['<Route GatewayType="Inclusive" />'];
    case 'evento': return ['<Route ExclusiveType="Event" />'];
    // Subproceso contraído y contenido en el archivo (el diagrama completo está en el proceso Pxx que nombra).
    case 'sub': return [`<BlockActivity ActivitySetId="${subproceso(n)}" View="COLLAPSED" />`];
    default: {
      const tarea = {
        usuario: '<TaskUser Implementation="Unspecified" />',
        manual: '<TaskManual />',
        servicio: '<TaskService />',
        regla: '<TaskService />',
        script: '<TaskScript />',
        enviar: '<TaskSend />',
        recibir: '<TaskReceive Instantiate="false" />',
      }[n.tipo];
      return tarea ? ['<Implementation>', '  <Task>', `    ${tarea}`, '  </Task>', '</Implementation>'] : ['<Implementation>', '  <Task />', '</Implementation>'];
    }
  }
}

function colorDe(n) {
  if (n.def.forma === 'tarea') return COLOR.tarea;
  if (n.def.forma === 'compuerta') return COLOR.compuerta;
  return COLOR[n.def.grupo] ?? COLOR.intermedio;
}

/**
 * Paquete XPDL 2.2 con los procesos dados en un solo diagrama (una columna por
 * área, cada proceso con su título). `alcance` separa los ids de cada archivo.
 */
export function xpdl(procesos, { nombre, descripcion, fecha, areas, alcance }) {
  const { bloques, encabezados } = organizar(procesos, areas);
  const G = (texto) => guid(`${alcance}:${texto}`);
  const idPool = (P, p) => G(`${P}_pool_${p.id}`);
  const idProc = (P, p) => G(`${P}_proc_${p.id}`);
  const gidDe = (P) => (n) => G(`${P}_${n.id}`);
  const principal = { pool: G('principal_pool'), proc: G('principal_proc') };

  const L = [];
  const add = (n, lineas) => L.push(...sangrar(n, lineas));
  L.push('<?xml version="1.0" encoding="utf-8"?>');
  L.push(`<Package xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" Id="${G('paquete')}" Name="${esc(nombre)}" xmlns="http://www.wfmc.org/2009/XPDL2.2">`);
  add(2, ['<PackageHeader>', '  <XPDLVersion>2.2</XPDLVersion>', '  <Vendor>Aether · generador de procesos</Vendor>', `  <Created>${fecha}</Created>`, `  <ModificationDate>${fecha}</ModificationDate>`, `  <Description>${esc(descripcion)}</Description>`, '</PackageHeader>']);
  add(2, ['<RedefinableHeader>', '  <Author>Aether</Author>', '  <Version>1.0</Version>', '  <Countrykey>CL</Countrykey>', '</RedefinableHeader>']);

  // ── Piscinas (la principal, oculta, como en toda exportación de Bizagi) ──
  L.push('  <Pools>');
  add(4, [`<Pool Id="${principal.pool}" Name="Main Process" Process="${principal.proc}" BoundaryVisible="false">`, '  <Lanes />', ...sangrar(2, grafico(30, 30, 700, 350, COLOR.pool)), '</Pool>']);
  for (const { proc, m } of bloques) {
    for (const p of m.pools) {
      L.push(`    <Pool Id="${idPool(m.P, p)}" Name="${esc(`${proc.id} · ${p.nombre}`)}" Process="${idProc(m.P, p)}" BoundaryVisible="true">`);
      L.push('      <Lanes>');
      // Una piscina externa lleva un solo carril sin nombre: así se ve como piscina de caja negra.
      const carriles = p.externo ? [{ id: 'externo', nombre: '', y: p.y, h: p.h }] : p.carriles;
      for (const c of carriles) {
        add(8, [`<Lane Id="${G(`${m.P}_carril_${p.id}_${c.id}`)}" Name="${esc(c.nombre)}" ParentPool="${idPool(m.P, p)}">`, ...sangrar(2, grafico(CABECERA_CARRIL, c.y - p.y, p.w - CABECERA_CARRIL, c.h, COLOR.carril)), '</Lane>']);
      }
      L.push('      </Lanes>');
      add(6, grafico(p.x, p.y, p.w, p.h, COLOR.pool));
      L.push('    </Pool>');
    }
  }
  L.push('  </Pools>');

  // ── Mensajes entre piscinas ──
  const mensajes = bloques.flatMap(({ m }) => m.mensajes.map((msg) => ({ m, msg })));
  if (mensajes.length) {
    L.push('  <MessageFlows>');
    for (const { m, msg } of mensajes) {
      const ref = (x, n) => (n ? gidDe(m.P)(n) : idPool(m.P, m.pools.find((p) => p.id === x)));
      add(4, [`<MessageFlow Id="${G(msg.id)}" Name="${esc(msg.etiqueta ?? '')}" Source="${ref(msg.desde, msg.s)}" Target="${ref(msg.hasta, msg.t)}">`, ...sangrar(2, conector(msg.puntos)), '</MessageFlow>']);
    }
    L.push('  </MessageFlows>');
  }

  // ── Notas: encabezado de cada área, título de cada proceso y anotaciones ──
  const asociaciones = bloques.flatMap(({ m }) => m.notas.filter((x) => x.asoc).map((nota) => ({ m, nota })));
  if (asociaciones.length) {
    L.push('  <Associations>');
    for (const { m, nota } of asociaciones) {
      add(4, [`<Association Id="${G(nota.asoc.id)}" Source="${G(nota.id)}" Target="${gidDe(m.P)(nota.asoc.n)}">`, `  <Object Id="${G(`${nota.asoc.id}_objeto`)}" />`, ...sangrar(2, conector(nota.asoc.puntos)), '</Association>']);
    }
    L.push('  </Associations>');
  }
  L.push('  <Artifacts>');
  const anotacion = (id, texto, { x, y, w, h }) => add(4, [`<Artifact Id="${id}" ArtifactType="Annotation" TextAnnotation="${esc(texto)}">`, ...sangrar(2, grafico(x, y, w, h, COLOR.nota)), '</Artifact>']);
  for (const e of encabezados) anotacion(G(e.id), e.texto, e);
  for (const { proc, m, titulo } of bloques) {
    anotacion(G(`${proc.id}_titulo`), `${proc.id} · ${proc.nombre}. ${proc.resumen}`, titulo);
    for (const nota of m.notas) anotacion(G(nota.id), nota.texto, nota);
  }
  L.push('  </Artifacts>');

  // ── Procesos: actividades y transiciones de cada piscina ──
  const cabeceraProceso = (id, nombreProceso, descripcionProceso) => [
    `<WorkflowProcess Id="${id}" Name="${esc(nombreProceso)}">`,
    '  <ProcessHeader>', `    <Created>${fecha}</Created>`, `    <Description>${esc(descripcionProceso)}</Description>`, '  </ProcessHeader>',
    '  <RedefinableHeader>', '    <Author>Aether</Author>', '    <Version>1.0</Version>', '    <Countrykey>CL</Countrykey>', '  </RedefinableHeader>',
  ];
  L.push('  <WorkflowProcesses>');
  add(4, [...cabeceraProceso(principal.proc, 'Main Process', ''), '</WorkflowProcess>']);
  for (const { proc, m } of bloques) {
    const gid = gidDe(m.P);
    for (const p of m.pools) {
      add(4, cabeceraProceso(idProc(m.P, p), `${proc.id} · ${p.nombre}`, p.externo ? `Participante externo de ${proc.id}` : `${proc.nombre}. Objetivo: ${proc.objetivo}`));
      const propios = m.nodos.filter((n) => n.pool.id === p.id);
      const subs = propios.filter((n) => n.tipo === 'sub');
      const subproceso = (n) => G(`${m.P}_${n.id}_conjunto`);
      if (subs.length) {
        add(6, ['<ActivitySets>', ...subs.map((n) => `  <ActivitySet Id="${subproceso(n)}" Name="${esc(n.nombre)}" />`), '</ActivitySets>']);
      }
      if (propios.length) {
        L.push('      <Activities>');
        for (const n of propios) {
          L.push(`        <Activity Id="${gid(n)}" Name="${esc(n.nombre)}">`);
          L.push(n.op.doc ? `          <Description>${esc(n.op.doc)}</Description>` : '          <Description />');
          add(10, cuerpo(n, gid, subproceso));
          L.push('          <Documentation />');
          add(10, grafico(n.x, n.y, n.w, n.h, colorDe(n)));
          L.push('        </Activity>');
        }
        L.push('      </Activities>');
      }
      const flujos = m.flujos.filter((x) => x.s.pool.id === p.id);
      if (flujos.length) {
        L.push('      <Transitions>');
        for (const f of flujos) {
          add(8, [`<Transition Id="${G(f.id)}" From="${gid(f.s)}" To="${gid(f.t)}"${f.etiqueta ? ` Name="${esc(f.etiqueta)}"` : ''}>`, '  <Condition />', '  <Description />', ...sangrar(2, conector(f.puntos)), '</Transition>']);
        }
        L.push('      </Transitions>');
      }
      L.push('    </WorkflowProcess>');
    }
  }
  L.push('  </WorkflowProcesses>');
  L.push('</Package>');
  return `${L.join('\r\n')}\r\n`;
}
