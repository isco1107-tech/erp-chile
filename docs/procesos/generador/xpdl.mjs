// XPDL 2.2 con todos los procesos en un solo diagrama, escrito como lo escribe
// Bizagi Modeler al exportar (mismo orden de elementos, piscina principal
// oculta, ids GUID, colores ARGB con signo y sus colores por defecto), para
// que se abra con «Importar XPDL». Coordenadas: piscinas y actividades
// absolutas (esquina superior izquierda); carriles relativos a su piscina.

import { createHash } from 'node:crypto';
import { apilar } from './bpmn.mjs';

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
const DESPLAZAMIENTO_CARRIL = 50;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
const num = (n) => String(Math.round(n));

/** GUID estable a partir de un id legible: el mismo modelo genera siempre los mismos ids. */
export function guid(texto) {
  const h = createHash('sha1').update(`aether-procesos:${texto}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function grafico(x, y, w, h, [borde, relleno], sangria) {
  return [
    `${sangria}<NodeGraphicsInfos>`,
    `${sangria}  <NodeGraphicsInfo ToolId="${HERRAMIENTA}" Height="${num(h)}" Width="${num(w)}" BorderColor="${borde}" FillColor="${relleno}">`,
    `${sangria}    <Coordinates XCoordinate="${num(x)}" YCoordinate="${num(y)}" />`,
    `${sangria}  </NodeGraphicsInfo>`,
    `${sangria}</NodeGraphicsInfos>`,
  ];
}

function conector(puntos, sangria) {
  return [
    `${sangria}<ConnectorGraphicsInfos>`,
    `${sangria}  <ConnectorGraphicsInfo ToolId="${HERRAMIENTA}" BorderColor="${NEGRO}">`,
    ...puntos.map(([x, y]) => `${sangria}    <Coordinates XCoordinate="${num(x)}" YCoordinate="${num(y)}" />`),
    `${sangria}  </ConnectorGraphicsInfo>`,
    `${sangria}</ConnectorGraphicsInfos>`,
  ];
}

const mensaje = (n, catchThrow) => [`<TriggerResultMessage CatchThrow="${catchThrow}">`, `  <Message Id="${guid(`${n}_mensaje`)}" />`, '</TriggerResultMessage>'];

/** El cuerpo de la actividad según su tipo: evento, compuerta, tarea o subproceso. */
function cuerpo(n, idNodo, subprocesoDe) {
  const id = idNodo(n);
  switch (n.tipo) {
    case 'inicio': return ['<Event>', '  <StartEvent Trigger="None" />', '</Event>'];
    case 'inicio-msg': return ['<Event>', '  <StartEvent Trigger="Message">', ...mensaje(id, 'CATCH').map((l) => `    ${l}`), '  </StartEvent>', '</Event>'];
    case 'inicio-timer': return ['<Event>', '  <StartEvent Trigger="Timer">', '    <TriggerTimer />', '  </StartEvent>', '</Event>'];
    case 'inicio-senal': return ['<Event>', '  <StartEvent Trigger="Signal">', '    <TriggerResultSignal CatchThrow="CATCH" />', '  </StartEvent>', '</Event>'];
    case 'inicio-cond': return ['<Event>', '  <StartEvent Trigger="Conditional">', '    <TriggerConditional />', '  </StartEvent>', '</Event>'];
    case 'fin': return ['<Event>', '  <EndEvent Result="None" />', '</Event>'];
    case 'fin-msg': return ['<Event>', '  <EndEvent Result="Message">', ...mensaje(id, 'THROW').map((l) => `    ${l}`), '  </EndEvent>', '</Event>'];
    case 'fin-terminar': return ['<Event>', '  <EndEvent Result="Terminate" />', '</Event>'];
    case 'fin-error': return ['<Event>', '  <EndEvent Result="Error">', '    <ResultError ErrorCode="" />', '  </EndEvent>', '</Event>'];
    case 'msg-recibir': return ['<Event>', '  <IntermediateEvent Trigger="Message">', ...mensaje(id, 'CATCH').map((l) => `    ${l}`), '  </IntermediateEvent>', '</Event>'];
    case 'msg-enviar': return ['<Event>', '  <IntermediateEvent Trigger="Message">', ...mensaje(id, 'THROW').map((l) => `    ${l}`), '  </IntermediateEvent>', '</Event>'];
    case 'timer': return ['<Event>', '  <IntermediateEvent Trigger="Timer">', '    <TriggerTimer />', '  </IntermediateEvent>', '</Event>'];
    case 'senal-enviar': return ['<Event>', '  <IntermediateEvent Trigger="Signal">', '    <TriggerResultSignal CatchThrow="THROW" />', '  </IntermediateEvent>', '</Event>'];
    case 'xor': return ['<Route />'];
    case 'and': return ['<Route GatewayType="Parallel" />'];
    case 'or': return ['<Route GatewayType="Inclusive" />'];
    case 'evento': return ['<Route ExclusiveType="Event" />'];
    case 'sub': return ['<Implementation>', `  <SubFlow Id="${subprocesoDe(n)}" />`, '</Implementation>'];
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

/** Paquete XPDL 2.2 con todos los procesos apilados en un solo diagrama. */
export function xpdlCompleto(procesos, { nombre, descripcion, fecha }) {
  const bloques = apilar(procesos);
  const idPool = (P, p) => guid(`${P}_pool_${p.id}`);
  const idProc = (P, p) => guid(`${P}_proc_${p.id}`);
  const idNodo = (P) => (n) => guid(`${P}_${n.id}`);
  // Un subproceso Pxx apunta al primer proceso con carriles de ese diagrama.
  const procesoPrincipal = new Map(bloques.map((b) => [b.proc.id, idProc(b.proc.id, b.m.pools.find((p) => !p.externo))]));
  const subprocesoDe = (n) => {
    const codigo = /P\d\d/.exec(n.nombre)?.[0];
    if (!codigo || !procesoPrincipal.has(codigo)) throw new Error(`El subproceso "${n.nombre}" no nombra un proceso del modelo`);
    return procesoPrincipal.get(codigo);
  };

  const L = [];
  const add = (sangria, lineas) => { for (const l of lineas) L.push(sangria + l); };
  const principal = { pool: guid('principal_pool'), proc: guid('principal_proc') };
  L.push('<?xml version="1.0" encoding="utf-8"?>');
  L.push(`<Package xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" Id="${guid('paquete')}" Name="${esc(nombre)}" xmlns="http://www.wfmc.org/2009/XPDL2.2">`);
  L.push('  <PackageHeader>', '    <XPDLVersion>2.2</XPDLVersion>', '    <Vendor>Aether · generador de procesos</Vendor>');
  L.push(`    <Created>${fecha}</Created>`, `    <ModificationDate>${fecha}</ModificationDate>`, `    <Description>${esc(descripcion)}</Description>`, '    <Documentation />', '  </PackageHeader>');
  L.push('  <RedefinableHeader>', '    <Author>Aether</Author>', '    <Version>1.0</Version>', '    <Countrykey>CL</Countrykey>', '  </RedefinableHeader>');
  L.push('  <ExternalPackages />');

  // ── Piscinas (la principal, oculta, como en toda exportación de Bizagi) ──
  L.push('  <Pools>');
  L.push(`    <Pool Id="${principal.pool}" Name="Main Process" Process="${principal.proc}" BoundaryVisible="false">`, '      <Lanes />');
  add('      ', grafico(30, 30, 700, 350, COLOR.pool, ''));
  L.push('    </Pool>');
  for (const { proc, m } of bloques) {
    for (const p of m.pools) {
      L.push(`    <Pool Id="${idPool(m.P, p)}" Name="${esc(`${proc.id} · ${p.nombre}`)}" Process="${idProc(m.P, p)}" BoundaryVisible="true">`);
      L.push('      <Lanes>');
      // Una piscina externa lleva un carril sin nombre: Bizagi dibuja así una piscina de caja negra.
      const carriles = p.externo ? [{ id: 'externo', nombre: '', y: p.y, h: p.h }] : p.carriles;
      for (const c of carriles) {
        L.push(`        <Lane Id="${guid(`${m.P}_carril_${p.id}_${c.id}`)}" Name="${esc(c.nombre)}" ParentPool="${idPool(m.P, p)}">`);
        add('          ', grafico(DESPLAZAMIENTO_CARRIL, c.y - p.y, p.w - DESPLAZAMIENTO_CARRIL, c.h, COLOR.carril, ''));
        L.push('          <ExtendedAttributes />', '        </Lane>');
      }
      L.push('      </Lanes>');
      add('      ', grafico(p.x, p.y, p.w, p.h, COLOR.pool, ''));
      L.push('    </Pool>');
    }
  }
  L.push('  </Pools>');

  // ── Mensajes entre piscinas ──
  L.push('  <MessageFlows>');
  for (const { m } of bloques) {
    for (const msg of m.mensajes) {
      const ref = (x, n) => (n ? idNodo(m.P)(n) : idPool(m.P, m.pools.find((p) => p.id === x)));
      L.push(`    <MessageFlow Id="${guid(msg.id)}" Name="${esc(msg.etiqueta ?? '')}" Source="${ref(msg.desde, msg.s)}" Target="${ref(msg.hasta, msg.t)}">`);
      add('      ', conector(msg.puntos, ''));
      L.push('    </MessageFlow>');
    }
  }
  L.push('  </MessageFlows>');

  // ── Notas: el título de cada proceso y las anotaciones del diagrama ──
  L.push('  <Associations>');
  for (const { m } of bloques) {
    for (const nota of m.notas.filter((x) => x.asoc)) {
      L.push(`    <Association Id="${guid(nota.asoc.id)}" Source="${guid(nota.id)}" Target="${idNodo(m.P)(nota.asoc.n)}">`);
      add('      ', conector(nota.asoc.puntos, ''));
      L.push('    </Association>');
    }
  }
  L.push('  </Associations>');
  L.push('  <Artifacts>');
  for (const { proc, m, titulo } of bloques) {
    L.push(`    <Artifact Id="${guid(`${proc.id}_titulo`)}" ArtifactType="Annotation" TextAnnotation="${esc(`${proc.id} · ${proc.nombre}. ${proc.resumen}`)}">`);
    add('      ', grafico(titulo.x, titulo.y, titulo.w, titulo.h, COLOR.nota, ''));
    L.push('    </Artifact>');
    for (const nota of m.notas) {
      L.push(`    <Artifact Id="${guid(nota.id)}" ArtifactType="Annotation" TextAnnotation="${esc(nota.texto)}">`);
      add('      ', grafico(nota.x, nota.y, nota.w, nota.h, COLOR.nota, ''));
      L.push('    </Artifact>');
    }
  }
  L.push('  </Artifacts>');

  // ── Procesos: actividades y transiciones de cada piscina ──
  const cabeceraProceso = (id, nombreProceso, descripcionProceso) => [
    `    <WorkflowProcess Id="${id}" Name="${esc(nombreProceso)}">`,
    '      <ProcessHeader>', `        <Created>${fecha}</Created>`, `        <Description>${esc(descripcionProceso)}</Description>`, '      </ProcessHeader>',
    '      <RedefinableHeader>', '        <Author>Aether</Author>', '        <Version>1.0</Version>', '        <Countrykey>CL</Countrykey>', '      </RedefinableHeader>',
    '      <ActivitySets />', '      <DataInputOutputs />',
  ];
  L.push('  <WorkflowProcesses>');
  L.push(...cabeceraProceso(principal.proc, 'Main Process', ''), '      <ExtendedAttributes />', '    </WorkflowProcess>');
  for (const { proc, m } of bloques) {
    const id = idNodo(m.P);
    for (const p of m.pools) {
      L.push(...cabeceraProceso(idProc(m.P, p), `${proc.id} · ${p.nombre}`, p.externo ? `Participante externo de ${proc.id}` : `${proc.nombre}. Objetivo: ${proc.objetivo}`));
      const propios = m.nodos.filter((n) => n.pool.id === p.id);
      if (propios.length) {
        L.push('      <Activities>');
        for (const n of propios) {
          L.push(`        <Activity Id="${id(n)}" Name="${esc(n.nombre)}">`);
          L.push(n.op.doc ? `          <Description>${esc(n.op.doc)}</Description>` : '          <Description />');
          add('          ', cuerpo(n, id, subprocesoDe));
          if (n.def.forma === 'tarea') L.push('          <Performers />');
          L.push('          <Documentation />');
          if (n.def.forma === 'tarea') L.push('          <Loop LoopType="None" />');
          add('          ', grafico(n.x, n.y, n.w, n.h, colorDe(n), ''));
          L.push('          <ExtendedAttributes />', '        </Activity>');
        }
        L.push('      </Activities>');
        L.push('      <Transitions>');
        for (const f of m.flujos.filter((x) => x.s.pool.id === p.id)) {
          L.push(`        <Transition Id="${guid(f.id)}" From="${id(f.s)}" To="${id(f.t)}"${f.etiqueta ? ` Name="${esc(f.etiqueta)}"` : ''}>`);
          L.push('          <Condition />', '          <Description />');
          add('          ', conector(f.puntos, ''));
          L.push('          <ExtendedAttributes />', '        </Transition>');
        }
        L.push('      </Transitions>');
      }
      L.push('      <ExtendedAttributes />', '    </WorkflowProcess>');
    }
  }
  L.push('  </WorkflowProcesses>');
  L.push('  <ExtendedAttributes />');
  L.push('</Package>');
  return `${L.join('\r\n')}\r\n`;
}
