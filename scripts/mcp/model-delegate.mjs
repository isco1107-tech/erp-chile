#!/usr/bin/env node
/**
 * Servidor MCP (stdio, sin dependencias) que deja a Claude Code delegar
 * tareas mecánicas al modelo MÁS POTENTE disponible, para ahorrar sus
 * propios tokens sin sacrificar calidad: el ahorro viene de que Claude no
 * gasta su propio contexto leyendo o redactando lo voluminoso, no de usar un
 * modelo débil.
 *
 * Tres proveedores, todos con API compatible con OpenAI, en este orden de
 * preferencia cuando hay más de uno configurado:
 * - NVIDIA (build.nvidia.com): catálogo con modelos gratuitos.
 * - Gemini (Google AI Studio): SOLO el modelo flash de la capa gratuita —
 *   ver nota de seguridad más abajo, nunca se autodetecta "el más potente"
 *   acá porque los modelos Pro de Gemini normalmente sí cobran.
 * - OpenRouter: de pago, con más variedad. Respaldo cuando ninguno de los
 *   dos gratuitos está configurado, o a pedido con `provider: "openrouter"`
 *   (por ejemplo, el modelo más grande de todos está ahí).
 *
 * Elección del modelo en NVIDIA y OpenRouter: si no se fija uno por variable
 * de entorno o por argumento, el servidor consulta `GET {baseUrl}/models`
 * del proveedor y elige automáticamente el más grande —por cantidad de
 * parámetros del nombre del modelo (ej. "405b"), y si no hay pistas de
 * tamaño, por el contexto más largo o el precio más alto como aproximación
 * de potencia—. Se cachea por proceso: el servidor MCP vive mientras dura
 * la sesión de Claude Code, así que no vuelve a consultar el catálogo en
 * cada llamada.
 *
 * Gemini es la excepción a propósito: la suscripción paga de Gemini (Google
 * One / Gemini Advanced) NO da créditos de API — la API se paga aparte, con
 * una key de Google AI Studio que factura por su cuenta. Para no arriesgar
 * un cobro inesperado, Gemini nunca autodetecta "el más potente": usa
 * siempre el modelo fijo de `GEMINI_MODEL` (flash, capa gratuita) salvo que
 * se pida `model` explícito a propósito en la llamada.
 *
 * Por qué lee los archivos él mismo: si Claude tuviera que leer un archivo
 * largo para pasárselo al otro modelo, el contenido igual entraría a su
 * contexto y no se ahorraría nada. Acá Claude pasa solo rutas; el archivo va
 * directo al proveedor elegido y a Claude vuelve únicamente la respuesta corta.
 *
 * Configuración (variables de entorno de quien abre VS Code / Claude Code):
 * - NVIDIA_API_KEY       habilita NVIDIA (gratis) como proveedor.
 * - NVIDIA_MODEL         fija el modelo NVIDIA (si no, se autodetecta el mayor).
 * - GEMINI_API_KEY       habilita Gemini como proveedor (de Google AI Studio,
 *                        NO la suscripción Gemini Advanced/Google One).
 * - GEMINI_MODEL         modelo Gemini a usar; por defecto uno de la capa
 *                        gratuita. Cambiarlo a un modelo Pro es decisión del
 *                        desarrollador y puede generar cobro.
 * - OPENROUTER_API_KEY   habilita OpenRouter como proveedor.
 * - OPENROUTER_MODEL     fija el modelo OpenRouter (si no, se autodetecta el mayor).
 * - *_BASE_URL           solo para pruebas (por defecto la API real).
 * - NODE_USE_ENV_PROXY=1 (ya fijado en `.mcp.json`): el `fetch` de Node no lee
 *                        HTTPS_PROXY por su cuenta. En una sesión en la nube
 *                        con salida por proxy, sin esta variable NVIDIA y
 *                        OpenRouter responden 403 aunque la red los permita.
 *
 * Si el modelo elegido ya no existe (410), no está habilitado para la key
 * (404) o no hay créditos para él (402), se prueba el siguiente del catálogo.
 * Con una key de OpenRouter de capa gratuita solo se eligen modelos `:free`.
 *
 * Sin ninguna clave configurada, la herramienta responde con un error claro
 * y Claude sigue haciendo el trabajo él mismo.
 *
 * Seguridad: solo lee archivos dentro del repo y nunca `.env*`, llaves,
 * certificados, `node_modules` ni `.git`. Todo lo que se delega sale del
 * computador hacia el proveedor elegido y el modelo que aloja.
 */
