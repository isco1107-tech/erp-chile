'use server';

import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { captureException } from '@/lib/observability';
import { designerRequestSchema, designerSystemPrompt, designImages, parseDesignerProposal, type DesignerProposal } from '@/lib/web-sites/ai-designer';
import { getWebSite } from '../services/web-sites.service';
import { getProject } from '@/modules/projects/services/projects.service';
import { generateAgentText } from '@/modules/agents/services/gemini-agent';
import { resolveAgentModel } from '@/modules/agents/services/model-tiers';
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
    if (!process.env.GEMINI_API_KEY && !process.env.NVIDIA_API_KEY) return { success: false, error: 'El asistente necesita GEMINI_API_KEY o NVIDIA_API_KEY configurada en el servidor.' };
    const text = await generateAgentText(designerSystemPrompt(request), JSON.stringify({ name, requirement: request.instruction, current: request.current }), 'reasoning', { geminiModel: process.env.GEMINI_MODEL_WEB_DESIGNER?.trim() || resolveAgentModel('lite') });
    return { success: true, data: parseDesignerProposal(text, request, allowedImages) };
  } catch (error) {
    const auth = authErrorMessage(error);
    if (auth) return { success: false, error: auth };
    captureException(error, { module: 'sitios-web', companyId, extra: { action: 'ai-design-proposal' } });
    // Solo mensajes propios de validación; nunca exponer respuestas del proveedor o sus credenciales.
    if (error instanceof Error && /^(La IA|La propuesta|La IA no|La propuesta es)/.test(error.message)) return { success: false, error: error.message };
    return { success: false, error: 'No se pudo generar la propuesta. Revisa la disponibilidad y cuota de Gemini/NVIDIA e intenta nuevamente.' };
  }
}
