import { createHmac } from 'node:crypto';

/**
 * Parte pura de `scripts/enviar-orden-supersuite.ts`: arma, firma y describe las órdenes de la Supersuite
 * (`empresa.reiniciar.*`, `empresa.eliminar.*` y las del marketing propio `marketing.contexto` y
 * `marketing.revisar`, ADR 0015) sin tocar red, base ni teclado, para poder probarla.
 *
 * La firma es la que verifica `verificarFirma` (`src/lib/supersuite/cliente.ts`): cabecera
 * `X-Supersuite-Firma: t=<segundos unix>,v1=<HMAC-SHA256 hex de "<t>.<cuerpo>">` con el secreto compartido
 * `SUPERSUITE_WEBHOOK_SECRET`. El cuerpo firmado es el texto EXACTO que se envía.
 */

export type ErasureAction = 'reiniciar' | 'eliminar';
export type Command = 'reiniciar' | 'eliminar' | 'confirmar' | 'cancelar' | 'ping' | 'marketing-contexto' | 'marketing-revisar';

export interface OrderArgs {
  command: Command | null;
  action: ErasureAction | null;
  company: string | null;
  companyId: string | null;
  url: string | null;
  code: string | null;
  businessName: string | null;
  acceptRealData: boolean;
  onlyRequest: boolean;
  help: boolean;
  /** marketing-contexto: archivo donde guardar el contexto completo (JSON). */
  outFile: string | null;
  /** marketing-revisar: archivo JSON con `[{ id, canal, texto }]`. */
  piecesFile: string | null;
  /** marketing-revisar: una sola pieza. */
  channel: string | null;
  text: string | null;
}

const COMMANDS: readonly Command[] = ['reiniciar', 'eliminar', 'confirmar', 'cancelar', 'ping', 'marketing-contexto', 'marketing-revisar'];
const ACTIONS: readonly ErasureAction[] = ['reiniciar', 'eliminar'];
const WITH_VALUE = ['--empresa', '--empresa-id', '--url', '--codigo', '--razon-social', '--salida', '--archivo', '--canal', '--texto'] as const;

export function parseOrderArgs(argv: readonly string[]): OrderArgs {
  const args: OrderArgs = {
    command: null,
    action: null,
    company: null,
    companyId: null,
    url: null,
    code: null,
    businessName: null,
    acceptRealData: false,
    onlyRequest: false,
    help: false,
    outFile: null,
    piecesFile: null,
    channel: null,
    text: null,
  };
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--ayuda' || arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--acepto-datos-reales') args.acceptRealData = true;
    else if (arg === '--solo-solicitar') args.onlyRequest = true;
    else if ((WITH_VALUE as readonly string[]).includes(arg)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`Falta el valor de ${arg}.`);
      if (arg === '--empresa') args.company = value;
      else if (arg === '--empresa-id') args.companyId = value;
      else if (arg === '--url') args.url = value;
      else if (arg === '--codigo') args.code = value;
      else if (arg === '--salida') args.outFile = value;
      else if (arg === '--archivo') args.piecesFile = value;
      else if (arg === '--canal') args.channel = value;
      else if (arg === '--texto') args.text = value;
      else args.businessName = value;
      index += 1;
    } else if (arg.startsWith('-')) {
      throw new Error(`Opción desconocida: ${arg}. Usa --ayuda.`);
    } else {
      positionals.push(arg);
    }
  }
  if (args.help) return args;

  const [command, action, ...extra] = positionals;
  if (!command) throw new Error('Falta el comando (reiniciar, eliminar, confirmar, cancelar, ping, marketing-contexto o marketing-revisar). Usa --ayuda.');
  if (!(COMMANDS as readonly string[]).includes(command)) throw new Error(`Comando desconocido: ${command}. Usa --ayuda.`);
  args.command = command as Command;

  const takesAction = args.command === 'confirmar' || args.command === 'cancelar';
  if (takesAction) {
    if (!action || !(ACTIONS as readonly string[]).includes(action)) throw new Error(`«${command}» necesita decir qué: ${command} reiniciar | ${command} eliminar.`);
    args.action = action as ErasureAction;
  } else if (action !== undefined) {
    throw new Error(`Sobra «${action}». Usa --ayuda.`);
  }
  if (extra.length > 0) throw new Error(`Sobra «${extra[0]}». Usa --ayuda.`);
  if (args.command === 'reiniciar' || args.command === 'eliminar') args.action = args.command;

  if (args.command === 'ping') return args;
  if (args.command === 'marketing-contexto') return args;
  if (args.command === 'marketing-revisar') {
    const single = args.channel !== null || args.text !== null;
    if (args.piecesFile && single) throw new Error('Usa --archivo o --canal con --texto, no los dos.');
    if (!args.piecesFile && !(args.channel && args.text)) throw new Error('marketing-revisar necesita --archivo <piezas.json> o --canal <red> --texto "<texto>".');
    return args;
  }

  if (args.company && args.companyId) throw new Error('Usa --empresa o --empresa-id, no las dos.');
  if (!args.company && !args.companyId) throw new Error('Falta la empresa: --empresa "<RUT | razón social | id>" o --empresa-id <id>.');
  if (args.command === 'confirmar' && !args.code) throw new Error('Falta --codigo (el que entregó la solicitud).');
  return args;
}

