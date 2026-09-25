/**
 * Rate limiter in-memory con sliding window, pensado para frenar ataques no
 * distribuidos contra endpoints públicos de autenticación.
 *
 * Limitaciones conocidas en Vercel Serverless:
 * - Cada instancia de función tiene su propio `globalThis`, así que un atacante
 *   distribuido cuyas requests caigan en instancias distintas no comparte
 *   contadores. Para rate limiting distribuido real se necesita Vercel WAF o
 *   Upstash Redis.
 * - Dentro de una misma instancia, la protección es real: una ráfaga desde una
 *   sola IP que caiga en la misma instancia se bloquea correctamente.
 *
 * Es "algo es mejor que nada" sin dependencias externas. El comentario explica
 * las limitaciones para que nadie asuma que esto detiene todo.
 */

interface WindowEntry {
  /** Timestamps de cada request dentro de la ventana actual. */
  timestamps: number[];
  /** Ventana propia de esta clave: la limpieza la respeta aunque la dispare otra configuración. */
  windowMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  /** Cuántos requests quedan en la ventana actual. */
  remaining: number;
  /** Cuándo se puede reintentar (epoch ms), si fue bloqueado. */
  retryAfterMs: number | null;
  /** Máximo de requests permitidos en la ventana. */
  limit: number;
}

export interface RateLimitConfig {
  /** Clave que identifica la "dimensión" del rate limit (ej. 'login-ip', 'reset-ip'). */
  prefix: string;
  /** Máximo de requests permitidos dentro de la ventana. */
  limit: number;
  /** Tamaño de la ventana en milisegundos. */
  windowMs: number;
}

// ─── Store global (persiste entre requests dentro de la misma instancia) ─────

const STORE_KEY = '__erp_rate_limit_store__';
const CLEANUP_INTERVAL_MS = 60_000;

interface RateLimitStore {
  entries: Map<string, WindowEntry>;
  lastCleanup: number;
}

function getStore(): RateLimitStore {
  const g = globalThis as unknown as Record<string, RateLimitStore>;
  if (!g[STORE_KEY]) {
    g[STORE_KEY] = { entries: new Map(), lastCleanup: Date.now() };
  }
  return g[STORE_KEY];
}

/**
 * Elimina entradas cuya ventana ya expiró. Se ejecuta como máximo una vez cada
 * `CLEANUP_INTERVAL_MS` para no penalizar cada request.
 *
 * Cada entrada se juzga contra SU propia ventana. Antes se usaba la ventana de
 * la request que disparaba la limpieza: un login (1 min) borraba contadores de
 * una hora (postulaciones, compras públicas) y un atacante podía resetear su
 * propio bloqueo con una request a otra ruta (SEG-09).
 */
function maybeCleanup(store: RateLimitStore, now: number): void {
  if (now - store.lastCleanup < CLEANUP_INTERVAL_MS) return;
  store.lastCleanup = now;

  for (const [key, entry] of store.entries) {
    const newest = entry.timestamps[entry.timestamps.length - 1];
    if (newest === undefined || now - newest > entry.windowMs) {
      store.entries.delete(key);
    }
  }
}

/**
 * Comprueba y registra un intento contra el rate limiter.
 *
 * @param identifier - Clave única (ej. la IP del cliente).
 * @param config     - Configuración de la ventana.
 * @returns          - Si el request fue permitido o bloqueado.
 */
export function checkRateLimit(identifier: string, config: RateLimitConfig): RateLimitResult {
  const store = getStore();
  const now = Date.now();
  const key = `${config.prefix}:${identifier}`;

  maybeCleanup(store, now);

  let entry = store.entries.get(key);
  if (!entry) {
    entry = { timestamps: [], windowMs: config.windowMs };
    store.entries.set(key, entry);
  }

  // Descartar timestamps fuera de la ventana actual (sliding window).
  const windowStart = now - config.windowMs;
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  if (entry.timestamps.length >= config.limit) {
    // Bloqueado: el usuario ha superado el límite.
    const oldestInWindow = entry.timestamps[0]!;
    const retryAfterMs = oldestInWindow + config.windowMs;
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs,
      limit: config.limit,
    };
  }

  // Permitido: registrar el timestamp.
  entry.timestamps.push(now);

  return {
    allowed: true,
    remaining: config.limit - entry.timestamps.length,
    limit: config.limit,
    retryAfterMs: null,
  };
}

