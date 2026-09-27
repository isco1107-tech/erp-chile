#!/usr/bin/env node
/**
 * Servidor MCP (stdio, sin dependencias) que deja a Claude Code delegar
 * tareas mecánicas al modelo MÁS POTENTE disponible, para ahorrar sus
 * propios tokens sin sacrificar calidad: el ahorro viene de que Claude no
 * gasta su propio contexto leyendo o redactando lo voluminoso, no de usar un
 * modelo débil.
 *
 * Dos proveedores, ambos con API compatible con OpenAI:
 * - NVIDIA (build.nvidia.com): catálogo con modelos gratuitos. Se prefiere
 *   cuando hay `NVIDIA_API_KEY`, porque no consume saldo.
 * - OpenRouter: de pago, con más variedad de modelos. Respaldo cuando NVIDIA
 *   no está configurado, o cuando se pide `provider: "openrouter"` a propósito
 *   (por ejemplo, el modelo más grande de todos está ahí y no en NVIDIA).
 *
 * Elección del modelo: si no se fija uno por variable de entorno o por
 * argumento, el servidor consulta `GET {baseUrl}/models` del proveedor y
 * elige automáticamente el más grande —por cantidad de parámetros del
 * nombre del modelo (ej. "405b"), y si no hay pistas de tamaño, por el
 * contexto más largo o el precio más alto como aproximación de potencia—.
 * Se cachea por proceso: el servidor MCP vive mientras dura la sesión de
 * Claude Code, así que no vuelve a consultar el catálogo en cada llamada.
 *
 * Por qué lee los archivos él mismo: si Claude tuviera que leer un archivo
 * largo para pasárselo al otro modelo, el contenido igual entraría a su
 * contexto y no se ahorraría nada. Acá Claude pasa solo rutas; el archivo va
 * directo al proveedor elegido y a Claude vuelve únicamente la respuesta corta.
 *
 * Configuración (variables de entorno de quien abre VS Code / Claude Code):
 * - NVIDIA_API_KEY       habilita NVIDIA (gratis) como proveedor.
 * - NVIDIA_MODEL         fija el modelo NVIDIA (si no, se autodetecta el mayor).
 * - OPENROUTER_API_KEY   habilita OpenRouter como proveedor.
 * - OPENROUTER_MODEL     fija el modelo OpenRouter (si no, se autodetecta el mayor).
 * - *_BASE_URL           solo para pruebas (por defecto la API real).
 *
 * Sin ninguna de las dos claves, la herramienta responde con un error claro
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
    fallbackModel: 'deepseek-ai/deepseek-v4-pro',
  },
  openrouter: {
    label: 'OpenRouter',
    keyEnv: 'OPENROUTER_API_KEY',
    baseUrl: (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
    modelEnv: 'OPENROUTER_MODEL',
    fallbackModel: 'deepseek/deepseek-v3.2',
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
export function pickStrongestModel(models) {
  const candidates = models.filter((m) => typeof m?.id === 'string' && !NON_CHAT_MODEL.test(m.id));
  if (candidates.length === 0) return null;

  const withSize = candidates
    .map((m) => ({ model: m, size: parseParamSizeB(m.id) }))
    .filter((entry) => entry.size !== null);
  if (withSize.length > 0) {
    withSize.sort((a, b) => b.size - a.size);
    return withSize[0].model.id;
  }

  const byContext = [...candidates].sort((a, b) => (Number(b.context_length) || 0) - (Number(a.context_length) || 0));
  if (Number(byContext[0]?.context_length) > 0) return byContext[0].id;

  const byPrice = [...candidates].sort((a, b) => (Number(b.pricing?.prompt) || 0) - (Number(a.pricing?.prompt) || 0));
  if (Number(byPrice[0]?.pricing?.prompt) > 0) return byPrice[0].id;

  return candidates[0].id;
}

const strongestModelCache = new Map(); // providerId -> Promise<string> (cacheado por proceso)

async function fetchStrongestModel(providerId) {
  const provider = PROVIDERS[providerId];
  const apiKey = process.env[provider.keyEnv]?.trim();
  try {
    const response = await fetch(`${provider.baseUrl}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(MODELS_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    const models = Array.isArray(json?.data) ? json.data : [];
    const strongest = pickStrongestModel(models);
    if (!strongest) throw new Error('catálogo vacío');
    return strongest;
  } catch {
    // Sin red, catálogo caído, o formato inesperado: seguir andando con el
    // último modelo conocido de gran tamaño en vez de fallar la delegación.
    return provider.fallbackModel;
  }
}

/** Modelo a usar para un proveedor: argumento > variable de entorno > catálogo (cacheado). */
function resolveModel(providerId, explicitModel) {
  if (explicitModel) return Promise.resolve(explicitModel);
  const provider = PROVIDERS[providerId];
  const fromEnv = process.env[provider.modelEnv]?.trim();
  if (fromEnv) return Promise.resolve(fromEnv);
  if (!strongestModelCache.has(providerId)) strongestModelCache.set(providerId, fetchStrongestModel(providerId));
  return strongestModelCache.get(providerId);
}

