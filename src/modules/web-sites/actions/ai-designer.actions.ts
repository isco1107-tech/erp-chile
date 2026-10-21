'use server';

import { createHash } from 'node:crypto';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { captureException } from '@/lib/observability';
import { designerRequestSchema, designerSystemPrompt, designImages, parseDesignerProposal, type DesignerProposal } from '@/lib/web-sites/ai-designer';
import { getWebSite } from '../services/web-sites.service';
import { getProject } from '@/modules/projects/services/projects.service';
import { generateAgentText } from '@/modules/agents/services/gemini-agent';
import { DESIGNER_MAX_OUTPUT_TOKENS, resolveAgentModel } from '@/modules/agents/services/model-tiers';
import { allBlocks } from '@/lib/web-sites/site';
import { blockImageUrls } from '@/lib/web-sites/blocks';

type Result = { success: true; data: DesignerProposal } | { success: false; error: string };

/** Generación sin escrituras: aplicar al editor y guardar siguen siendo decisiones del usuario. */
export async function proposeSiteDesignAction(input: unknown): Promise<Result> {
  let companyId: string | undefined;
  try {
    const parsed = designerRequestSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Revisa el requerimiento' };
    const request = parsed.data;
    const session = await requireAuthWithPermission(request.target === 'web' ? 'websites:write' : request.target.startsWith('academy') ? 'academy:manage' : 'projects:write');
    companyId = session.companyId;
    const allowedImages = designImages(request.current);
    let name = request.target.startsWith('academy') ? 'Academia' : '';
    if (request.target === 'web') {
      const site = await getWebSite(companyId, request.resourceId);
      if (!site) return { success: false, error: 'Sitio o página no encontrado' };
      name = site.name;
      allowedImages.push(...allBlocks(site.document).flatMap(blockImageUrls), ...site.assets.map((asset) => asset.url));
    } else if ((request.target === 'event' || request.target === 'event-studio')) {
      const project = await getProject(companyId, request.resourceId);
      if (!project) return { success: false, error: 'Certamen o evento no encontrado' };
      name = project.name;
    }
    if (JSON.stringify(request.current).length > 180_000) return { success: false, error: 'La página es demasiado grande para una sola propuesta. Reduce el contenido antes de pedir la generación.' };
    const limited = checkRateLimit(companyId, { prefix: 'site-designer-ai', limit: 5, windowMs: 60_000 });
    if (!limited.allowed) return { success: false, error: 'Ya solicitaste varios diseños. Espera un minuto y vuelve a intentarlo.' };
    if (!process.env.GEMINI_API_KEY && !process.env.NVIDIA_API_KEY && !process.env.EXTRA_LLM_API_KEY) return { success: false, error: 'El asistente necesita GEMINI_API_KEY, NVIDIA_API_KEY o EXTRA_LLM_API_KEY configurada en el servidor.' };
    const systemPrompt = designerSystemPrompt(request);
    const userPrompt = JSON.stringify({ name, requirement: request.instruction, current: request.current });
    // Reintentar la misma petición (doble clic, "intentar nuevamente") no debe gastar cuota de nuevo.
    const cacheKey = `${companyId}:${createHash('sha256').update(systemPrompt).update('\0').update(userPrompt).digest('hex')}`;
    let text = recentResponses.get(cacheKey);
    if (text === undefined) {
      text = await generateAgentText(systemPrompt, userPrompt, 'reasoning', {
        geminiModel: process.env.GEMINI_MODEL_WEB_DESIGNER?.trim() || resolveAgentModel('lite'),
        maxOutputTokens: DESIGNER_MAX_OUTPUT_TOKENS,
        json: true,
        extraProvider: true,
      });
    }
    // Solo se recuerda una respuesta que pasó la validación: una inválida debe poder regenerarse.
    const proposal = parseDesignerProposal(text, request, allowedImages);
    rememberResponse(cacheKey, text);
    return { success: true, data: proposal };
  } catch (error) {
    const auth = authErrorMessage(error);
    if (auth) return { success: false, error: auth };
    captureException(error, { module: 'sitios-web', companyId, extra: { action: 'ai-design-proposal' } });
    // Solo mensajes propios de validación; nunca exponer respuestas del proveedor o sus credenciales.
    if (error instanceof Error && /^(La IA|La propuesta|La IA no|La propuesta es)/.test(error.message)) return { success: false, error: error.message };
    return { success: false, error: providerFailureMessage(error) };
  }
}

const RESPONSE_TTL_MS = 10 * 60_000;
const RESPONSE_CACHE_MAX = 20;
const recentResponses = new Map<string, string>();
const responseTimers = new Map<string, number>();

function rememberResponse(key: string, text: string): void {
  const now = Date.now();
  for (const [stored, at] of responseTimers) {
    if (now - at > RESPONSE_TTL_MS || responseTimers.size >= RESPONSE_CACHE_MAX) {
      recentResponses.delete(stored);
      responseTimers.delete(stored);
    }
  }
  recentResponses.set(key, text);
  responseTimers.set(key, now);
}

/** Dice qué falló sin exponer el detalle ni las credenciales del proveedor (eso va a observabilidad). */
function providerFailureMessage(error: unknown): string {
  const status = (error as { status?: number; code?: number } | null)?.status ?? (error as { code?: number } | null)?.code;
  const name = (error as { name?: string } | null)?.name;
  if (status === 429) return 'La cuota gratuita de IA se agotó por ahora. Espera unos minutos e inténtalo de nuevo, o pide al administrador configurar otro proveedor.';
  if (status === 401 || status === 403) return 'La clave de IA del servidor no es válida o no tiene acceso. Avisa al administrador.';
  if (status === 404) return 'El modelo de IA configurado ya no existe. Avisa al administrador para actualizar el modelo.';
  if (name === 'TimeoutError' || name === 'AbortError') return 'La IA tardó demasiado en responder. Pide un cambio más acotado o inténtalo de nuevo.';
  return 'No se pudo generar la propuesta. Inténtalo de nuevo en unos minutos; si persiste, avisa al administrador.';
}
