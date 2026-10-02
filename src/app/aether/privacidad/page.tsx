import Link from 'next/link';
import LegalDocumentLayout from '@/components/legal/LegalDocumentLayout';
import { REQUEST_RESPONSE_DAYS } from '@/lib/privacy/constants';
import { INTERNATIONAL_SUBPROCESSORS } from '@/lib/privacy/subprocessors';

export const metadata = { title: 'Política de privacidad — Aether ERP Solutions' };

/**
 * Política de privacidad del PRODUCTO (Aether ERP como proveedor de
 * software), distinta de `/politica-privacidad` (la política de la empresa
 * cliente que usa este ERP para su propio certamen). Es el destino de
 * `AetherBadge.tsx`, la pastilla "Hecho con Aether ERP" visible en toda la
 * app — de ahí que describa el rol de Aether como encargado del tratamiento
 * (procesa datos por cuenta de sus empresas clientes), no como responsable
 * de los datos finales de cada certamen/negocio que corre sobre la
 * plataforma.
 */
export default function AetherPrivacidadPage() {
  const contactEmail = process.env.AETHER_SALES_EMAIL?.trim() || 'aethererp1@gmail.com';
  return (
    <LegalDocumentLayout
      eyebrow="Aether ERP Solutions"
      title="Política de privacidad de la plataforma"
      lastUpdated="2 de octubre de 2026"
      backHref="/login"
      backLabel="Volver al inicio"
    >
      <p>
        Esta política describe cómo <strong>Aether ERP Solutions</strong> (en adelante, &ldquo;Aether&rdquo;) trata
        los datos personales al operar la plataforma de gestión empresarial (ERP/CRM) que ofrece a sus empresas
        clientes. Se rige por la Ley N.° 19.628 sobre Protección de la Vida Privada y por la Ley N.° 21.719 sobre
        Protección de Datos Personales, a medida que sus disposiciones entren en vigencia (1 de diciembre de 2026).
      </p>
      <p>
        Si llegaste aquí desde el formulario público de una empresa que usa Aether (por ejemplo, la postulación a un
        certamen, un portal de auspicios o una acreditación), la política que rige el tratamiento de{' '}
        <em>tus</em> datos como participante es la que publica esa empresa, no esta. Esta página describe la relación
        entre Aether y las empresas que contratan la plataforma.
      </p>

      <h2>1. Rol de Aether: encargado, no responsable, del dato final</h2>
      <p>
        Aether ERP es software provisto bajo la modalidad SaaS (Software as a Service) a empresas clientes
        independientes (&ldquo;empresas usuarias&rdquo;), cada una operando su propio espacio de datos aislado
        (multi-tenant). Frente a los datos que una empresa usuaria carga en su cuenta — sus clientes, proveedores,
        candidatas, ventas, inventario, etc. — Aether actúa como <strong>encargado del tratamiento</strong>: procesa
        esos datos por instrucción y cuenta de la empresa usuaria, que es la <strong>responsable</strong> de decidir
        qué datos recopilar y para qué fines. Cualquier solicitud sobre datos que aparecen en el sistema de una
        empresa usuaria debe dirigirse primero a esa empresa.
      </p>

      <h2>2. Datos que Aether recopila directamente</h2>
      <p>A nivel de plataforma (no del negocio de cada cliente), Aether recopila:</p>
      <ul>
        <li>Datos de cuenta de las personas usuarias del sistema: correo electrónico, rol y empresa a la que pertenecen.</li>
        <li>Registros de sesión: cookies de sesión cifradas, con una vigencia máxima de 8 horas.</li>
        <li>Bitácora de auditoría: qué acción se realizó, quién la realizó y cuándo, para trazabilidad y seguridad — nunca el contenido íntegro de los datos personales de terceros que gestiona cada empresa usuaria.</li>
        <li>Direcciones IP y metadatos técnicos de las solicitudes, con fines de seguridad (por ejemplo, limitar intentos de acceso automatizados a formularios públicos).</li>
      </ul>

      <h2>3. Medidas de seguridad</h2>
      <p>
        Las contraseñas se almacenan cifradas (nunca en texto plano). Las sesiones se firman digitalmente y viajan en
        cookies con las protecciones estándar del navegador contra robo o uso desde sitios no autorizados. El acceso
        a los datos de cada empresa está restringido por un sistema de roles y permisos, y aislado del de las demás
        empresas que usan la plataforma: una empresa usuaria nunca puede ver los datos de otra.
      </p>

      <h2>4. Proveedores externos (subencargados) y transferencias internacionales</h2>
      <p>
        Aether utiliza proveedores externos para operar la plataforma: hosting y ejecución de la aplicación, base de datos, almacenamiento de archivos,
        envío de correo, firma electrónica, cobro en línea y, de forma opcional, inteligencia artificial. Estos proveedores procesan los datos únicamente
        para prestar ese servicio técnico, bajo obligaciones de confidencialidad. La lista completa y actualizada está en{' '}
        <Link href="/aether/subencargados">/aether/subencargados</Link>.
      </p>
      <p>
        Algunos de ellos tratan datos fuera de Chile ({INTERNATIONAL_SUBPROCESSORS.map((p) => p.name).join(', ')}). Por ejemplo, la base de datos principal
        está alojada en Estados Unidos. Al usar la plataforma, las empresas usuarias aceptan estas transferencias, que Aether informa para que cada
        empresa pueda reflejarlas en su propia política de privacidad.
      </p>

      <h2>5. Conservación</h2>
      <p>
        Los datos de cuenta se conservan mientras la empresa usuaria mantenga su suscripción activa. Al término de
        una relación comercial, Aether elimina o anonimiza los datos de cuenta según lo acordado con la empresa
        usuaria en su contrato de servicio.
      </p>

      <h2>6. Vulneraciones de seguridad</h2>
      <p>
        Si Aether detecta una vulneración de seguridad que afecte datos personales de una empresa usuaria, se lo informará sin dilaciones indebidas y con
        la información necesaria para que esa empresa evalúe sus propios avisos a la Agencia de Protección de Datos Personales y a los titulares.
      </p>

      <h2>7. Derechos de los titulares</h2>
      <p>
        Las personas titulares de datos pueden pedir acceso, rectificación, supresión, oposición, portabilidad y bloqueo. Sobre los datos de cuenta de
        las personas usuarias de la plataforma, Aether responde en un plazo de {REQUEST_RESPONSE_DAYS} días corridos desde que recibe la solicitud. Sobre los datos que
        una empresa usuaria gestiona en su espacio, la solicitud debe dirigirse a esa empresa, y Aether la asiste con las herramientas del sistema
        (búsqueda y copia de los datos de una persona). Quien no esté conforme con una respuesta puede reclamar ante la Agencia de Protección de Datos
        Personales.
      </p>

      <h2>8. Contrato de encargo</h2>
      <p>
        Las empresas usuarias, como responsables de los datos, pueden revisar las condiciones con que Aether los trata en el{' '}
        <Link href="/aether/encargado">contrato de encargo de tratamiento</Link>.
      </p>

      <h2>9. Contacto</h2>
      <p>
        Para consultas sobre esta política o para ejercer tus derechos respecto de tus datos de cuenta como usuaria de la plataforma, escribe a{' '}
        <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
      </p>
    </LegalDocumentLayout>
  );
}