const TOOL = {
  name: 'delegate_task',
  description:
    'Delega una tarea acotada al modelo MÁS POTENTE disponible (autodetectado del catálogo de NVIDIA u OpenRouter, o gratis si NVIDIA_API_KEY está configurado) y devuelve solo su respuesta. ' +
    'Pasa RUTAS en `files` (el servidor las lee; su contenido no entra a tu contexto). ' +
    'Úsalo para resumir o buscar en archivos/logs largos, borradores mecánicos (fixtures, datos de prueba, textos, traducciones) ' +
    'y primeras pasadas repetitivas. El resultado es un borrador: revísalo antes de aplicarlo. ' +
    'No lo uses para lógica tributaria/DTE/IVA/PMP, seguridad, permisos, multi-tenant ni migraciones.',
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'Instrucción completa y autosuficiente. Pide una respuesta breve y con el formato exacto que necesitas.' },
      files: { type: 'array', items: { type: 'string' }, description: 'Rutas relativas al repo que el modelo debe leer (máx. 200 KB c/u, 600 KB en total).' },
      provider: { type: 'string', enum: ['auto', 'nvidia', 'openrouter'], description: '"auto" (por defecto): NVIDIA si está configurado, si no OpenRouter.' },
      model: { type: 'string', description: 'ID exacto del proveedor elegido; si se omite se usa el modelo más potente del catálogo.' },
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
  if (!first) throw new Error('Falta NVIDIA_API_KEY u OPENROUTER_API_KEY en el entorno donde se abrió Claude Code');
  return first;
}

async function delegate(args) {
  if (typeof args.task !== 'string' || !args.task.trim()) throw new Error('`task` es obligatorio');

  const providerId = pickProvider(args.provider);
  const provider = PROVIDERS[providerId];
  const apiKey = process.env[provider.keyEnv].trim();

  const files = Array.isArray(args.files) ? args.files : [];
  const context = files.length > 0 ? readFiles(files) : '';
  const model = await resolveModel(providerId, typeof args.model === 'string' ? args.model.trim() : '');
  const maxTokens = Math.min(Math.max(Number(args.max_output_tokens) || 2000, 64), 8000);

  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(provider.extraHeaders ?? {}),
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
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

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = json?.error?.message ?? `HTTP ${response.status}`;
    throw new Error(`${provider.label} rechazó la solicitud (${model}): ${detail}`);
  }
  let text = json?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text) throw new Error(`${provider.label} no devolvió texto (${model})`);
  if (text.length > MAX_RESULT_CHARS) text = `${text.slice(0, MAX_RESULT_CHARS)}\n…[recortado a ${MAX_RESULT_CHARS} caracteres]`;

  const usage = json.usage ?? {};
  const cost = typeof usage.cost === 'number' ? ` · US$${usage.cost.toFixed(5)}` : providerId === 'nvidia' ? ' · gratis' : '';
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
            serverInfo: { name: 'model-delegate', version: '3.0.0' },
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
