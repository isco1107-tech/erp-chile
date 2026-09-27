#!/usr/bin/env node
/**
 * Servidor MCP (stdio, sin dependencias) que deja a Claude Code delegar
 * tareas mecánicas a un modelo más barato vía OpenRouter.
 *
 * Por qué lee los archivos él mismo: si Claude tuviera que leer un archivo
 * largo para pasárselo al otro modelo, el contenido igual entraría a su
 * contexto y no se ahorraría nada. Acá Claude pasa solo rutas; el archivo va
 * directo a OpenRouter y a Claude vuelve únicamente la respuesta corta.
 *
 * Configuración (variables de entorno de quien abre VS Code / Claude Code):
 * - OPENROUTER_API_KEY    obligatoria.
 * - OPENROUTER_MODEL      modelo por defecto (tier "cheap").
 * - OPENROUTER_MODEL_CODE modelo para tareas de código (tier "code").
 * - OPENROUTER_BASE_URL   solo para pruebas (por defecto la API real).
 *
 * Seguridad: solo lee archivos dentro del repo y nunca `.env*`, llaves,
 * certificados, `node_modules` ni `.git`. Todo lo que se delega sale del
 * computador hacia OpenRouter y el proveedor del modelo.
 */
import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
const BASE_URL = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
const MODELS = {
  cheap: process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash',
  code: process.env.OPENROUTER_MODEL_CODE || process.env.OPENROUTER_MODEL || 'qwen/qwen3-coder',
};
const MAX_FILE_BYTES = 200_000;
const MAX_TOTAL_BYTES = 600_000;
const MAX_RESULT_CHARS = 16_000;
const TIMEOUT_MS = 180_000;

const BLOCKED_PATH = [
  /(^|\/)\.env(\.|$)/i,
  /(^|\/)(node_modules|\.git|\.next)(\/|$)/,
  /\.(pem|key|p12|pfx|crt|cer|keystore)$/i,
  /(^|\/)(secrets?|credentials?)(\/|\.|$)/i,
  /id_(rsa|ed25519|ecdsa)/i,
];

const TOOL = {
  name: 'openrouter_delegate',
  description:
    'Delega una tarea acotada a un modelo más barato vía OpenRouter y devuelve solo su respuesta. ' +
    'Pasa RUTAS en `files` (el servidor las lee; su contenido no entra a tu contexto). ' +
    'Úsalo para resumir o buscar en archivos/logs largos, borradores mecánicos (fixtures, datos de prueba, textos, traducciones) ' +
    'y primeras pasadas repetitivas. El resultado es un borrador: revísalo antes de aplicarlo. ' +
    'No lo uses para lógica tributaria/DTE/IVA/PMP, seguridad, permisos, multi-tenant ni migraciones.',
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'Instrucción completa y autosuficiente. Pide una respuesta breve y con el formato exacto que necesitas.' },
      files: { type: 'array', items: { type: 'string' }, description: 'Rutas relativas al repo que el modelo debe leer (máx. 200 KB c/u, 600 KB en total).' },
      tier: { type: 'string', enum: ['cheap', 'code'], description: '"cheap" (por defecto) para texto/resúmenes; "code" para generar o analizar código.' },
      model: { type: 'string', description: 'ID exacto de OpenRouter; reemplaza al tier. Opcional.' },
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

async function delegate(args) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('Falta OPENROUTER_API_KEY en el entorno donde se abrió Claude Code');
  if (typeof args.task !== 'string' || !args.task.trim()) throw new Error('`task` es obligatorio');

  const files = Array.isArray(args.files) ? args.files : [];
  const context = files.length > 0 ? readFiles(files) : '';
  const model = typeof args.model === 'string' && args.model.trim() ? args.model.trim() : MODELS[args.tier === 'code' ? 'code' : 'cheap'];
  const maxTokens = Math.min(Math.max(Number(args.max_output_tokens) || 2000, 64), 8000);

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'erp-chile (delegación desde Claude Code)',
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
    throw new Error(`OpenRouter rechazó la solicitud (${model}): ${detail}`);
  }
  let text = json?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text) throw new Error(`OpenRouter no devolvió texto (${model})`);
  if (text.length > MAX_RESULT_CHARS) text = `${text.slice(0, MAX_RESULT_CHARS)}\n…[recortado a ${MAX_RESULT_CHARS} caracteres]`;

  const usage = json.usage ?? {};
  const cost = typeof usage.cost === 'number' ? ` · US$${usage.cost.toFixed(5)}` : '';
  return `${text}\n\n— ${json.model ?? model} · entrada ${usage.prompt_tokens ?? '?'} / salida ${usage.completion_tokens ?? '?'} tokens${cost}`;
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
            serverInfo: { name: 'openrouter-delegate', version: '1.0.0' },
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