/** Tipo de orden de Aether para un paso: `empresa.reiniciar.solicitar`, `empresa.eliminar.confirmar`… */
export function orderType(action: ErasureAction, step: 'solicitar' | 'confirmar' | 'cancelar'): string {
  return `empresa.${action}.${step}`;
}

export interface BuiltOrder {
  /** Texto exacto que se envía y se firma. */
  body: string;
  /** Valor de la cabecera `X-Supersuite-Firma`. */
  signature: string;
}

/** Arma el cuerpo de la orden (la forma de `OrdenRecibida`) y su firma. `nowMs` permite fijar la hora en pruebas. */
export function buildSignedOrder(
  secret: string,
  order: { tipo: string; clienteId: string | null; datos?: Record<string, unknown> },
  nowMs: number = Date.now()
): BuiltOrder {
  if (!secret) throw new Error('Falta el secreto de las órdenes (SUPERSUITE_WEBHOOK_SECRET).');
  const seconds = Math.floor(nowMs / 1000);
  const body = JSON.stringify({
    // Aether lo guarda como Int (id de la orden que pidió la solicitud): segundos unix caben hasta 2038.
    id: seconds,
    tipo: order.tipo,
    clienteId: order.clienteId,
    datos: order.datos ?? {},
    creadaEn: new Date(nowMs).toISOString(),
    intento: 1,
  });
  const hmac = createHmac('sha256', secret).update(`${seconds}.${body}`).digest('hex');
  return { body, signature: `t=${seconds},v1=${hmac}` };
}

/** `https://` salvo en la propia máquina: el cuerpo lleva el código de confirmación. */
export function normalizeBaseUrl(raw: string | null | undefined): string {
  const text = (raw ?? '').trim();
  if (!text) throw new Error('Falta la dirección de Aether: pasa --url https://… o define APP_URL.');
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`La dirección «${text}» no es válida.`);
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error('La dirección debe ser https:// (http:// solo vale en localhost): la orden lleva el código de confirmación.');
  }
  return url.origin;
}

export interface AetherReply {
  ok: boolean;
  mensaje?: string;
  datos?: Record<string, unknown>;
}

/** Qué dice cada código HTTP, en palabras de quien opera el script. */
export function describeHttpFailure(status: number, step: 'solicitar' | 'confirmar' | 'cancelar' | 'ping' | 'marketing'): string {
  if (status === 401) {
    return 'Aether rechazó la firma. El secreto no coincide con SUPERSUITE_WEBHOOK_SECRET del servidor, o el reloj de este equipo está desfasado más de 5 minutos.';
  }
  if (status === 503) return 'Las órdenes no están configuradas en Aether (falta SUPERSUITE_WEBHOOK_SECRET en el servidor).';
  if (status === 404) return 'Esa dirección no tiene la ruta de órdenes (/api/supersuite/ordenes). Revisa --url.';
  const retry =
    step === 'confirmar'
      ? ' No se sabe si llegó a ejecutarse: vuelve a correr «confirmar» con el mismo código (es seguro repetirlo: si ya estaba hecho, responde que ya estaba).'
      : '';
  return `Aether respondió ${status}.${retry}`;
}