import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));

const PROVIDERS = {
  nvidia: {
    label: 'NVIDIA (build.nvidia.com)',
    keyEnv: 'NVIDIA_API_KEY',
    baseUrl: (process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, ''),
    modelEnv: 'NVIDIA_MODEL',
    // Se usa solo si NVIDIA_MODEL no está fijado Y la autodetección por catálogo falla
    // (por ejemplo, sin red). Confirmar el catálogo vigente en build.nvidia.com.
    // Lista ordenada: si el primero ya no existe (404/410), se prueba el siguiente.
    fallbackModels: ['nvidia/nemotron-3-ultra-550b-a55b', 'z-ai/glm-5.3'],
  },
  gemini: {
    label: 'Gemini (Google AI Studio)',
    keyEnv: 'GEMINI_API_KEY',
    baseUrl: (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/$/, ''),
    modelEnv: 'GEMINI_MODEL',
    // A propósito NUNCA se autodetecta "el más potente": los modelos Pro de
    // Gemini facturan aparte de cualquier suscripción. Este es el modelo que
    // se usa siempre, salvo que el desarrollador pida uno distinto a mano.
    // Mismo nombre de flash que ya usa la app (src/modules/agents/services/
    // model-tiers.ts): confirmar el vigente en ai.google.dev si cambió.
    fixedModel: true,
    freeModel: 'gemini-3.6-flash',
  },
  openrouter: {
    label: 'OpenRouter',
    keyEnv: 'OPENROUTER_API_KEY',
    baseUrl: (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
    modelEnv: 'OPENROUTER_MODEL',
    fallbackModels: ['deepseek/deepseek-v3.2'],
    // Una key de capa gratuita (sin créditos) solo puede usar modelos `:free`:
    // cualquier otro responde 402 apenas el prompt supera unos miles de tokens.
    freeFallbackModels: ['nvidia/nemotron-3-ultra-550b-a55b:free', 'qwen/qwen3.8-27b:free'],
    extraHeaders: { 'X-Title': 'erp-chile (delegación desde Claude Code)' },
  },
};

const MAX_FILE_BYTES = 200_000;
const MAX_TOTAL_BYTES = 600_000;
const MAX_RESULT_CHARS = 16_000;
const TIMEOUT_MS = 180_000;
const MODELS_TIMEOUT_MS = 15_000;

const BLOCKED_PATH = [
  /(^|\/)\.env(\.|$)/i,
  /(^|\/)(node_modules|\.git|\.next)(\/|$)/,
  /\.(pem|key|p12|pfx|crt|cer|keystore)$/i,
  /(^|\/)(secrets?|credentials?)(\/|\.|$)/i,
  /id_(rsa|ed25519|ecdsa)/i,
];

// Modelos que aparecen en el catálogo pero no sirven para "la tarea más
// potente": no son de chat/instrucciones (embeddings, moderación, voz, etc.).
const NON_CHAT_MODEL = /(embed|moderation|guard|rerank|whisper|\btts\b|speech|safety|vision-only|ocr)/i;

/** Proveedores con API key configurada, en orden de preferencia (gratis primero). */
function availableProviders(env = process.env) {
  return Object.entries(PROVIDERS)
    .filter(([, cfg]) => Boolean(env[cfg.keyEnv]?.trim()))
    .map(([id]) => id);
}

/**
 * Tamaño en miles de millones de parámetros que se lee del propio nombre del
 * modelo (ej. "llama-3.1-405b-instruct" → 405, "qwen3-235b-a22b" → 235). Es
 * una aproximación —no un benchmark— pero es la señal de "potencia" más
 * confiable que da el catálogo sin credenciales de evaluación externas.
 * Exportado para pruebas.
 */
export function parseParamSizeB(modelId) {
  const matches = [...modelId.matchAll(/(\d+(?:\.\d+)?)\s*b(?:[^a-z0-9]|$)/gi)];
  if (matches.length === 0) return null;
  return Math.max(...matches.map((m) => Number.parseFloat(m[1])));
}

/**
 * Elige el modelo "más potente" de una lista `{id, context_length?, pricing?}`
 * devuelta por `GET /models`. Orden: 1) más parámetros según el nombre,
 * 2) si nadie da esa pista, más contexto, 3) si tampoco hay contexto, precio
 * de entrada más alto (en un catálogo de pago, un precio más alto suele
 * corresponder a un modelo más grande). Exportado para pruebas.
 */
export function rankModels(models) {
  const candidates = models.filter((m) => typeof m?.id === 'string' && !NON_CHAT_MODEL.test(m.id));
  if (candidates.length === 0) return [];

  const withSize = candidates
    .map((m) => ({ model: m, size: parseParamSizeB(m.id) }))
    .filter((entry) => entry.size !== null);
  if (withSize.length > 0) {
    withSize.sort((a, b) => b.size - a.size);
    return withSize.map((entry) => entry.model.id);
  }

  const byContext = [...candidates].sort((a, b) => (Number(b.context_length) || 0) - (Number(a.context_length) || 0));
  if (Number(byContext[0]?.context_length) > 0) return byContext.map((m) => m.id);

  const byPrice = [...candidates].sort((a, b) => (Number(b.pricing?.prompt) || 0) - (Number(a.pricing?.prompt) || 0));
  if (Number(byPrice[0]?.pricing?.prompt) > 0) return byPrice.map((m) => m.id);

  return candidates.map((m) => m.id);
}

/** El primero de `rankModels`, o null. Exportado para pruebas. */
export function pickStrongestModel(models) {
  return rankModels(models)[0] ?? null;
}

// Cuántos candidatos del catálogo se prueban si el primero falla con 404/410
// (retirado o no habilitado para la cuenta) o 402 (sin créditos).
const MAX_MODEL_CANDIDATES = 4;

const rankedModelsCache = new Map(); // providerId -> Promise<string[]> (cacheado por proceso)

/** ¿La key de OpenRouter es de capa gratuita (sin créditos)? */
async function isOpenRouterFreeTier(provider, apiKey) {
  try {
    const response = await fetch(`${provider.baseUrl}/key`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(MODELS_TIMEOUT_MS),
    });
    if (!response.ok) return false;
    const json = await response.json();
    return json?.data?.is_free_tier === true;
  } catch {
    return false;
  }
}

