// Genera el modelo de procesos de Aether y la Supersuite a partir de las
// definiciones de procesos/*.mjs:
//   docs/procesos/bpmn/*.bpmn   BPMN 2.0 con diagrama (Bizagi, Camunda, bpmn.io…)
//   docs/procesos/README.md     mapa, catálogo, fichas, puesta en marcha y brechas
//   docs/procesos/visor.html    visor interactivo (bpmn-js desde unpkg)
//   docs/procesos/bizagi/       todos los procesos en un solo diagrama: .xpdl y .bpmn para importar en Bizagi
//
// Uso:  node docs/procesos/generador/generar.mjs [--fragmento <ruta.html>] [--supersuite <repo-supersuite>]
//   --fragmento escribe además el visor sin <html>/<head>/<body> (para publicarlo como Artifact).
//   --supersuite copia los procesos de la plataforma (P00–P09) a <repo>/docs/procesos/ con su README.

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aXml, aXmlCompleto, TIPOS } from './bpmn.mjs';
import { xpdlCompleto } from './xpdl.mjs';
import plataforma from './procesos/plataforma.mjs';
import erp from './procesos/erp.mjs';
import eventos from './procesos/eventos.mjs';
import digitales from './procesos/digitales.mjs';
import transversales from './procesos/transversales.mjs';
import { paginaVisor } from './visor.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
// Fecha del modelo que llevan los archivos para Bizagi. Súbela al cambiar procesos (fija, para no ensuciar los diff).
const FECHA_MODELO = '2026-10-19T00:00:00-03:00';
const NOMBRE_MODELO = 'Modelo de procesos Aether';
const PROCESOS = [...plataforma, ...erp, ...eventos, ...digitales, ...transversales];

export const AREAS = [
  { id: 'plataforma', nombre: 'Plataforma SaaS: Aether y Supersuite' },
  { id: 'erp', nombre: 'Núcleo ERP y tributario' },
  { id: 'eventos', nombre: 'Producción de certámenes' },
  { id: 'digital', nombre: 'Canales digitales' },
  { id: 'transversal', nombre: 'Transversales' },
];

export const NIVELES = [
  { id: 'estrategico', nombre: 'Estratégicos', texto: 'Deciden qué empresas entran, qué contratan y si siguen.' },
  { id: 'operativo', nombre: 'Operativos', texto: 'La cadena de valor: lo que cada empresa hace todos los días en Aether.' },
  { id: 'soporte', nombre: 'Soporte', texto: 'Lo que hace posible lo anterior: órdenes, despliegue, conexión, acceso y automatizaciones.' },
];