export interface RequestDetails {
  requestId: string;
  code: string;
  notBefore: string | null;
  expiresAt: string | null;
  rows: number;
  tables: Array<[string, number]>;
  warnings: string[];
}

/** Lee `datos` de `empresa.*.solicitar` sin confiar en su forma: lo que falte queda en cero o vacío. */
export function readRequestDetails(datos: Record<string, unknown> | undefined): RequestDetails {
  const data = datos ?? {};
  const rawTables = data.tablas && typeof data.tablas === 'object' ? (data.tablas as Record<string, unknown>) : {};
  const tables = Object.entries(rawTables)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return {
    requestId: typeof data.solicitudId === 'string' ? data.solicitudId : '',
    code: typeof data.codigo === 'string' ? data.codigo : '',
    notBefore: typeof data.confirmarDesde === 'string' ? data.confirmarDesde : null,
    expiresAt: typeof data.vence === 'string' ? data.vence : null,
    rows: typeof data.filas === 'number' ? data.filas : tables.reduce((sum, [, n]) => sum + n, 0),
    tables,
    warnings: Array.isArray(data.advertencias) ? data.advertencias.filter((w): w is string => typeof w === 'string') : [],
  };
}

/** La razón social escrita debe repetirse tal cual (sin distinguir mayúsculas ni espacios de más), igual que en Aether. */
export function businessNameMatches(businessName: string, typed: string | null): boolean {
  if (!typed) return false;
  const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-CL');
  return normalize(typed) === normalize(businessName);
}

/** La opción que identificó a la empresa, tal como se escribió, para repetirla en las líneas sugeridas. */
export function companySelector(args: Pick<OrderArgs, 'company' | 'companyId'>): string {
  if (args.companyId) return `--empresa-id ${args.companyId}`;
  return `--empresa "${(args.company ?? '').replace(/"/g, '\\"')}"`;
}

/** La línea para ejecutar después un paso que hoy no se pudo (eliminar espera 7 días; reiniciar sin teclado). */
export function confirmCommandHint(action: ErasureAction, selector: string, code: string, acceptRealData: boolean): string {
  return `npx tsx scripts/enviar-orden-supersuite.ts confirmar ${action} ${selector} --codigo ${code} --razon-social "<razón social>"${acceptRealData ? ' --acepto-datos-reales' : ''}`;
}

/**
 * `datos` de `marketing.revisar`: una pieza (`--canal` + `--texto`) o el contenido de `--archivo`
 * (`[{ id, canal, texto }]` o `{ piezas: [...] }`). La validación fina (canales, largo, tope de 50) la hace Aether.
 */
export function marketingReviewData(args: Pick<OrderArgs, 'channel' | 'text'>, fileContent?: string): Record<string, unknown> {
  if (fileContent === undefined) return { canal: args.channel, texto: args.text };
  let parsed: unknown;
  try {
    parsed = JSON.parse(fileContent);
  } catch {
    throw new Error('El archivo de piezas no es JSON válido.');
  }
  const pieces = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>).piezas : undefined;
  if (!Array.isArray(pieces) || pieces.length === 0) throw new Error('El archivo debe traer una lista de piezas: [{ "id": "p1", "canal": "instagram", "texto": "…" }].');
  return { piezas: pieces };
}

interface ReviewLine {
  id: string;
  canal: string;
  aprobado: boolean;
  puntaje: number;
  hallazgos: { nivel: string; regla: string; mensaje: string; fragmento?: string }[];
}

/** Resultado de `marketing.revisar` en líneas legibles, sin confiar en su forma. */
export function formatMarketingReview(datos: Record<string, unknown> | undefined): string[] {
  const reviews = Array.isArray(datos?.revisiones) ? (datos.revisiones as ReviewLine[]) : [];
  const lines: string[] = [];
  for (const r of reviews) {
    lines.push(`${r.aprobado ? '✔' : '✖'} ${r.id} · ${r.canal} · puntaje ${r.puntaje}`);
    for (const h of Array.isArray(r.hallazgos) ? r.hallazgos : []) {
      lines.push(`    ${h.nivel === 'bloquea' ? 'BLOQUEA ' : 'advierte'} ${h.regla}: ${h.mensaje}${h.fragmento ? ` («${h.fragmento}»)` : ''}`);
    }
  }
  return lines;
}
