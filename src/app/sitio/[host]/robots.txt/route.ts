import { robotsTxt } from '@/lib/hosting/seo-files';
import { captureException } from '@/lib/observability';
import { resolveDomainSeo, SEO_FILE_CACHE } from '../seo';

/** `robots.txt` del dominio propio de un certamen o sitio web (el proxy reescribe `/robots.txt` hasta acá). */
export async function GET(_request: Request, { params }: { params: Promise<{ host: string }> }) {
  const { host } = await params;
  try {
    const seo = await resolveDomainSeo(host);
    if (!seo) return new Response('No encontrado', { status: 404 });
    return new Response(robotsTxt(seo), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': SEO_FILE_CACHE } });
  } catch (error) {
    captureException(error, { module: 'certamen', extra: { host, reason: 'robots-txt' } });
    return new Response('Error interno', { status: 500 });
  }
}