/** Brechas que no caben en un solo proceso o que conviene ver juntas. */
export const BRECHAS = [
  {
    id: 'B1',
    severidad: 'alta',
    titulo: 'La Supersuite no puede transmitir empresa.crear ni las otras órdenes nuevas de Aether',
    detalle: 'Aether atiende 15 tipos de orden (ping incluido), pero el catálogo de la Supersuite (TIPOS_ORDEN y el esquema OrdenIn en packages/core) solo tiene 10. Faltan empresa.crear, modulos.listar, seguridad.ip.liberar, acceso.otorgar y acceso.revocar. Como Aether ya no tiene /superadmin, hoy no hay forma de crear una empresa nueva, liberar una lista de IPs que dejó a una empresa afuera ni dar acceso multiempresa. Además, modulo.activar de la Supersuite manda un solo módulo; Aether acepta una lista.',
    donde: 'supersuite: packages/core/src/saas.ts y packages/core/src/esquemas.ts · Aether: src/lib/supersuite/ordenes.ts',
    procesos: ['P02', 'P05'],
    propuesta: 'Sumar los cinco tipos a TIPOS_ORDEN, ORDENES (rol admin para empresa.crear, seguridad.ip.liberar y acceso.*) y OrdenIn, con empresa.crear sin clienteId ("nunca") y su formulario en la consola.',
  },
  {
    id: 'B2',
    severidad: 'media',
    titulo: 'El cierre del período contable no se puede registrar',
    detalle: 'Existe el permiso accounting:close_period y el diario rechaza asientos en períodos CLOSED o LOCKED, pero ninguna pantalla, acción ni servicio cambia AccountingPeriod a esos estados. El cierre mensual (P13) termina en un paso que el sistema no ofrece.',
    donde: 'src/modules/accounting/services/journal.service.ts · src/lib/auth/permissions.ts',
    procesos: ['P13'],
    propuesta: 'Servicio y acción para cerrar, reabrir y bloquear un período (con requireAuthWithPermission(\'accounting:close_period\') y auditoría).',
  },
  {
    id: 'B3',
    severidad: 'alta',
    titulo: 'Los DTE se timbran pero no se envían al SII',
    detalle: 'Pendiente conocido: falta la firma XML-DSig con el certificado de la empresa, el envío (semilla, token, EnvioDTE), la consulta por Track ID y el Consumo de Folios de boletas. siiStatus PENDING significa "timbrado, sin despachar".',
    donde: 'src/modules/dte/ · src/lib/chile/dte/',
    procesos: ['P10'],
    propuesta: 'Implementar el envío en el orden que ya fija CLAUDE.md §3, sin reserializar el XML firmado.',
  },
  {
    id: 'B4',
    severidad: 'media',
    titulo: 'El borrado permanente de una empresa no tiene vía',
    detalle: 'La confirmación con TOTP del superadmin se fue con la consola; platform-delete.service.ts quedó sin llamadores. Una empresa que pide irse solo puede quedar suspendida o cancelada.',
    donde: 'src/modules/platform/services/platform-delete.service.ts',
    procesos: ['P00', 'P07'],
    propuesta: 'Definir con el dueño cómo se confirma y exponerlo como orden de la Supersuite.',
  },
  {
    id: 'B5',
    severidad: 'baja',
    titulo: 'La entrega del acceso al Dueño nuevo es manual',
    detalle: 'empresa.crear lleva la clave inicial en la orden y Aether no envía correo de bienvenida: el operador debe hacerle llegar correo y clave por otro canal.',
    donde: 'src/lib/supersuite/ordenes.ts (crearEmpresa)',
    procesos: ['P02', 'P03'],
    propuesta: 'Invitación por correo con enlace para fijar la clave, en vez de una clave que viaja en la orden.',
  },
  {
    id: 'B6',
    severidad: 'baja',
    titulo: 'Entradas y votos dependen de una confirmación manual del pago',
    detalle: 'No hay pasarela: el staff confirma cada transferencia y una orden sin pagar reserva cupo hasta que alguien la cancela a mano. Es una decisión de diseño, pero en una gala con mucho público es trabajo y riesgo de sobrerreserva.',
    donde: 'src/modules/ticketing/ · src/modules/public-voting/',
    procesos: ['P23', 'P24'],
    propuesta: 'Reusar el cobro por Khipu de las cuotas (P27), con la misma regla de confirmar contra el proveedor.',
  },
];