/**
 * Consulta si un identificador todavía tiene cupo, SIN registrar un intento.
 * Para límites que solo deben contar lo que salió bien (ej. postulaciones
 * enviadas): se consulta al inicio con esto y se registra con
 * `checkRateLimit` recién cuando la operación tuvo éxito.
 */
export function peekRateLimit(identifier: string, config: RateLimitConfig): RateLimitResult {
  const store = getStore();
  const now = Date.now();
  const entry = store.entries.get(`${config.prefix}:${identifier}`);
  const recent = entry ? entry.timestamps.filter((t) => t > now - config.windowMs) : [];
  if (recent.length >= config.limit) {
    return { allowed: false, remaining: 0, retryAfterMs: recent[0]! + config.windowMs, limit: config.limit };
  }
  return { allowed: true, remaining: config.limit - recent.length, retryAfterMs: null, limit: config.limit };
}

/**
 * Resetea el contador de un identificador. Útil para tests.
 */
export function resetRateLimit(identifier: string, prefix: string): void {
  const store = getStore();
  store.entries.delete(`${prefix}:${identifier}`);
}

/**
 * Limpia todo el store. Solo para tests.
 */
export function clearAllRateLimits(): void {
  const store = getStore();
  store.entries.clear();
}

// ─── Configuraciones predefinidas para rutas de autenticación ────────────────

/** Login: 10 requests por minuto por IP. */
export const LOGIN_RATE_LIMIT: RateLimitConfig = {
  prefix: 'login-ip',
  limit: 10,
  windowMs: 60_000,
};

/** TOTP verification: 10 requests por minuto por IP. */
export const TOTP_RATE_LIMIT: RateLimitConfig = {
  prefix: 'totp-ip',
  limit: 10,
  windowMs: 60_000,
};

/** Password reset: 3 requests cada 5 minutos por IP. */
export const RESET_RATE_LIMIT: RateLimitConfig = {
  prefix: 'reset-ip',
  limit: 3,
  windowMs: 5 * 60_000,
};

/** Postulación pública de candidatas: 5 envíos por hora por IP (Sección 3
 * del módulo — "Límite de envíos por IP contra spam automatizado"). */
export const CANDIDATE_APPLICATION_RATE_LIMIT: RateLimitConfig = {
  prefix: 'candidate-apply-ip',
  limit: 5,
  windowMs: 60 * 60_000,
};

/**
 * Intentos de postulación (válidos o no) por IP. `CANDIDATE_APPLICATION_RATE_LIMIT`
 * cuenta solo las postulaciones enviadas con éxito: antes contaba todo, y una
 * candidata que corregía un error de validación un par de veces (o todo un
 * casting conectado al mismo Wi-Fi) quedaba bloqueada una hora. Este tope
 * más holgado sigue frenando a un bot que martilla el endpoint.
 */
export const CANDIDATE_APPLICATION_ATTEMPT_RATE_LIMIT: RateLimitConfig = {
  prefix: 'candidate-apply-attempt-ip',
  limit: 40,
  windowMs: 60 * 60_000,
};

/** Compra pública de entradas (`/api/public/tickets/[token]/purchase`): 5
 * órdenes por hora por IP — mismo criterio y misma cifra que la postulación
 * de candidatas, es el mismo tipo de endpoint público sin sesión. */
export const TICKET_PURCHASE_RATE_LIMIT: RateLimitConfig = {
  prefix: 'ticket-purchase-ip',
  limit: 5,
  windowMs: 60 * 60_000,
};

/** Formulario "Quiero auspiciar" del micrositio de un certamen
 * (`/api/public/pageants/[slug]/sponsor-lead`): pocas solicitudes legítimas
 * por hora desde una misma conexión; más que eso es spam contra el CRM. */
export const SPONSOR_LEAD_RATE_LIMIT: RateLimitConfig = {
  prefix: 'sponsor-lead-ip',
  limit: 5,
  windowMs: 60 * 60_000,
};

/** Compra pública de votos (`/api/public/votes/[token]/purchase`): mismo
 * criterio que `TICKET_PURCHASE_RATE_LIMIT`. */
export const VOTE_PURCHASE_RATE_LIMIT: RateLimitConfig = {
  prefix: 'vote-purchase-ip',
  limit: 5,
  windowMs: 60 * 60_000,
};

