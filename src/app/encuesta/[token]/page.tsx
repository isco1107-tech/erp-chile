import type { Metadata } from 'next';
import { headers } from 'next/headers';
import SurveyClient from '@/components/customer-care/SurveyClient';
import { PublicStatus } from '@/components/public/PublicShell';
import { checkRateLimit, SURVEY_VIEW_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { getClientIp } from '@/lib/security/cloudflare';
import { getPublicSurvey } from '@/modules/customer-care/services/customer-care.service';
import PublicPrivacyFooter from '@/components/legal/PublicPrivacyFooter';

export const metadata: Metadata = { title: 'Tu opinión nos importa', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function SurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = getClientIp(await headers()) ?? 'unknown';
  if (!checkRateLimit(ip, SURVEY_VIEW_RATE_LIMIT).allowed) {
    return <PublicStatus accent="gold" variant="error" title="Demasiadas consultas" message="Espera unos minutos y vuelve a intentarlo." />;
  }
  const view = await getPublicSurvey(token);
  if (!view) {
    return <PublicStatus accent="gold" variant="error" title="Enlace no válido" message="Revisa que el enlace esté completo o pídelo de nuevo a quien te lo envió." />;
  }
  if (view.answered) {
    return <PublicStatus accent="gold" variant="success" title="¡Gracias!" message={`Ya recibimos tu opinión sobre ${view.companyName}.`} />;
  }
  return (
    <>
      <SurveyClient token={token} companyName={view.companyName} intro={view.intro} />
      <PublicPrivacyFooter flow="encuesta" token={token} />
    </>
  );
}
