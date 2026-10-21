// COPIA del SDK de la Supersuite (repo supersuite, packages/sdk/src/index.ts).
// No editar aquí: si cambia, se vuelve a copiar entero desde la supersuite.

/**
 * SDK de la Supersuite.
 *
 * Reglas de diseño (importantes):
 *  1. NUNCA lanza errores hacia tu aplicación. Si la supersuite está caída, Aether sigue normal.
 *  2. Agrupa envíos en lotes (menos requests, menos latencia en tu app).
 *  3. Si la cola crece demasiado (supersuite caída mucho rato), descarta lo más antiguo.
 *
 * Uso (servidor que corre siempre: Express, Fastify, un VPS):
 *   const monitor = crearSupersuite({ apiKey: process.env.SUPERSUITE_KEY!, url: 'https://supersuite.tudominio.cl' });
 *   monitor.evento(empresa.id, 'ventas', 'venta_registrada', { total: 15990 });
 *   monitor.latido(empresa.id, 'pos-1', { tipo: 'pos', nombre: 'POS caja 1', latenciaMs: 40 });
 *
 * Uso en serverless (Vercel, Lambda): ahí los temporizadores no corren después de
 * responder, así que se desactiva el envío periódico y se vacía la cola al final de
 * cada request. En Next.js:
 *   const monitor = crearSupersuite({ apiKey, url, intervaloMs: 0 });
 *   monitor.evento(...);
 *   after(() => monitor.flush());   // import { after } from 'next/server'
 *
 * Órdenes del panel SaaS (activar módulos, cambiar plan, suspender…): ver escucharOrdenes()
 * y, si prefieres que la supersuite te llame (webhook), responderWebhook().
 */

type Tipo = 'eventos' | 'latidos' | 'clientes' | 'alertas' | 'presencia';

export interface OpcionesSupersuite {
  apiKey: string;
  url: string;
  /** Cada cuánto se envía la cola. Default 5000 ms. 0 = sin envío automático (serverless: llama a flush()). */
  intervaloMs?: number;
  /** Tiempo máximo de cada envío. Default 5000 ms: una supersuite lenta nunca frena tu app. */
  timeoutMs?: number;
  /** Máximo por request (la API acepta hasta 500). Default 200. */
  loteMax?: number;
  /** Máximo en memoria antes de descartar. Default 10.000. */
  colaMax?: number;
  /** Para depurar. */
  alError?: (e: unknown) => void;
  /** Desactiva todo (útil en tests). */
  desactivado?: boolean;
  /** Cuánto se guardan en memoria los interruptores antes de volver a pedirlos. Default 60.000 ms. */
  interruptoresCacheMs?: number;
}

/** Una orden que el panel SaaS le manda a tu proyecto. */
export interface OrdenRecibida {
  id: number;
  /** modulo.activar · modulo.desactivar · plan.cambiar · limites.ajustar · cuenta.suspender · cuenta.reactivar ·
   *  sesiones.cerrar · anuncio.publicar · ficha.sincronizar · ping */
  tipo: string;
  /** Id de la empresa en TU sistema (el mismo clienteId que envías), o null si es para todo el proyecto. */
  clienteId: string | null;
  datos: Record<string, unknown>;
  creadaEn: string;
  /** 1 la primera vez. Más de 1 = se reentregó porque no llegó la confirmación: tu manejador debe ser idempotente. */
  intento: number;
}

/** Lo que devuelve tu manejador: nada o true = aplicada; false = no se pudo; o el detalle. Si lanza, cuenta como fallida con el mensaje del error. */
export type ResultadoManejador = void | boolean | { ok?: boolean; mensaje?: string; datos?: Record<string, unknown> };
type Manejador = (orden: OrdenRecibida) => ResultadoManejador | Promise<ResultadoManejador>;
/** Un manejador por tipo de orden ({ 'modulo.activar': async (o) => … }) o uno solo para todas. `ping` se responde solo. */
export type ManejadorOrdenes = Manejador | Partial<Record<string, Manejador>>;

const VERSION_SDK = '2.0.0';