/** Webhook entrante de automatización externa (`POST /api/webhooks`):
 * clave por companyId (no por IP) porque n8n/Zapier suele correr desde IPs
 * fijas de infraestructura compartida entre muchos clientes de ese
 * proveedor — limitar por IP ahí penalizaría a todas las empresas que usan
 * el mismo proveedor de automatización. 60/min alcanza sobrado para
 * conciliación bancaria real y frena un loop de reintentos descontrolado. */
export const N8N_WEBHOOK_RATE_LIMIT: RateLimitConfig = {
  prefix: 'n8n-webhook-company',
  limit: 60,
  windowMs: 60_000,
};

/**
 * Asistente del Manual de Usuario (`/api/ai/manual-assistant`): a diferencia
 * del Copiloto Financiero, este endpoint no exige ningún módulo contratado
 * ni permiso puntual — cualquier usuario autenticado de cualquier empresa
 * puede llamarlo. Todos los endpoints de IA comparten la misma cuota
 * gratuita de Gemini (~10 req/min para TODA la plataforma, ver
 * `gemini-agent.ts`), así que sin un límite por usuario acá, un solo usuario
 * de bajo privilegio podría acaparar esa cuota y dejar sin respuesta al
 * Copiloto/agentes de otras empresas. Por identificador de usuario
 * (`session.id`), no por IP: es una ruta autenticada.
 */
export const MANUAL_ASSISTANT_RATE_LIMIT: RateLimitConfig = {
  prefix: 'manual-assistant-user',
  limit: 5,
  windowMs: 60_000,
};

/** Confirmación de una acción propuesta por el asistente — límite aparte del
 * de `MANUAL_ASSISTANT_RATE_LIMIT` (que cubre las consultas al modelo), para
 * frenar reintentos automatizados contra el endpoint que sí escribe en la
 * base de datos. */
export const MANUAL_ASSISTANT_CONFIRM_RATE_LIMIT: RateLimitConfig = {
  prefix: 'manual-assistant-confirm-user',
  limit: 10,
  windowMs: 60_000,
};

/** Formulario comercial del landing (`POST /api/public/leads`): público y sin
 * sesión, mismo criterio que las postulaciones — 5 solicitudes por hora por IP
 * alcanzan para cualquier persona real y frenan el spam automatizado. */
export const SALES_LEAD_RATE_LIMIT: RateLimitConfig = {
  prefix: 'sales-lead-ip',
  limit: 5,
  windowMs: 60 * 60_000,
};

/** Portal público de pago de cuotas, consulta por RUT
 * (`/api/public/installments/[token]/lookup`): el RUT no es secreto, así que
 * el límite apunta a frenar el barrido de RUTs, no a una familia que
 * consulta varias veces. */
export const INSTALLMENT_LOOKUP_RATE_LIMIT: RateLimitConfig = {
  prefix: 'installment-lookup-ip',
  limit: 30,
  windowMs: 15 * 60_000,
};

/** Portal público de pago de cuotas, creación del cobro en la pasarela. */
export const INSTALLMENT_CHECKOUT_RATE_LIMIT: RateLimitConfig = {
  prefix: 'installment-checkout-ip',
  limit: 10,
  windowMs: 60 * 60_000,
};

/** Página de estado del pago: cada consulta de una orden en curso pregunta a
 * Khipu, y la página refresca sola unos minutos mientras espera. */
export const INSTALLMENT_STATUS_RATE_LIMIT: RateLimitConfig = {
  prefix: 'installment-status-ip',
  limit: 120,
  windowMs: 10 * 60_000,
};

/** Portal del trabajador (`/trabajador/[token]`): lecturas por IP. El token es
 * secreto y largo, así que el límite apunta a frenar barridos, no a quien
 * revisa sus liquidaciones varias veces. */
export const EMPLOYEE_PORTAL_RATE_LIMIT: RateLimitConfig = {
  prefix: 'employee-portal-ip',
  limit: 60,
  windowMs: 15 * 60_000,
};

/** Portal del trabajador: solicitudes de vacaciones o permisos por token. */
export const EMPLOYEE_PORTAL_REQUEST_RATE_LIMIT: RateLimitConfig = {
  prefix: 'employee-portal-request',
  limit: 5,
  windowMs: 60 * 60_000,
};
