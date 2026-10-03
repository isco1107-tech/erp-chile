import { readFile } from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';
import { AuthError, TenantInactiveError, getAuthContext } from '@/lib/auth/guards';
import { ROLE_LABELS } from '@/lib/auth/roles';
import { captureException } from '@/lib/observability';
import { checkRateLimitShared } from '@/lib/security/rate-limiter-shared';
import { MANUAL_DOCX_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { getManualSections, sectionScreenshot, type ManualScope } from '@/modules/manual/content';
import { getKnowledgeAsManualSections } from '@/modules/manual/knowledge';
import { buildManualDocx, readImageSize, type ManualDocxImage } from '@/modules/manual/docx';

/**
 * Descarga del Manual de Usuario en Word, con el mismo filtro que la
 * pantalla `/dashboard/manual`: solo los módulos que la empresa contrató y,
 * con `alcance=rol` (por defecto), solo lo que el rol del usuario puede
 * hacer. `alcance=empresa` es el manual completo de lo contratado, para
 * capacitar al equipo; no expone datos de la empresa, solo instrucciones.
 *
 * El proxy no intercepta `/api` (ver `src/proxy.ts`): la autenticación vive
 * acá. Las capturas se leen de `public/manual/screenshots` (incluidas en la
 * función por `outputFileTracingIncludes` en `next.config.js`).
 */

export const runtime = 'nodejs';

const SCREENSHOT_PREFIX = '/manual/screenshots/';

async function loadPublicImage(publicPath: string): Promise<ManualDocxImage | null> {
  // Solo capturas propias del manual: nunca una ruta que salga de esa carpeta.
  if (!publicPath.startsWith(SCREENSHOT_PREFIX) || publicPath.includes('..')) return null;
  try {
    const data = await readFile(path.join(process.cwd(), 'public', publicPath));
    const size = readImageSize(data);
    return size ? { data, ...size } : null;
  } catch {
    // Sección sin captura todavía: el manual sale igual, sin esa imagen.
    return null;
  }
}

function fileSlug(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'empresa'
  );
}

export async function GET(req: Request) {
  let companyId: string | undefined;
  try {
    const session = await getAuthContext();
    companyId = session.companyId;

    const rateLimit = await checkRateLimitShared(session.id, MANUAL_DOCX_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: 'Ya descargaste el manual varias veces seguidas. Espera un minuto y vuelve a intentar.' }, { status: 429 });
    }

    const scope: ManualScope = new URL(req.url).searchParams.get('alcance') === 'empresa' ? 'company' : 'role';
    const sections = getManualSections(scope, session.features, session.permissions);
    const reference = getKnowledgeAsManualSections(session.features, scope === 'role' ? session.permissions : undefined);
    const roleLabel = session.customRoleName ?? ROLE_LABELS[session.role];
    const audience =
      scope === 'company'
        ? 'Manual completo de la empresa: todos los módulos contratados'
        : `Manual de ${session.name} · rol ${roleLabel}: lo que puedes hacer en el sistema`;

    const generatedAt = new Date();
    const buffer = await buildManualDocx({
      companyName: session.companyName,
      audience,
      generatedAt,
      sections,
      reference,
      loadImage: loadPublicImage,
      screenshotOf: sectionScreenshot,
    });

    const date = generatedAt.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
    const filename = `Manual-${scope === 'company' ? 'empresa' : 'mi-rol'}-${fileSlug(session.companyName)}-${date}.docx`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    if (error instanceof TenantInactiveError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    captureException(error, { module: 'manual', companyId, extra: { action: 'docx' } });
    return NextResponse.json({ success: false, error: 'No se pudo generar el manual en Word. Intenta de nuevo en unos minutos.' }, { status: 500 });
  }
}