/** Puesta en marcha completa, en orden. */
export const PUESTA_EN_MARCHA = [
  {
    paso: 'Infraestructura de Aether',
    procesos: ['P08'],
    texto: 'Proyecto en Vercel sobre Neon. El build de producción aplica las migraciones antes de compilar.',
    variables: ['DATABASE_URL', 'JWT_SECRET', 'TOTP_ENCRYPTION_KEY', 'CRON_SECRET', 'APP_URL', 'BLOB_READ_WRITE_TOKEN', 'SENTRY_DSN', 'DTE_ENCRYPTION_KEY', 'VERCEL_API_TOKEN', 'AETHER_SALES_EMAIL', 'TURNSTILE_SECRET_KEY'],
  },
  {
    paso: 'Supersuite en Render',
    procesos: ['P08'],
    texto: 'Blueprint render.yaml: base, API, worker y panel. Las migraciones corren en preDeploy. Primer usuario con npm run usuario:crear y después se deja ADMIN_TOKEN vacío.',
    variables: ['DATABASE_URL', 'CORS_ORIGIN', 'VITE_API_URL', 'ADMIN_TOKEN', 'ANTHROPIC_API_KEY', 'FLOW_API_KEY', 'KHIPU_API_KEY', 'WHATSAPP_TOKEN'],
  },
  {
    paso: 'Conexión Aether ↔ Supersuite',
    procesos: ['P09'],
    texto: 'Producto aether con sus módulos, API key, webhook y secreto; las tres variables en Vercel, ping, fichas y apagar la fase 1.',
    variables: ['SUPERSUITE_URL', 'SUPERSUITE_KEY', 'SUPERSUITE_WEBHOOK_SECRET'],
  },
  { paso: 'Venta', procesos: ['P01'], texto: 'Demo sobre los procesos del cliente y propuesta con el tarifario.' },
  { paso: 'Alta de la empresa', procesos: ['P02'], texto: 'Orden empresa.crear desde la Supersuite.', bloqueo: 'B1' },
  { paso: 'Puesta en marcha de la empresa', procesos: ['P03'], texto: 'Clave propia, asistente de inicio, CAF, importaciones, roles, plan de cuentas y equipo.' },
  { paso: 'Operación del mes', procesos: ['P10', 'P11', 'P12', 'P14', 'P15', 'P16', 'P20', 'P30', 'P13'], texto: 'Ventas, compras, caja, personas, certámenes y sitios; cierre y F29 el día 5.' },
  { paso: 'Monitoreo, cobro y crecimiento', procesos: ['P06', 'P07', 'P04'], texto: 'Salud y alertas en vivo, cobro de la suscripción y ampliación de módulos.' },
];

const GRUPO_TIPO = {
  usuario: 'Tarea de usuario', manual: 'Tarea manual', servicio: 'Tarea automática', script: 'Script', regla: 'Regla de negocio',
  enviar: 'Envío', recibir: 'Recepción', tarea: 'Tarea', sub: 'Subproceso',
};

function ficha(proc) {
  const { maqueta, xml } = aXml(proc);
  const actores = proc.pools.map((p) => ({ nombre: p.nombre, externo: Boolean(p.externo), carriles: (p.lanes ?? []).map(([, n]) => n) }));
  const actividades = maqueta.nodos
    .filter((n) => n.def.forma === 'tarea')
    .sort((a, b) => a.col - b.col || a.fila - b.fila)
    .map((n) => ({ id: `${proc.id}_${n.id}`, nombre: n.nombre, tipo: GRUPO_TIPO[n.tipo], carril: n.carril.nombre, doc: n.op.doc ?? '' }));
  const elementos = Object.fromEntries(
    maqueta.nodos.map((n) => [`${proc.id}_${n.id}`, { nombre: n.nombre, tipo: n.tipo, carril: n.carril.nombre, doc: n.op.doc ?? '' }]),
  );
  return {
    id: proc.id, slug: proc.slug, area: proc.area, nivel: proc.nivel, nombre: proc.nombre, resumen: proc.resumen,
    objetivo: proc.objetivo, disparador: proc.disparador, resultado: proc.resultado, duenio: proc.duenio,
    modulos: proc.modulos, codigo: proc.codigo, reglas: proc.reglas, brechas: BRECHAS.filter((b) => b.procesos.includes(proc.id)).map((b) => b.id),
    actores, actividades, elementos, archivo: `bpmn/${proc.id}-${proc.slug}.bpmn`, xml,
    tamano: { ancho: maqueta.ancho, alto: maqueta.alto, nodos: maqueta.nodos.length },
  };
}

