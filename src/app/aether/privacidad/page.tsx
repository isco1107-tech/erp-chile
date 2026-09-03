import LegalDocumentLayout from '@/components/legal/LegalDocumentLayout';

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
  return (
    <LegalDocumentLayout
      eyebrow="Aether ERP Solutions"
      title="Política de privacidad de la plataforma"
      lastUpdated="1 de septiembre de 2026"
      backHref="/login"
      backLabel="Volver al inicio"
    >
      <p>
        Esta política describe cómo <strong>Aether ERP Solutions</strong> (en adelante, &ldquo;Aether&rdquo;) trata
        los datos personales al operar la plataforma de gestión empresarial (ERP/CRM) que ofrece a sus empresas
        clientes. Se rige por la Ley N.° 19.628 sobre Protección de la Vida Privada y, en lo que corresponda, por la
        Ley N.° 21.719 sobre Protección de Datos Personales.
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

      <h2>4. Proveedores externos (subencargados)</h2>
      <p>
        Aether utiliza proveedores externos para operar la infraestructura de la plataforma: hosting y ejecución de
        la aplicación, base de datos, almacenamiento de archivos (por ejemplo, fotografías o documentos que carga
        cada empresa usuaria) y envío de correos transaccionales. Estos proveedores procesan los datos únicamente
        para prestar ese servicio técnico a Aether, bajo las mismas obligaciones de confidencialidad.
      </p>

      <h2>5. Conservación</h2>
      <p>
        Los datos de cuenta se conservan mientras la empresa usuaria mantenga su suscripción activa. Al término de
        una relación comercial, Aether elimina o anonimiza los datos de cuenta según lo acordado con la empresa
        usuaria en su contrato de servicio.
      </p>

      <h2>6. Contacto</h2>
      <p>
        Para consultas sobre esta política o para ejercer tus derechos de acceso, rectificación, cancelación u
        oposición respecto de tus datos de cuenta como usuaria de la plataforma, escribe a [correo de contacto de
        Aether ERP].
      </p>
    </LegalDocumentLayout>
  );
}
