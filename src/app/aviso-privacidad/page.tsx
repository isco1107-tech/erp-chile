import LegalDocumentLayout from '@/components/legal/LegalDocumentLayout';
import type { Metadata } from 'next';
import { cache, type ReactNode } from 'react';
import { REQUEST_RESPONSE_DAYS } from '@/lib/privacy/constants';
import { LEGAL_BASIS_LABELS, PROCESSING_ACTIVITIES, activitySubprocessors } from '@/lib/privacy/processing-activities';
import { SUBPROCESSORS } from '@/lib/privacy/subprocessors';
import {
  FLOW_ACTIVITY,
  FLOW_LABELS,
  getPublicNoticeInfo,
  isPublicNoticeFlow,
  type PublicNoticeFlow,
} from '@/modules/data-protection/services/public-notice.service';

type SearchParams = Promise<{ flujo?: string | string[]; t?: string | string[] }>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const load = cache(async (rawFlow: string | undefined, rawToken: string | undefined) => {
  if (!isPublicNoticeFlow(rawFlow)) return { flow: null, info: null };
  return { flow: rawFlow, info: await getPublicNoticeInfo(rawFlow, rawToken) };
});

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const params = await searchParams;
  const { flow, info } = await load(first(params.flujo), first(params.t));
  const scope = info?.projectName ?? info?.companyName ?? (flow ? FLOW_LABELS[flow] : 'formularios públicos');
  return { title: `Aviso de privacidad — ${scope}`, robots: { index: false } };
}

/** Lo que cada flujo agrega al aviso general: por qué se piden los datos y qué pasa con el pago. */
const FLOW_DETAIL: Record<PublicNoticeFlow, string> = {
  entradas:
    'Usamos tus datos para emitir tu entrada, enviártela por correo, confirmar el pago y controlar el acceso el día del evento. El código QR de tu entrada es personal: no lo compartas.',
  votos:
    'Usamos tus datos para registrar los votos que compras, confirmar el pago y enviarte el comprobante. Tu correo y teléfono no se publican ni se muestran junto a tus votos.',
  cuotas:
    'Usamos tus datos para identificar las cuotas a pagar, procesar el pago por transferencia a través de Khipu y enviarte el comprobante. No guardamos claves ni credenciales de tu banco: el pago se hace en el sitio de Khipu.',
  auspicio:
    'Usamos los datos de la persona de contacto de la marca para gestionar el contrato de auspicio, sus entregables y sus pagos.',
  sitio:
    'Usamos tus datos solo para responder la consulta o solicitud que enviaste desde este sitio web (contacto, cotización, inscripción o reserva) y para gestionarla en el área que corresponda: ventas, inscripciones o el equipo que te atiende. No te inscribimos en listas de correo sin tu autorización.',
  academia:
    'Usamos los datos de la alumna y, si es menor de edad, de su apoderado, para revisar la inscripción, contactarte, asignar un grupo y llevar la asistencia y las mensualidades. La autorización del uso de imagen es opcional y puedes retirarla cuando quieras.',
  encuesta:
    'Usamos tu respuesta para medir la calidad del servicio y, si la nota es baja, para que la empresa pueda contactarte y resolver el problema.',
};

/**
 * Aviso de privacidad de los formularios públicos (Ley N.° 19.628 y Ley N.°
 * 21.719): entradas, votos, cuotas, portal del auspiciador y encuesta. El
 * texto sale del registro de actividades (`processing-activities.ts`), que
 * describe lo que el código guarda de verdad, y la empresa responsable sale
 * del token del enlace (`public-notice.service.ts`).
 */