function readme(fichas) {
  const enlace = (id) => `[${id}](#${id.toLowerCase()})`;
  const L = [];
  L.push('# Modelo de procesos de Aether y la Supersuite', '');
  L.push(`${fichas.length} diagramas BPMN 2.0 sacados del código de \`erp-chile\` y \`supersuite\`: cómo llega una empresa, cómo se da de alta y se pone en marcha, cómo opera cada mes y cómo la monitorea, la cobra y la administra la Supersuite.`, '');
  L.push('> Generado con `node docs/procesos/generador/generar.mjs`. No edites los `.bpmn`, este README ni `visor.html` a mano: cambia la definición en `generador/procesos/` y vuelve a generar.', '');
  L.push('## Cómo abrirlos', '');
  L.push('**Todo en un solo archivo, para Bizagi:** [`bizagi/modelo-procesos-aether.xpdl`](bizagi/modelo-procesos-aether.xpdl) trae los procesos en un mismo diagrama, de P00 a P41, uno debajo del otro con su título, con los colores y el formato que usa Bizagi al exportar XPDL. En Bizagi Modeler se abre con la opción de importar XPDL. El mismo diagrama en BPMN 2.0 está en [`bizagi/modelo-procesos-aether.bpmn`](bizagi/modelo-procesos-aether.bpmn), por si prefieres importar BPMN o abrirlo en otra herramienta.', '');
  L.push('| Herramienta | Cómo |', '|---|---|');
  L.push('| **Bizagi Modeler** | El archivo `.xpdl` de [`bizagi/`](bizagi/) (todo junto) o, para un diagrama por proceso, cada archivo de [`bpmn/`](bpmn/) con la opción de importar BPMN 2.0. Cada actividad lleva su descripción con la referencia al código. |');
  L.push('| **Camunda Modeler, bpmn.io, Signavio, Visual Paradigm** | Abren los `.bpmn` directamente. |');
  L.push('| **Navegador** | Abre [`visor.html`](visor.html): mapa, diagramas navegables, fichas y brechas (necesita internet para cargar bpmn-js). |');
  L.push('');
  L.push('Los colores van como extensión estándar *BPMN in Color*; un modelador que no la conoce simplemente los ignora.', '');

  L.push('## Cómo leer los diagramas', '');
  L.push('| Elemento | Significado en este modelo |', '|---|---|');
  L.push('| Piscina (pool) | Una organización o sistema: Aether, la Supersuite, el SII, Khipu, el cliente. Las piscinas grises son participantes externos (caja negra). |');
  L.push('| Carril (lane) | Un rol (Dueño, Contador, Operador de la consola) o un componente del sistema (Sistema Aether, Worker, API de ingesta). |');
  L.push('| Tarea azul con persona | Tarea de usuario: alguien la hace en una pantalla. |');
  L.push('| Tarea gris con engranaje | Tarea automática del sistema. La tabla con líneas es una regla de negocio. |');
  L.push('| Tarea violeta con sobre | Envío o recepción de un mensaje (correo, webhook, orden). |');
  L.push('| Caja dorada con + | Subproceso: tiene su propio diagrama (el código Pxx de su nombre). |');
  L.push('| Círculo verde / rojo | Inicio / fin. Con sobre: llega o sale un mensaje. Con reloj: temporizador o cron (la expresión cron va en el XML). |');
  L.push('| Rombo con X / + / O / pentágono | Decisión exclusiva / paralelo / inclusiva / espera del primer evento que ocurra. |');
  L.push('| Línea punteada entre piscinas | Mensaje entre organizaciones o sistemas. |');
  L.push('| Nota que empieza con «Brecha:» | Algo que el proceso necesita y el código todavía no tiene. |');
  L.push('');

  L.push('## Mapa de procesos', '');
  for (const nivel of NIVELES) {
    L.push(`**${nivel.nombre}.** ${nivel.texto}`, '');
    for (const f of fichas.filter((x) => x.nivel === nivel.id)) L.push(`- ${enlace(f.id)} ${f.nombre}`);
    L.push('');
  }

  L.push('## Puesta en marcha, de punta a punta', '');
  PUESTA_EN_MARCHA.forEach((p, i) => {
    const bloqueo = p.bloqueo ? ` **Bloqueado hoy: ver ${p.bloqueo}.**` : '';
    L.push(`${i + 1}. **${p.paso}** (${p.procesos.map(enlace).join(', ')}). ${p.texto}${bloqueo}`);
    if (p.variables) L.push(`   Variables: ${p.variables.map((v) => `\`${v}\``).join(', ')}.`);
  });
  L.push('');

  L.push('## Brechas encontradas', '');
  L.push('| | Severidad | Brecha | Procesos |', '|---|---|---|---|');
  for (const b of BRECHAS) L.push(`| ${b.id} | ${b.severidad} | ${b.titulo} | ${b.procesos.map(enlace).join(', ')} |`);
  L.push('');
  for (const b of BRECHAS) {
    L.push(`**${b.id}. ${b.titulo}.** ${b.detalle}`, '');
    L.push(`- Dónde: ${b.donde}`, `- Propuesta: ${b.propuesta}`, '');
  }

  L.push('## Catálogo', '');
  for (const area of AREAS) {
    L.push(`### ${area.nombre}`, '');
    L.push('| Código | Proceso | Disparador | Dueño | Archivo |', '|---|---|---|---|---|');
    for (const f of fichas.filter((x) => x.area === area.id)) {
      L.push(`| ${enlace(f.id)} | ${f.nombre} | ${f.disparador} | ${f.duenio} | [${f.archivo.replace('bpmn/', '')}](${f.archivo}) |`);
    }
    L.push('');
  }

  L.push('## Fichas', '');
  for (const f of fichas) {
    L.push(`### ${f.id}`, '');
    L.push(`**${f.nombre}.** ${f.resumen}`, '');
    L.push(`- **Objetivo:** ${f.objetivo}`);
    L.push(`- **Disparador:** ${f.disparador}`);
    L.push(`- **Resultado:** ${f.resultado}`);
    L.push(`- **Dueño del proceso:** ${f.duenio}`);
    L.push(`- **Participantes:** ${f.actores.map((a) => (a.carriles.length ? `${a.nombre} (${a.carriles.join(', ')})` : `${a.nombre} (externo)`)).join('; ')}`);
    L.push(`- **Módulos:** ${f.modulos.join(', ')}`);
    L.push(`- **Diagrama:** [${f.archivo}](${f.archivo})`, '');
    L.push('Reglas de negocio:', '');
    for (const r of f.reglas) L.push(`- ${r}`);
    L.push('');
    for (const id of f.brechas) {
      const b = BRECHAS.find((x) => x.id === id);
      L.push(`> **Brecha ${b.id}:** ${b.titulo}.`, '');
    }
    L.push('Código: ' + f.codigo.map((c) => `\`${c}\``).join(' · '), '');
  }

  L.push('## Fuera de este modelo', '');
  L.push('Módulos que existen y no tienen diagrama propio todavía: CRM (embudo), atención al cliente y encuestas, calidad, tareas y delegación, inventario (tomas y multibodega), producción y manufactura, activo fijo, presupuestos, inteligencia, agentes ejecutivos (crons diarios de `vercel.json`), mensajería, respaldo, importaciones, honorarios, pagarés, organigrama, calendario, documentos y protección de datos. Se suman agregando un archivo en `generador/procesos/`.', '');

  L.push('## Cómo agregar o cambiar un proceso', '');
  L.push('1. Edita o crea la definición en `generador/procesos/*.mjs`: piscinas y carriles, nodos `[id, tipo, carril, columna, nombre, { f: fila, doc }]`, flujos, mensajes y notas. El formato está al principio de `generador/bpmn.mjs`.');
  L.push(`2. Tipos de nodo: ${Object.keys(TIPOS).map((t) => `\`${t}\``).join(', ')}.`);
  L.push('3. `node docs/procesos/generador/generar.mjs`. El generador falla con un mensaje claro si un flujo cruza piscinas, un mensaje queda dentro de la misma piscina, un nodo no tiene entrada o salida, o falta un carril.');
  L.push('');
  return `${L.join('\n')}\n`;
}

const fichas = PROCESOS.map(ficha);
const ids = new Set();
for (const f of fichas) {
  if (ids.has(f.id)) throw new Error(`Código de proceso repetido: ${f.id}`);
  ids.add(f.id);
}

const dirBpmn = join(RAIZ, 'bpmn');
mkdirSync(dirBpmn, { recursive: true });
for (const viejo of readdirSync(dirBpmn)) if (viejo.endsWith('.bpmn')) rmSync(join(dirBpmn, viejo));
for (const f of fichas) writeFileSync(join(RAIZ, f.archivo), f.xml);
writeFileSync(join(RAIZ, 'README.md'), readme(fichas));

// Todo en un archivo: los procesos apilados en un solo diagrama, en los dos formatos que importa Bizagi.
const dirBizagi = join(RAIZ, 'bizagi');
mkdirSync(dirBizagi, { recursive: true });
const descripcionModelo = `${PROCESOS.length} procesos de Aether ERP y la Supersuite, de P00 a P41, uno debajo del otro con su título.`;
const bizagi = {
  xpdl: xpdlCompleto(PROCESOS, { nombre: NOMBRE_MODELO, descripcion: descripcionModelo, fecha: FECHA_MODELO }),
  bpmn: aXmlCompleto(PROCESOS, { nombre: NOMBRE_MODELO, descripcion: descripcionModelo }),
};
writeFileSync(join(dirBizagi, 'modelo-procesos-aether.xpdl'), bizagi.xpdl);
writeFileSync(join(dirBizagi, 'modelo-procesos-aether.bpmn'), bizagi.bpmn);

const datos = { areas: AREAS, niveles: NIVELES, brechas: BRECHAS, puesta: PUESTA_EN_MARCHA, procesos: fichas, bizagi };
writeFileSync(join(RAIZ, 'visor.html'), paginaVisor(datos, { documento: true }));
const argumento = (nombre) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const fragmento = argumento('--fragmento');
if (fragmento) writeFileSync(fragmento, paginaVisor(datos, { documento: false }));
const supersuite = argumento('--supersuite');
if (supersuite) escribirSupersuite(join(supersuite, 'docs', 'procesos'), fichas.filter((f) => f.area === 'plataforma'));

/** La Supersuite recibe los procesos que la involucran; la fuente sigue en erp-chile. */
function escribirSupersuite(destino, propias) {
  mkdirSync(join(destino, 'bpmn'), { recursive: true });
  for (const viejo of readdirSync(join(destino, 'bpmn'))) if (viejo.endsWith('.bpmn')) rmSync(join(destino, 'bpmn', viejo));
  for (const f of propias) writeFileSync(join(destino, f.archivo), f.xml);
  const L = ['# Procesos de la plataforma (Aether ↔ Supersuite)', ''];
  L.push('Diagramas BPMN 2.0 de cómo la Supersuite da de alta, administra, monitorea y cobra a las empresas de Aether. Son parte del modelo completo de procesos, que vive en el repo `erp-chile` (`docs/procesos/`, con el visor, las fichas y las brechas) y se generan desde ahí: no los edites a mano.', '');
  L.push('Se abren en Bizagi Modeler (importar BPMN 2.0), Camunda Modeler o bpmn.io.', '');
  L.push('| Código | Proceso | Disparador | Archivo |', '|---|---|---|---|');
  for (const f of propias) L.push(`| ${f.id} | ${f.nombre} | ${f.disparador} | [${f.archivo.replace('bpmn/', '')}](${f.archivo}) |`);
  L.push('', '## Brechas que tocan a la Supersuite', '');
  for (const b of BRECHAS.filter((x) => x.procesos.some((id) => propias.some((f) => f.id === id)))) {
    L.push(`- **${b.id} (${b.severidad}). ${b.titulo}.** ${b.detalle} Propuesta: ${b.propuesta}`);
  }
  L.push('', 'Regenerar desde `erp-chile`: `node docs/procesos/generador/generar.mjs --supersuite ../supersuite`.', '');
  writeFileSync(join(destino, 'README.md'), `${L.join('\n')}\n`);
}

console.log(`✓ ${fichas.length} procesos · ${fichas.reduce((s, f) => s + f.tamano.nodos, 0)} elementos · README.md · visor.html`);
