import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import LegalDocumentLayout from '@/components/legal/LegalDocumentLayout';
import DataSubjectRequestForm from '@/components/privacy/DataSubjectRequestForm';
import { resolvePrivacyPortal } from '@/modules/data-protection/services/requests.service';
import { REQUEST_RESPONSE_DAYS } from '@/lib/privacy/constants';

export const metadata: Metadata = { title: 'Ejerce tus derechos sobre tus datos personales', robots: { index: false, follow: false } };

/**
 * Formulario público de derechos del titular (Ley 21.719). La empresa sale
 * SOLO del token de la URL; un enlace inválido, de una empresa suspendida o
 * regenerado responde 404.
 */
export default async function PrivacyRightsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePrivacyPortal(token);
  if (!portal) notFound();

  return (
    <LegalDocumentLayout
      eyebrow={portal.companyName}
      title="Ejerce tus derechos sobre tus datos personales"
      lastUpdated="2 de octubre de 2026"
      backHref="/politica-privacidad"
      backLabel="Ver la política de privacidad"
    >
      <p>
        Tienes derecho a saber qué datos tuyos trata {portal.companyName}, a corregirlos, a pedir que los eliminemos, a oponerte a ciertos usos, a
        llevártelos en un formato estructurado y a pedir que se suspenda su uso mientras se resuelve un reclamo.
      </p>
      <p>
        Responderemos dentro de {REQUEST_RESPONSE_DAYS} días corridos desde que recibamos tu solicitud. Si es compleja, ese plazo puede prorrogarse una
        vez y te explicaremos el motivo. Si no estás conforme con la respuesta, puedes reclamar ante la Agencia de Protección de Datos Personales.
      </p>
      <DataSubjectRequestForm token={token} companyName={portal.companyName} />
    </LegalDocumentLayout>
  );
}
