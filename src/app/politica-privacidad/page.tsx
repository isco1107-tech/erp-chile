import LegalDocumentLayout from '@/components/legal/LegalDocumentLayout';
import type { Metadata } from 'next';
import { cache, type ReactNode } from 'react';
import { getRegistrationPrivacyInfo } from '@/modules/candidates/services/candidates.service';
import { PRIVACY_POLICY_VERSION, REQUEST_RESPONSE_DAYS } from '@/lib/privacy/constants';
import { PROCESSING_ACTIVITIES, activitySubprocessors } from '@/lib/privacy/processing-activities';
import { SUBPROCESSORS } from '@/lib/privacy/subprocessors';

type SearchParams = Promise<{ certamen?: string | string[] }>;

/** El link de postulación agrega `?certamen=<token>`: con él la política nombra al certamen, su organización y su correo. */
const loadCertamen = cache(async (raw: string | string[] | undefined) => {
  const token = Array.isArray(raw) ? raw[0] : raw;
  if (!token || !/^[A-Za-z0-9_-]{16,128}$/.test(token)) return null;
  return getRegistrationPrivacyInfo(token);
});

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const info = await loadCertamen((await searchParams).certamen);
  return { title: info ? `Política de privacidad — ${info.projectName}` : 'Política de privacidad — postulación a certámenes', robots: { index: false } };
}

/**
 * Política de privacidad de la candidata (Ley N.° 19.628 sobre Protección de
 * la Vida Privada y Ley N.° 21.719 sobre Protección de Datos Personales) —
 * el link `CONFIG.privacidadUrl` del formulario público de postulación
 * (`CandidateRegistrationClient.tsx`) apuntaba acá desde antes, sin que la
 * página existiera todavía. El contenido describe exactamente lo que el
 * código de `src/modules/candidates/` hace hoy (qué datos se piden, cómo se
 * guardan las fotografías, la purga por retención, el registro de accesos) —
 * no una plantilla genérica desconectada de la implementación real.
 *
 * `[ ... ]` marca los datos que identifican a la organización (RUT,
 * domicilio) que esta página no puede inventar — mismo criterio de
 * placeholder que ya usa `contract-template-default.ts` para datos legales
 * que solo la organización conoce. El nombre del certamen, la organización y
 * el correo salen del certamen del link (`?certamen=`), nunca de datos fijos.
 */