async function fetchRankedModels(providerId) {
  const provider = PROVIDERS[providerId];
  const apiKey = process.env[provider.keyEnv]?.trim();
  const freeOnly = providerId === 'openrouter' && apiKey ? await isOpenRouterFreeTier(provider, apiKey) : false;
  const fallback = freeOnly ? provider.freeFallbackModels : provider.fallbackModels;
  try {
    const response = await fetch(`${provider.baseUrl}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(MODELS_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    const models = Array.isArray(json?.data) ? json.data : [];
    const ranked = rankModels(freeOnly ? models.filter((m) => typeof m?.id === 'string' && m.id.endsWith(':free')) : models);
    if (ranked.length === 0) throw new Error('catálogo vacío');
    // Los de respaldo quedan al final: si todo el tope del catálogo falla, siguen ahí.
    return [...new Set([...ranked.slice(0, MAX_MODEL_CANDIDATES), ...fallback])];
  } catch {
    // Sin red, catálogo caído, o formato inesperado: seguir andando con los
    // últimos modelos conocidos de gran tamaño en vez de fallar la delegación.
    return fallback;
  }
}

/**
 * Modelos a probar, en orden, para un proveedor: argumento > variable de entorno > (según
 * el proveedor) catálogo autodetectado o modelo fijo de la capa gratuita.
 * `fixedModel: true` (Gemini) nunca consulta el catálogo ni "el más
 * potente": ver la nota de seguridad al inicio del archivo.
 */
function resolveModels(providerId, explicitModel) {
  if (explicitModel) return Promise.resolve([explicitModel]);
  const provider = PROVIDERS[providerId];
  const fromEnv = process.env[provider.modelEnv]?.trim();
  if (fromEnv) return Promise.resolve([fromEnv]);
  if (provider.fixedModel) return Promise.resolve([provider.freeModel]);
  if (!rankedModelsCache.has(providerId)) rankedModelsCache.set(providerId, fetchRankedModels(providerId));
  return rankedModelsCache.get(providerId);
}

const TOOL = {
  name: 'delegate_task',
  description:
    'Delega una tarea acotada a un modelo gratis (NVIDIA o Gemini flash) o, de respaldo, a OpenRouter (de pago), y devuelve solo su respuesta. ' +
    'En NVIDIA/OpenRouter autodetecta el modelo MÁS POTENTE del catálogo; en Gemini usa siempre el modelo gratuito fijo, nunca uno Pro (evita cobros). ' +
    'Pasa RUTAS en `files` (el servidor las lee; su contenido no entra a tu contexto). ' +
    'Úsalo para resumir o buscar en archivos/logs largos, borradores mecánicos (fixtures, datos de prueba, textos, traducciones) ' +
    'y primeras pasadas repetitivas. El resultado es un borrador: revísalo antes de aplicarlo. ' +
    'No lo uses para lógica tributaria/DTE/IVA/PMP, seguridad, permisos, multi-tenant ni migraciones.',
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'Instrucción completa y autosuficiente. Pide una respuesta breve y con el formato exacto que necesitas.' },
      files: { type: 'array', items: { type: 'string' }, description: 'Rutas relativas al repo que el modelo debe leer (máx. 200 KB c/u, 600 KB en total).' },
      provider: { type: 'string', enum: ['auto', 'nvidia', 'gemini', 'openrouter'], description: '"auto" (por defecto): NVIDIA, si no Gemini, si no OpenRouter, según cuáles tengan API key configurada; si uno falla se intenta el siguiente.' },
      model: { type: 'string', description: 'ID exacto del proveedor elegido; si se omite, NVIDIA/OpenRouter usan el modelo más potente del catálogo y Gemini su modelo gratuito fijo.' },
      max_output_tokens: { type: 'number', description: 'Tope de la respuesta (por defecto 2000, máx. 8000).' },
    },
    required: ['task'],
  },
};

/** Resuelve una ruta del repo o lanza un error legible. Exportado para pruebas. */
export function resolveRepoFile(relative) {
  if (typeof relative !== 'string' || !relative.trim()) throw new Error('Ruta vacía');
  const absolute = path.resolve(REPO_ROOT, relative);
  let real;
  try {
    real = realpathSync(absolute);
  } catch {
    throw new Error(`No existe: ${relative}`);
  }
  const inside = path.relative(REPO_ROOT, real);
  if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) throw new Error(`Fuera del repo: ${relative}`);
  const posix = inside.split(path.sep).join('/');
  if (BLOCKED_PATH.some((pattern) => pattern.test(posix))) throw new Error(`Bloqueado por seguridad: ${relative}`);
  if (!statSync(real).isFile()) throw new Error(`No es un archivo: ${relative}`);
  return { real, posix };
}

function readFiles(files) {
  let total = 0;
  const parts = [];
  for (const file of files) {
    const { real, posix } = resolveRepoFile(file);
    const size = statSync(real).size;
    if (size > MAX_FILE_BYTES) throw new Error(`${posix} pesa ${size} bytes (máx. ${MAX_FILE_BYTES})`);
    total += size;
    if (total > MAX_TOTAL_BYTES) throw new Error(`Los archivos suman más de ${MAX_TOTAL_BYTES} bytes: divide la tarea`);
    parts.push(`<file path="${posix}">\n${readFileSync(real, 'utf8')}\n</file>`);
  }
  return parts.join('\n\n');
}

/** Decide qué proveedor usar. Exportado para pruebas. */
export function pickProvider(requested, env = process.env) {
  if (requested && requested !== 'auto') {
    if (!PROVIDERS[requested]) throw new Error(`Proveedor desconocido: ${requested}`);
    if (!env[PROVIDERS[requested].keyEnv]?.trim()) throw new Error(`Falta ${PROVIDERS[requested].keyEnv} en el entorno para usar ${requested}`);
    return requested;
  }
  const [first] = availableProviders(env);
  if (!first) throw new Error('Falta NVIDIA_API_KEY, GEMINI_API_KEY u OPENROUTER_API_KEY en el entorno donde se abrió Claude Code');
  return first;
}

/**
 * Proveedores a intentar, en orden. Con uno pedido explícitamente, solo ese.
 * En "auto", todos los configurados (gratis primero): si uno falla —key sin
 * acceso al modelo, host bloqueado por la red, cuota agotada— se pasa al
 * siguiente en vez de devolverle el error a Claude. Exportado para pruebas.
 */
export function providerChain(requested, env = process.env) {
  if (requested && requested !== 'auto') return [pickProvider(requested, env)];
  pickProvider('auto', env); // lanza el error legible si no hay ninguna key
  return availableProviders(env);
}

async function delegate(args) {
  if (typeof args.task !== 'string' || !args.task.trim()) throw new Error('`task` es obligatorio');

  const chain = providerChain(args.provider);
  const files = Array.isArray(args.files) ? args.files : [];
  const context = files.length > 0 ? readFiles(files) : '';
  // Un `model` explícito es un ID de un proveedor concreto: no tiene sentido
  // mandarlo a los demás de la cadena.
  const explicitModel = typeof args.model === 'string' ? args.model.trim() : '';
  const attempts = explicitModel ? chain.slice(0, 1) : chain;

  const failures = [];
  for (const providerId of attempts) {
    try {
      const result = await callProvider(providerId, args, context, explicitModel);
      const skipped = failures.length > 0 ? `\n(falló antes: ${failures.join(' | ')})` : '';
      return `${result}${skipped}`;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(failures.join(' | '));
}

// Los modelos de razonamiento (Gemini 3.x flash, DeepSeek, Qwen "thinking")
// descuentan sus tokens de pensamiento del mismo `max_tokens` que la
// respuesta: con el tope justo, la respuesta visible sale cortada. En los
// proveedores gratuitos se suma este margen; en OpenRouter no, porque ahí el
// tope también limita el cobro.
const THINKING_HEADROOM = 8000;

// Estados que dicen "este modelo no, otro sí podría": retirado (410), no
// habilitado para la cuenta (404) o sin créditos para ese modelo (402).
const RETRY_WITH_NEXT_MODEL = new Set([402, 404, 410]);

class ModelUnavailableError extends Error {}

async function callProvider(providerId, args, context, explicitModel) {
  const provider = PROVIDERS[providerId];
  const models = await resolveModels(providerId, explicitModel);
  const skipped = [];
  for (const model of models) {
    try {
      const result = await callModel(providerId, provider, model, args, context);
      return skipped.length > 0 ? `${result}\n(modelos descartados: ${skipped.join(' | ')})` : result;
    } catch (error) {
      if (!(error instanceof ModelUnavailableError)) throw error;
      skipped.push(error.message);
      // El modelo que no existe no debe volver a intentarse en esta sesión.
      if (!explicitModel && rankedModelsCache.has(providerId)) {
        const rest = models.filter((m) => m !== model);
        rankedModelsCache.set(providerId, Promise.resolve(rest));
      }
    }
  }
  throw new Error(`${provider.label}: ningún modelo disponible (${skipped.join(' | ')})`);
}

async function callModel(providerId, provider, model, args, context) {
  const apiKey = process.env[provider.keyEnv].trim();
  const maxTokens = Math.min(Math.max(Number(args.max_output_tokens) || 2000, 64), 8000);
  const free = providerId === 'nvidia' || providerId === 'gemini' || model.endsWith(':free');

  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(provider.extraHeaders ?? {}),
    },
    body: JSON.stringify({
      model,
      max_tokens: free ? maxTokens + THINKING_HEADROOM : maxTokens,
      messages: [
        {
          role: 'system',
          content:
            'Eres un asistente que ejecuta subtareas para otro agente de programación. Responde solo con lo pedido, ' +
            'sin preámbulos, en el formato exacto solicitado. Si algo no se puede determinar con los archivos dados, dilo en una línea en vez de inventar.',
        },
        { role: 'user', content: context ? `${args.task}\n\n${context}` : args.task },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const raw = await response.text().catch(() => '');
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    // Un 403 sin cuerpo JSON suele venir de un proxy o de la política de red
    // del entorno, no del proveedor: decirlo evita culpar a la API key.
    const detail =
      json?.error?.message ?? json?.detail ?? `HTTP ${response.status}${json ? '' : ` sin cuerpo JSON (¿host bloqueado por la red?${raw ? ` ${raw.slice(0, 120)}` : ''})`}`;
    const message = `${provider.label} rechazó la solicitud (${model}): ${detail}`;
    if (RETRY_WITH_NEXT_MODEL.has(response.status)) throw new ModelUnavailableError(message);
    throw new Error(message);
  }
  const choice = json?.choices?.[0];
  let text = choice?.message?.content;
  if (typeof text !== 'string' || !text) {
    const cut = choice?.finish_reason === 'length' ? ': se le acabaron los tokens pensando; repetir con un max_output_tokens mayor' : '';
    throw new Error(`${provider.label} no devolvió texto (${model})${cut}`);
  }
  if (text.length > MAX_RESULT_CHARS) text = `${text.slice(0, MAX_RESULT_CHARS)}\n…[recortado a ${MAX_RESULT_CHARS} caracteres]`;
  // Sin este aviso, una respuesta cortada por el tope parece completa (un JSON
  // a medias, una lista incompleta) y Claude la usaría como si lo fuera.
  if (choice.finish_reason === 'length') {
    text += '\n…[CORTADA: el modelo llegó al tope de tokens; repetir con un max_output_tokens mayor o una tarea más chica]';
  }

  const usage = json.usage ?? {};
  const cost = typeof usage.cost === 'number' ? ` · US$${usage.cost.toFixed(5)}` : free ? ' · gratis' : '';
  return `${text}\n\n— ${provider.label} · ${json.model ?? model} · entrada ${usage.prompt_tokens ?? '?'} / salida ${usage.completion_tokens ?? '?'} tokens${cost}`;
}

// --- Transporte MCP por stdio: JSON-RPC 2.0, un mensaje por línea. ---

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function handle(message) {
  const { id, method, params } = message;
  if (id === undefined || id === null) return; // notificación (p. ej. notifications/initialized)
  try {
    switch (method) {
      case 'initialize':
        return send({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: params?.protocolVersion ?? '2025-06-18',
            capabilities: { tools: {} },
            serverInfo: { name: 'model-delegate', version: '4.2.0' },
          },
        });
      case 'ping':
        return send({ jsonrpc: '2.0', id, result: {} });
      case 'tools/list':
        return send({ jsonrpc: '2.0', id, result: { tools: [TOOL] } });
      case 'tools/call': {
        if (params?.name !== TOOL.name) return send({ jsonrpc: '2.0', id, error: { code: -32602, message: `Herramienta desconocida: ${params?.name}` } });
        try {
          const text = await delegate(params.arguments ?? {});
          return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } });
        } catch (error) {
          const text = error instanceof Error ? error.message : String(error);
          return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError: true } });
        }
      }
      default:
        return send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Método no soportado: ${method}` } });
    }
  } catch (error) {
    send({ jsonrpc: '2.0', id, error: { code: -32603, message: error instanceof Error ? error.message : String(error) } });
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido' } });
        continue;
      }
      void handle(message);
    }
  });
}
