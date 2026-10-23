/**
 * Cuota de la IA de fotos: cuántas lecturas se permiten y cuándo hay que decir
 * "espera un momento".
 *
 * La cuota de Gemini es UNA para toda la plataforma (el tier gratuito ronda las
 * 10 solicitudes por minuto) y la comparten los agentes, el asistente y el
 * escaneo de facturas. Una bodega con varias personas fotografiando una entrega
 * la agotaría en segundos y dejaría sin respuesta a todos los demás. La defensa
 * es no llegar al límite: cada capa recorta antes de que el proveedor responda 429.
 *
 * Esta función es pura: recibe las lecturas recientes (que el servidor saca de la
 * base de datos, no de memoria, porque cada instancia serverless tiene la suya) y
 * decide. Así se puede probar con cualquier combinación de ráfagas.
 */

export interface VisionBudgetConfig {
  /** Lecturas por minuto entre TODAS las empresas. Deja holgura a los demás usos de la IA. */
  platformPerMinute: number;
  /** Lecturas por minuto de una empresa: una bodega ruidosa no ahoga a las otras. */
  companyPerMinute: number;
  /** Lecturas por minuto de una persona. */
  userPerMinute: number;
  /** Tope diario por empresa (costo y abuso). */
  companyPerDay: number;
  /** Cuánto se frena a todos tras un 429 del proveedor. */
  cooldownAfterLimitMs: number;
}

export const DEFAULT_VISION_BUDGET: VisionBudgetConfig = {
  platformPerMinute: 6,
  companyPerMinute: 4,
  userPerMinute: 3,
  companyPerDay: 400,
  cooldownAfterLimitMs: 45_000,
};

export const BUDGET_WINDOW_MS = 60_000;

export type VisionRunStatus = 'RUNNING' | 'DONE' | 'FAILED' | 'LIMITED';

export interface VisionRunRow {
  /** Epoch ms. */
  createdAt: number;
  status: VisionRunStatus;
  companyId: string;
  userId: string | null;
}

export type BudgetScope = 'cooldown' | 'platform' | 'company' | 'user' | 'daily';

export type BudgetDecision = { allowed: true } | { allowed: false; scope: BudgetScope; retryAfterMs: number };

/** Nunca se pide esperar menos que esto: reintentar al instante no sirve de nada. */
const MIN_RETRY_MS = 2_000;

/**
 * Cuánto falta para que quede un lugar libre en la ventana: cuando sale la
 * lectura más antigua de las que ocupan el cupo.
 */
function retryWhenSlotFrees(rows: readonly VisionRunRow[], limit: number, now: number): number {
  const sorted = rows.map((row) => row.createdAt).sort((a, b) => a - b);
  // Con `limit` lugares, el siguiente se libera cuando sale la lectura número (n - limit + 1).
  const blocking = sorted[sorted.length - limit] ?? sorted[0] ?? now;
  return Math.max(MIN_RETRY_MS, blocking + BUDGET_WINDOW_MS - now);
}

export function evaluateVisionBudget(input: {
  now: number;
  /** Lecturas de los últimos `BUDGET_WINDOW_MS` (de cualquier empresa) y las `LIMITED` del período de enfriamiento. */
  recent: readonly VisionRunRow[];
  companyId: string;
  userId: string;
  /** Lecturas de esta empresa en las últimas 24 horas. */
  companyDailyCount: number;
  config?: VisionBudgetConfig;
}): BudgetDecision {
  const { now, recent, companyId, userId, companyDailyCount } = input;
  const config = input.config ?? DEFAULT_VISION_BUDGET;

  // 1. El proveedor ya dijo "basta": nadie pasa hasta que termine el enfriamiento.
  const limitedAt = recent.filter((row) => row.status === 'LIMITED').map((row) => row.createdAt);
  if (limitedAt.length > 0) {
    const until = Math.max(...limitedAt) + config.cooldownAfterLimitMs;
    if (until > now) return { allowed: false, scope: 'cooldown', retryAfterMs: Math.max(MIN_RETRY_MS, until - now) };
  }

  const inWindow = recent.filter((row) => now - row.createdAt < BUDGET_WINDOW_MS);

  if (companyDailyCount >= config.companyPerDay) {
    return { allowed: false, scope: 'daily', retryAfterMs: 30 * 60_000 };
  }

  const userRows = inWindow.filter((row) => row.userId === userId && row.companyId === companyId);
  if (userRows.length >= config.userPerMinute) {
    return { allowed: false, scope: 'user', retryAfterMs: retryWhenSlotFrees(userRows, config.userPerMinute, now) };
  }

  const companyRows = inWindow.filter((row) => row.companyId === companyId);
  if (companyRows.length >= config.companyPerMinute) {
    return { allowed: false, scope: 'company', retryAfterMs: retryWhenSlotFrees(companyRows, config.companyPerMinute, now) };
  }

  if (inWindow.length >= config.platformPerMinute) {
    return { allowed: false, scope: 'platform', retryAfterMs: retryWhenSlotFrees(inWindow, config.platformPerMinute, now) };
  }

  return { allowed: true };
}

function envInt(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

/**
 * Los topes se pueden ajustar sin tocar código (por ejemplo, al pasar a una
 * llave de Gemini de pago). Un valor ausente o absurdo cae al predeterminado.
 */
export function visionBudgetFromEnv(env: Record<string, string | undefined> = process.env): VisionBudgetConfig {
  return {
    platformPerMinute: envInt(env.WAREHOUSE_VISION_PLATFORM_RPM, DEFAULT_VISION_BUDGET.platformPerMinute, 1, 600),
    companyPerMinute: envInt(env.WAREHOUSE_VISION_COMPANY_RPM, DEFAULT_VISION_BUDGET.companyPerMinute, 1, 600),
    userPerMinute: envInt(env.WAREHOUSE_VISION_USER_RPM, DEFAULT_VISION_BUDGET.userPerMinute, 1, 600),
    companyPerDay: envInt(env.WAREHOUSE_VISION_COMPANY_DAILY, DEFAULT_VISION_BUDGET.companyPerDay, 1, 100_000),
    cooldownAfterLimitMs: envInt(env.WAREHOUSE_VISION_COOLDOWN_MS, DEFAULT_VISION_BUDGET.cooldownAfterLimitMs, 5_000, 600_000),
  };
}

/** `false` si el administrador apagó la lectura por foto (`WAREHOUSE_VISION_ENABLED=0`). */
export function visionEnabledFromEnv(env: Record<string, string | undefined> = process.env): boolean {
  const flag = env.WAREHOUSE_VISION_ENABLED?.trim().toLowerCase();
  return flag !== '0' && flag !== 'false' && flag !== 'off';
}
