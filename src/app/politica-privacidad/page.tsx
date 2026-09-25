import LegalDocumentLayout from '@/components/legal/LegalDocumentLayout';
import type { Metadata } from 'next';
import { cache, type ReactNode } from 'react';
import { getRegistrationPrivacyInfo } from '@/modules/candidates/services/candidates.service';

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

  return (
    <LegalDocumentLayout
      eyebrow={info?.projectName ?? 'Postulación al certamen'}
      title="Política de privacidad"
      lastUpdated="1 de septiembre de 2026"
      backHref="/"
      backLabel="Volver al inicio"
    >
      <p>
        Esta política explica qué datos personales recopila la organización de {certamen} (en adelante,
        &ldquo;la organización&rdquo;) a través del formulario público de postulación al certamen, con qué finalidad
        los trata, cómo los protege y qué derechos tiene la titular de esos datos. Se rige por la Ley N.° 19.628 sobre
        Protección de la Vida Privada y, en lo que corresponda, por la Ley N.° 21.719 sobre Protección de Datos
        Personales.
      </p>

      <h2>1. Responsable del tratamiento</h2>
      <p>
        El responsable del tratamiento de los datos recopilados en este formulario es {responsible}, RUT [RUT de la
        organización], con domicilio en [domicilio de la organización]. Cualquier consulta sobre esta política o sobre
        tus datos personales puede dirigirse a {writeTo}.
      </p>

      <h2>2. Qué datos recopilamos</h2>
      <p>Al postular, te pedimos:</p>
      <ul>
        <li>Datos de identificación: nombre completo, RUT y edad.</li>
        <li>Datos de contacto: teléfono, correo electrónico, comuna donde vives e Instagram.</li>
        <li>Por qué quieres participar en el certamen.</li>
        <li>Metadatos técnicos del envío (dirección IP y navegador/dispositivo usado), con fines exclusivos de seguridad — por ejemplo, para prevenir envíos automatizados o fraudulentos.</li>
      </ul>
      <p>
        No te pedimos ningún otro dato al inscribirte. Si quedas preseleccionada, la organización puede pedirte más
        información (por ejemplo, fotografías o tallas) para el desarrollo del certamen, con este mismo resguardo.
      </p>

      <h2>3. Para qué usamos tus datos</h2>
      <p>Usamos los datos que entregas exclusivamente para:</p>
      <ul>
        <li>Evaluar tu postulación y gestionar el proceso de selección del certamen (revisión, citación a casting, avance de ronda o descarte).</li>
        <li>Contactarte durante el proceso — por ejemplo, para avisarte de un cambio de etapa o coordinar una actividad.</li>
        <li>Verificar que cumples los requisitos de participación indicados en las bases del certamen (por ejemplo, la edad mínima).</li>
      </ul>
      <p>
        No vendemos ni compartimos tus datos con terceros ajenos a la organización del certamen, salvo obligación
        legal o requerimiento de una autoridad competente.
      </p>

      <h2>4. Cómo protegemos tus fotografías (si las entregas)</h2>
      <p>
        Tus fotografías se almacenan fuera de cualquier carpeta de acceso público: no existe una URL adivinable que
        las muestre directamente. Solo personal de la organización con un permiso específico (distinto del acceso
        general al listado de postulantes) puede verlas o descargarlas, y cada vez que alguien lo hace queda
        registrado en la bitácora interna del proceso, con fecha y usuario responsable.
      </p>

      <h2>5. Cuánto tiempo conservamos tus datos</h2>
      <p>
        Mientras tu postulación esté activa (en revisión, citada a casting, preseleccionada, finalista o ganadora),
        conservamos tus datos para el desarrollo normal del certamen. Si tu postulación es descartada, tus datos y
        fotografías se eliminan de forma automática pasado un período de retención definido por la organización —
        no quedan indefinidamente en el sistema por el solo hecho de haber postulado.
      </p>

      <h2>6. Tus derechos</h2>
      <p>Como titular de tus datos, en cualquier momento puedes solicitarnos:</p>
      <ul>
        <li><strong>Acceso:</strong> saber qué datos tuyos tenemos registrados.</li>
        <li><strong>Rectificación:</strong> corregir un dato que esté mal ingresado.</li>
        <li><strong>Cancelación/eliminación:</strong> que borremos por completo tu postulación, tus datos y tus fotografías de nuestros sistemas.</li>
        <li><strong>Oposición:</strong> oponerte a un uso específico de tus datos, por ejemplo el contacto de marketing.</li>
      </ul>
      <p>
        Para ejercer cualquiera de estos derechos, escríbenos a {writeTo} indicando tu nombre completo y RUT.
        Responderemos dentro de los plazos que establece la ley.
      </p>

      <h2>7. Menores de edad</h2>
      <p>
        Si postulas siendo menor de edad, el formulario requiere el nombre y RUT de tu representante legal, quien
        debe estar en conocimiento y de acuerdo con tu participación y con el tratamiento de tus datos descrito en
        esta política.
      </p>

      <h2>8. Cambios a esta política</h2>
      <p>
        Si esta política cambia, actualizaremos la fecha que aparece al inicio de esta página. Te recomendamos
        revisarla si vuelves a postular en una convocatoria futura.
      </p>
    </LegalDocumentLayout>
  );
}