export default async function PoliticaPrivacidadPage({ searchParams }: { searchParams: SearchParams }) {
  const info = await loadCertamen((await searchParams).certamen);
  const certamen = info ? <strong>{info.projectName}</strong> : 'el certamen';
  const responsible = info ? (
    <>
      <strong>{info.companyName}</strong>, organizadora de <strong>{info.projectName}</strong>
    </>
  ) : (
    'la organización del certamen'
  );
  const writeTo: ReactNode = info?.contactEmail ? <a href={`mailto:${info.contactEmail}`}>{info.contactEmail}</a> : 'los canales de contacto de la organización';
  const rightsUrl = info?.privacyPortalToken ? `/derechos/${info.privacyPortalToken}` : null;
  const providers = activitySubprocessors(PROCESSING_ACTIVITIES.find((a) => a.id === 'candidates')!, SUBPROCESSORS);

  return (
    <LegalDocumentLayout
      eyebrow={info?.projectName ?? 'Postulación al certamen'}
      title="Política de privacidad"
      lastUpdated="2 de octubre de 2026"
      backHref="/"
      backLabel="Volver al inicio"
    >
      <p>
        Esta política explica qué datos personales recopila la organización de {certamen} (en adelante,
        &ldquo;la organización&rdquo;) a través del formulario público de postulación al certamen, con qué finalidad
        los trata, cómo los protege y qué derechos tiene la titular de esos datos. Se rige por la Ley N.° 19.628 sobre
        Protección de la Vida Privada y por la Ley N.° 21.719 sobre Protección de Datos Personales, a medida que sus
        disposiciones entren en vigencia (1 de diciembre de 2026).
      </p>

      <h2>1. Responsable del tratamiento</h2>
      <p>
        El responsable del tratamiento de los datos recopilados en este formulario es {responsible}, RUT{' '}
        {info?.companyRut ?? '[RUT de la organización]'}, con domicilio en {info?.companyAddress ?? '[domicilio de la organización]'}. Cualquier consulta
        sobre esta política o sobre tus datos personales puede dirigirse a {writeTo}.
      </p>
      <p>
        El sistema en que se guardan los datos es provisto por Aether ERP, que actúa como encargado del tratamiento: los trata solo por cuenta y
        siguiendo las instrucciones de la organización, y no los usa para fines propios.
      </p>

      <h2>2. Qué datos recopilamos</h2>
      <p>Al postular, te pedimos:</p>
      <ul>
        <li>Datos de identificación: nombre completo, RUT y edad.</li>
        <li>Datos de contacto: teléfono, correo electrónico, comuna donde vives e Instagram.</li>
        <li>Por qué quieres participar en el certamen.</li>
        <li>Si eres menor de edad, nombre y RUT de tu madre, padre o apoderado.</li>
        <li>Metadatos técnicos del envío (dirección IP y navegador/dispositivo usado), con fines exclusivos de seguridad — por ejemplo, para prevenir envíos automatizados o fraudulentos.</li>
        <li>La constancia de que aceptaste esta política: la fecha y la versión del texto que viste.</li>
      </ul>
      <p>
        No te pedimos ningún otro dato al inscribirte. Si quedas preseleccionada, la organización puede pedirte más
        información (por ejemplo, fotografías, tallas o, si corresponde al certamen, condiciones médicas o un certificado
        médico) para el desarrollo del certamen, con este mismo resguardo. Los datos de salud son datos sensibles: solo
        se piden cuando son necesarios y se tratan con medidas reforzadas.
      </p>

      <h2>3. Para qué usamos tus datos y con qué fundamento</h2>
      <p>Usamos los datos que entregas exclusivamente para:</p>
      <ul>
        <li>Evaluar tu postulación y gestionar el proceso de selección del certamen (revisión, citación a casting, avance de ronda o descarte).</li>
        <li>Contactarte durante el proceso — por ejemplo, para avisarte de un cambio de etapa o coordinar una actividad.</li>
        <li>Verificar que cumples los requisitos de participación indicados en las bases del certamen (por ejemplo, la edad mínima).</li>
      </ul>
      <p>
        El fundamento es tu consentimiento, que das al marcar la casilla del formulario, y la ejecución de las medidas previas a tu eventual
        participación. Puedes retirar tu consentimiento en cualquier momento, sin costo, escribiéndonos; retirarlo no afecta lo ya realizado, pero
        puede significar que ya no podamos mantener tu postulación.
      </p>
      <p>
        No vendemos tus datos ni los compartimos con terceros ajenos a la organización del certamen, salvo los proveedores tecnológicos descritos más
        abajo, y la obligación legal o el requerimiento de una autoridad competente.
      </p>

      <h2>4. Cómo protegemos tus datos y fotografías</h2>
      <p>
        Las fotografías y documentos que entregas se guardan con una dirección que no se puede adivinar. Solo personal de la organización con un
        permiso específico (distinto del acceso general al listado de postulantes) puede verlas o descargarlas desde el sistema, y cada vez que alguien
        lo hace queda registrado en la bitácora interna del proceso, con fecha y usuario responsable. El acceso al sistema exige contraseña y admite
        verificación en dos pasos.
      </p>

      <h2>5. Quiénes más tratan tus datos y dónde</h2>
      <p>
        Para prestar el servicio, la organización se apoya en proveedores tecnológicos que tratan datos por su cuenta. Varios de ellos están fuera de
        Chile, por lo que tus datos pueden transferirse al extranjero:
      </p>
      <ul>
        {providers.map((provider) => (
          <li key={provider.id}>
            <strong>{provider.name}</strong> — {provider.service}. Ubicación: {provider.location}.
          </li>
        ))}
      </ul>
      <p>La organización procura que sus proveedores apliquen resguardos adecuados para proteger tus datos.</p>

      <h2>6. Cuánto tiempo conservamos tus datos</h2>
      <p>
        Mientras tu postulación esté activa (en revisión, citada a casting, preseleccionada, finalista o ganadora),
        conservamos tus datos para el desarrollo normal del certamen. Si tu postulación es descartada, tus datos y
        fotografías se eliminan de forma automática pasado un período de retención definido por la organización —
        no quedan indefinidamente en el sistema por el solo hecho de haber postulado. Los datos de contratos y pagos
        se conservan por el plazo que exige la normativa tributaria y contable.
      </p>

      <h2>7. Tus derechos</h2>
      <p>Como titular de tus datos, en cualquier momento puedes solicitarnos:</p>
      <ul>
        <li><strong>Acceso:</strong> saber qué datos tuyos tenemos registrados y recibir una copia.</li>
        <li><strong>Rectificación:</strong> corregir un dato que esté errado o incompleto.</li>
        <li><strong>Supresión:</strong> que eliminemos tu postulación, tus datos y tus fotografías, salvo los que debamos conservar por ley.</li>
        <li><strong>Oposición:</strong> oponerte a un uso específico de tus datos, por ejemplo el contacto de marketing.</li>
        <li><strong>Portabilidad:</strong> recibir tus datos en un formato estructurado y de uso común.</li>
        <li><strong>Bloqueo:</strong> que suspendamos temporalmente el uso de tus datos mientras se resuelve un reclamo.</li>
      </ul>
      <p>
        {rightsUrl ? (
          <>Puedes ejercerlos en <a href={rightsUrl}>este formulario</a> o escribiéndonos a {writeTo}. </>
        ) : (
          <>Para ejercer cualquiera de estos derechos, escríbenos a {writeTo} indicando tu nombre completo y RUT. </>
        )}
        Antes de responder verificaremos tu identidad. Te responderemos dentro de {REQUEST_RESPONSE_DAYS} días corridos desde que recibamos tu solicitud; si es
        compleja, podremos prorrogar ese plazo y te explicaremos el motivo. Si no estás conforme con la respuesta, puedes reclamar ante la Agencia de
        Protección de Datos Personales.
      </p>

      <h2>8. Menores de edad</h2>
      <p>
        Si postulas siendo menor de edad, el formulario requiere el nombre y RUT de tu representante legal, quien
        debe estar en conocimiento y de acuerdo con tu participación y con el tratamiento de tus datos descrito en
        esta política. Tu representante puede ejercer en tu nombre los derechos de la sección anterior.
      </p>

      <h2>9. Cambios a esta política</h2>
      <p>
        Si esta política cambia, actualizaremos la fecha que aparece al inicio de esta página (versión {PRIVACY_POLICY_VERSION}). Te recomendamos
        revisarla si vuelves a postular en una convocatoria futura.
      </p>
    </LegalDocumentLayout>
  );
}
