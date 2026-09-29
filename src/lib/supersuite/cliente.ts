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
 */

type Tipo = 'eventos' | 'latidos' | 'clientes' | 'alertas';

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
  const colas: Record<Tipo, unknown[]> = { eventos: [], latidos: [], clientes: [], alertas: [] };
  let enviando = false;
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
    /** Alerta detectada por el propio proyecto (ej: folios del SII por agotarse). Usa `clave` para poder cerrarla después. */
    alerta(severidad: 'critica' | 'alta' | 'media' | 'baja', mensaje: string, clienteId?: string | number, clave?: string) {
      encolar('alertas', { severidad, mensaje, clienteId: clienteId === undefined ? undefined : String(clienteId), clave });
    },
    /** La condición de una alerta con esa clave ya no se cumple: la supersuite la cierra. */
    resolverAlerta(clave: string, clienteId?: string | number) {
      encolar('alertas', { clave, resuelta: true, clienteId: clienteId === undefined ? undefined : String(clienteId) });
    },
    /** Fuerza el envío (antes de apagar el servidor, o al final de cada request en serverless). Nunca lanza. */
    async flush() { pausaHasta = 0; await vaciar(); },
    /** Cuántos elementos esperan envío (útil para depurar). */
    pendientes() { return Object.values(colas).reduce((a, q) => a + q.length, 0); },
    async cerrar() { if (timer) clearInterval(timer); pausaHasta = 0; await vaciar(); }
  };
}

export type ClienteSupersuite = ReturnType<typeof crearSupersuite>;