export default async function AvisoPrivacidadPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { flow, info } = await load(first(params.flujo), first(params.t));
  const activity = flow ? PROCESSING_ACTIVITIES.find((a) => a.id === FLOW_ACTIVITY[flow]) : undefined;
  const providers = activity ? activitySubprocessors(activity, SUBPROCESSORS) : [];

  const responsible: ReactNode = info ? <strong>{info.companyName}</strong> : 'la empresa u organización que te envió este enlace';
  const writeTo: ReactNode = info?.contactEmail ? <a href={`mailto:${info.contactEmail}`}>{info.contactEmail}</a> : 'los canales de contacto de la organización';
  const rightsUrl = info?.privacyPortalToken ? `/derechos/${info.privacyPortalToken}` : null;

  return (
    <LegalDocumentLayout
      eyebrow={info?.projectName ?? info?.companyName ?? 'Formularios públicos'}
      title={flow ? `Aviso de privacidad — ${FLOW_LABELS[flow]}` : 'Aviso de privacidad'}
      lastUpdated="3 de octubre de 2026"
      backHref="/"
      backLabel="Volver al inicio"
    >
      <p>
        Este aviso explica qué datos personales se recopilan en este formulario, para qué se usan y cómo puedes ejercer tus derechos. Se rige por la Ley
        N.° 19.628 sobre Protección de la Vida Privada y por la Ley N.° 21.719 sobre Protección de Datos Personales, a medida que sus disposiciones entren
        en vigencia.
      </p>

      <h2>1. Responsable</h2>
      <p>
        El responsable de los datos es {responsible}
        {info?.projectName ? <>, organizadora de <strong>{info.projectName}</strong></> : null}
        {info?.companyRut ? <>, RUT {info.companyRut}</> : null}
        {info?.companyAddress ? <>, con domicilio en {info.companyAddress}</> : null}. Puedes escribirle a {writeTo}.
      </p>
      <p>
        El sistema es provisto por Aether ERP, que actúa como encargado del tratamiento: trata los datos solo por cuenta de la organización y siguiendo
        sus instrucciones, sin usarlos para fines propios.
      </p>

      {activity ? (
        <>
          <h2>2. Qué datos se recopilan</h2>
          <ul>
            {activity.dataCategories.map((category) => (
              <li key={category}>{category}</li>
            ))}
          </ul>

          <h2>3. Para qué y con qué fundamento</h2>
          <p>{flow ? FLOW_DETAIL[flow] : activity.purpose}</p>
          <p>Fundamento legal: {activity.legalBasis.map((basis) => LEGAL_BASIS_LABELS[basis].toLowerCase()).join(' y ')}.</p>
          <p>Tus datos no se venden ni se ceden a terceros para publicidad.</p>

          <h2>4. Quiénes más los tratan y dónde</h2>
          <p>La organización se apoya en estos proveedores tecnológicos. Algunos están fuera de Chile, por lo que tus datos pueden transferirse al extranjero:</p>
          <ul>
            {providers.map((provider) => (
              <li key={provider.id}>
                <strong>{provider.name}</strong> — {provider.service}. Ubicación: {provider.location}.
              </li>
            ))}
          </ul>

          <h2>5. Cuánto tiempo se conservan</h2>
          <p>{activity.retention}</p>
        </>
      ) : (
        <>
          <h2>2. Qué datos se recopilan y para qué</h2>
          <p>
            Solo los datos que pide cada formulario, para la finalidad que el formulario indica (comprar una entrada, votar, pagar una cuota,
            responder una encuesta). No se venden ni se ceden a terceros para publicidad.
          </p>
        </>
      )}

      <h2>{activity ? '6' : '3'}. Tus derechos</h2>
      <p>
        Puedes pedir acceso, rectificación, supresión, oposición, portabilidad o bloqueo de tus datos.{' '}
        {rightsUrl ? (
          <>Hazlo en <a href={rightsUrl}>este formulario</a> o escribiendo a {writeTo}. </>
        ) : (
          <>Escribe a {writeTo} indicando tu nombre completo y RUT. </>
        )}
        Se verificará tu identidad antes de responder, dentro de {REQUEST_RESPONSE_DAYS} días corridos (prorrogables si la solicitud es compleja, con
        aviso). Si no quedas conforme, puedes reclamar ante la Agencia de Protección de Datos Personales. Algunos datos, como los de pagos y documentos
        tributarios, deben conservarse por el plazo que exige la ley aunque pidas su supresión.
      </p>

      <h2>{activity ? '7' : '4'}. Cambios a este aviso</h2>
      <p>La fecha de &ldquo;última actualización&rdquo; indica la versión vigente. Los cambios relevantes se informan en este mismo enlace.</p>
    </LegalDocumentLayout>
  );
}