/** Aplica una orden con tu manejador y devuelve el resultado que se informa a la supersuite. Nunca lanza. */
async function aplicar(orden: OrdenRecibida, manejador: ManejadorOrdenes): Promise<{ ok: boolean; mensaje?: string; datos?: Record<string, unknown> }> {
  const fn = typeof manejador === 'function' ? manejador : manejador[orden.tipo];
  if (!fn) {
    if (orden.tipo === 'ping') return { ok: true, mensaje: 'pong', datos: { sdk: VERSION_SDK, hora: new Date().toISOString() } };
    return { ok: false, mensaje: `Este proyecto todavía no sabe aplicar "${orden.tipo}"` };
  }
  try {
    const r = await fn(orden);
    if (r === undefined || r === true) return { ok: true };
    if (r === false) return { ok: false, mensaje: 'El proyecto no pudo aplicarla' };
    return { ok: r.ok ?? true, mensaje: r.mensaje?.slice(0, 500), datos: r.datos };
  } catch (e) {
    return { ok: false, mensaje: (e instanceof Error ? e.message : String(e)).slice(0, 500) || 'Error al aplicar la orden' };
  }
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
function igualSeguro(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/**
 * Verifica la cabecera `X-Supersuite-Firma` (`t=<unix>,v1=<hmac>`) de una orden entregada por webhook.
 * Usa Web Crypto, así que corre igual en Node, Vercel Edge, Deno o Cloudflare. Rechaza firmas de
 * hace más de `toleranciaS` segundos (default 5 minutos) para que nadie pueda repetir una orden vieja.
 * `cuerpo` debe ser el texto CRUDO del request, tal como llegó.
 */
export async function verificarFirma(secreto: string, cabecera: string | null | undefined, cuerpo: string, toleranciaS = 300): Promise<boolean> {
  if (!secreto || !cabecera) return false;
  const partes = Object.fromEntries(cabecera.split(',').map((p) => { const i = p.indexOf('='); return [p.slice(0, i).trim(), p.slice(i + 1).trim()]; }));
  const t = Number(partes.t);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > toleranciaS || !partes.v1) return false;
  const enc = new TextEncoder();
  const clave = await crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return igualSeguro(hex(await crypto.subtle.sign('HMAC', clave, enc.encode(`${t}.${cuerpo}`))), partes.v1);
}

/**
 * Atiende una orden que llegó por webhook: verifica la firma, la aplica y te dice qué responder.
 *   // Next.js (app/api/supersuite/route.ts)
 *   export async function POST(req: Request) {
 *     const r = await responderWebhook(process.env.SUPERSUITE_WEBHOOK_SECRET!, manejadores, req.headers.get('x-supersuite-firma'), await req.text());
 *     return Response.json(r.cuerpo, { status: r.status });
 *   }
 */
export async function responderWebhook(secreto: string, manejador: ManejadorOrdenes, cabecera: string | null | undefined, cuerpo: string) {
  if (!(await verificarFirma(secreto, cabecera, cuerpo))) return { status: 401, cuerpo: { ok: false, mensaje: 'Firma inválida' } };
  let orden: OrdenRecibida;
  try { orden = JSON.parse(cuerpo); } catch { return { status: 400, cuerpo: { ok: false, mensaje: 'Cuerpo inválido' } }; }
  return { status: 200, cuerpo: await aplicar(orden, manejador) };
}

export interface DatosLatido {
  tipo?: 'pos' | 'lector' | 'tablet' | 'impresora' | 'terminal' | 'sensor' | 'otro';
  nombre?: string;
  version?: string;
  latenciaMs?: number;
  bateria?: number;
}

export interface DatosCliente {
  nombre: string;
  ciudad?: string;
  region?: string;
  lat?: number;
  lon?: number;
  plan?: string;
  tarifaMensual?: number;
  clienteDesde?: string | Date;
  activo?: boolean;
  /** Cuenta suspendida (sigue siendo cliente, no es una baja): la consola SaaS la muestra suspendida. */
  suspendida?: boolean;
  /** Módulos contratados por este cliente (define su adopción en el panel). */
  modulos?: string[];
  metadata?: Record<string, unknown>;
}

export function crearSupersuite(op: OpcionesSupersuite) {
  const intervalo = op.intervaloMs ?? 5000;
  const timeoutMs = op.timeoutMs ?? 5000;
  const loteMax = Math.min(op.loteMax ?? 200, 500);
  const colaMax = op.colaMax ?? 10_000;
  const base = op.url.replace(/\/$/, '');
  const colas: Record<Tipo, unknown[]> = { eventos: [], latidos: [], clientes: [], alertas: [], presencia: [] };
  let enviando = false;
  const escuchas = new Set<() => void>();
  let fallos = 0;
  let pausaHasta = 0;

  const encolar = (tipo: Tipo, item: unknown) => {
    if (op.desactivado) return;
    const q = colas[tipo];
    q.push(item);
    if (q.length > colaMax) q.splice(0, q.length - colaMax);
  };

  async function enviar(tipo: Tipo, items: unknown[]): Promise<boolean> {
    try {
      const r = await fetch(`${base}/ingesta/${tipo}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': op.apiKey },
        body: JSON.stringify(items),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (r.status === 400 || r.status === 401) {
        // Datos inválidos o key mala: reintentar no sirve. Se descartan y se avisa.
        op.alError?.(new Error(`Supersuite rechazó ${tipo}: ${r.status} ${await r.text()}`));
        return true;
      }
      return r.ok;
    } catch (e) {
      op.alError?.(e);
      return false;
    }
  }

  async function vaciar(): Promise<void> {
    if (enviando || Date.now() < pausaHasta) return;
    enviando = true;
    try {
      for (const tipo of Object.keys(colas) as Tipo[]) {
        const q = colas[tipo];
        while (q.length) {
          const lote = q.slice(0, loteMax);
          const ok = await enviar(tipo, lote);
          if (!ok) {
            fallos++;
            pausaHasta = Date.now() + Math.min(60_000, 1000 * 2 ** fallos); // backoff exponencial
            return;
          }
          fallos = 0;
          q.splice(0, lote.length);
        }
      }
    } finally {
      enviando = false;
    }
  }

  const timer = op.desactivado || intervalo <= 0 ? null : setInterval(() => { void vaciar(); }, intervalo);

  // ── Órdenes (consulta) ──
  async function llamar<T>(ruta: string, init: RequestInit = {}): Promise<T | null> {
    try {
      const r = await fetch(`${base}${ruta}`, {
        ...init, headers: { 'Content-Type': 'application/json', 'X-Api-Key': op.apiKey, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(timeoutMs)
      });
      if (!r.ok) { op.alError?.(new Error(`Supersuite ${ruta}: ${r.status} ${await r.text().catch(() => '')}`)); return null; }
      return await r.json() as T;
    } catch (e) { op.alError?.(e); return null; }
  }
  // Confirmaciones que no se pudieron enviar: se reintentan en la vuelta siguiente.
  const porConfirmar = new Map<number, { ok: boolean; mensaje?: string; datos?: Record<string, unknown> }>();
  async function confirmar(id: number, r: { ok: boolean; mensaje?: string; datos?: Record<string, unknown> }) {
    const ok = await llamar(`/ingesta/ordenes/${id}/resultado`, { method: 'POST', body: JSON.stringify(r) });
    if (ok) porConfirmar.delete(id); else porConfirmar.set(id, r);
  }
  let procesando = false;
  async function procesarOrdenes(manejador: ManejadorOrdenes): Promise<number> {
    if (op.desactivado || procesando) return 0;
    procesando = true;
    try {
      for (const [id, r] of [...porConfirmar]) await confirmar(id, r);
      const resp = await llamar<{ ordenes: OrdenRecibida[] }>('/ingesta/ordenes/reclamar', { method: 'POST', body: JSON.stringify({ max: 20 }) });
      for (const orden of resp?.ordenes ?? []) await confirmar(orden.id, await aplicar(orden, manejador));
      return resp?.ordenes.length ?? 0;
    } finally { procesando = false; }
  }

  // ── Interruptores ──
  const cacheMs = op.interruptoresCacheMs ?? 60_000;
  const cacheInterruptores = new Map<string, { valores: Record<string, boolean>; hasta: number }>();
  // No mantener vivo el proceso de Node solo por este timer.
  (timer as unknown as { unref?: () => void })?.unref?.();

  return {
    /** Una acción de negocio: venta, factura, ajuste de stock, reporte... */
    evento(clienteId: string | number, modulo: string, accion: string, datos?: Record<string, unknown>, usuarioId?: string) {
      encolar('eventos', { clienteId: String(clienteId), modulo, accion, datos, usuarioId, fecha: new Date().toISOString() });
    },
    /** "Sigo vivo" de un dispositivo. Llamar cada 30–60 s por dispositivo. */
    latido(clienteId: string | number, dispositivoId: string, datos: DatosLatido = {}) {
      encolar('latidos', { clienteId: String(clienteId), dispositivoId, ...datos, fecha: new Date().toISOString() });
    },
    /** Alta o actualización de un cliente (al crearlo, cambiar de plan, darlo de baja). */
    cliente(clienteId: string | number, datos: DatosCliente) {
      encolar('clientes', { clienteId: String(clienteId), ...datos });
    },
    /** El equipo se apagó a propósito (ej: cierre de caja). No genera alertas; el próximo latido lo vuelve a poner en línea. */
    apagado(clienteId: string | number, dispositivoId: string, datos: DatosLatido = {}) {
      encolar('latidos', { clienteId: String(clienteId), dispositivoId, ...datos, apagado: true, fecha: new Date().toISOString() });
    },
    /**
     * Alerta detectada por el propio proyecto (ej: folios del SII por agotarse). Usa `clave` para poder cerrarla después.
     * `datos` va con el detalle estructurado: en una solicitud de módulos ({ modulos: ['rrhh'], plan: 'Total' }) permite aprobarla de un clic.
     */
    alerta(severidad: 'critica' | 'alta' | 'media' | 'baja', mensaje: string, clienteId?: string | number, clave?: string, datos?: Record<string, unknown>) {
      encolar('alertas', { severidad, mensaje, clienteId: clienteId === undefined ? undefined : String(clienteId), clave, ...(datos ? { datos } : {}) });
    },
    /** La condición de una alerta con esa clave ya no se cumple: la supersuite la cierra. */
    resolverAlerta(clave: string, clienteId?: string | number) {
      encolar('alertas', { clave, resuelta: true, clienteId: clienteId === undefined ? undefined : String(clienteId) });
    },
    /** Un usuario está conectado (al iniciar sesión y cada ~60 s mientras usa la app). Solo un id opaco: nunca correo ni nombre. */
    presencia(clienteId: string | number, usuarioId: string | number) {
      encolar('presencia', { clienteId: String(clienteId), usuarioId: String(usuarioId), fecha: new Date().toISOString() });
    },
    /** Fuerza el envío (antes de apagar el servidor, o al final de cada request en serverless). Nunca lanza. */
    async flush() { pausaHasta = 0; await vaciar(); },
    /** Cuántos elementos esperan envío (útil para depurar). */
    pendientes() { return Object.values(colas).reduce((a, q) => a + q.length, 0); },
    async cerrar() { if (timer) clearInterval(timer); for (const d of escuchas) d(); pausaHasta = 0; await vaciar(); },

    /**
     * Escucha las órdenes del panel SaaS: cada `intervaloMs` (default 5 s) pide las pendientes, las
     * aplica con tu manejador y confirma el resultado. Devuelve una función para dejar de escuchar.
     *   monitor.escucharOrdenes({
     *     'modulo.activar': async (o) => { await activarModulo(o.clienteId!, String(o.datos.modulo)); },
     *     'cuenta.suspender': async (o) => { await suspender(o.clienteId!); return { mensaje: 'Suspendida' }; }
     *   });
     * Los manejadores deben ser idempotentes: si una confirmación se pierde, la orden se reentrega.
     */
    escucharOrdenes(manejador: ManejadorOrdenes, opciones: { intervaloMs?: number } = {}) {
      if (op.desactivado) return () => undefined;
      void procesarOrdenes(manejador);
      const t = setInterval(() => { void procesarOrdenes(manejador); }, Math.max(1000, opciones.intervaloMs ?? 5000));
      (t as unknown as { unref?: () => void }).unref?.();
      const detener = () => { clearInterval(t); escuchas.delete(detener); };
      escuchas.add(detener);
      return detener;
    },
    /** Una sola vuelta de órdenes (serverless: llámala desde un cron cada minuto). Devuelve cuántas atendió. Nunca lanza. */
    procesarOrdenes,

    /** Interruptores de una empresa, ya evaluados ({ clave: true|false }). Se guardan en memoria `interruptoresCacheMs`. Si la supersuite no responde, devuelve lo último conocido (o {}). */
    async interruptores(clienteId: string | number): Promise<Record<string, boolean>> {
      const id = String(clienteId);
      const c = cacheInterruptores.get(id);
      if (c && c.hasta > Date.now()) return c.valores;
      if (op.desactivado) return c?.valores ?? {};
      const r = await llamar<{ interruptores: Record<string, boolean> }>(`/ingesta/interruptores?clienteId=${encodeURIComponent(id)}`, { method: 'GET' });
      if (!r) return c?.valores ?? {};
      cacheInterruptores.set(id, { valores: r.interruptores, hasta: Date.now() + cacheMs });
      return r.interruptores;
    },
    /** ¿Está encendido este interruptor para esta empresa? Si no se sabe (supersuite caída, clave nueva), `porDefecto`. */
    async interruptor(clienteId: string | number, clave: string, porDefecto = false): Promise<boolean> {
      const v = (await this.interruptores(clienteId))[clave];
      return typeof v === 'boolean' ? v : porDefecto;
    }
  };
}

export type ClienteSupersuite = ReturnType<typeof crearSupersuite>;
