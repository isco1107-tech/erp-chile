import Link from 'next/link';
import LegalDocumentLayout from '@/components/legal/LegalDocumentLayout';

export const metadata = {
  title: 'Términos de servicio — Aether ERP Solutions',
  description: 'Condiciones de uso de la plataforma Aether ERP para empresas clientes.',
};

/**
 * Términos de servicio de la PLATAFORMA (Aether como proveedor SaaS). Mismo
 * layout y mismo tono que `/aether/privacidad`, con la que se complementa.
 *
 * Nota para el equipo: es un texto base redactado a partir de cómo funciona
 * hoy el producto (multiempresa, módulos contratados, exportación JSON, DTE sin
 * envío automático al SII). Antes de usarlo como contrato conviene que lo
 * revise un abogado y que se ajusten plazos y condiciones comerciales reales.
 */
export default function AetherTerminosPage() {
  return (
    <LegalDocumentLayout
      eyebrow="Aether ERP Solutions"
      title="Términos de servicio"
      lastUpdated="22 de septiembre de 2026"
      backHref="/"
      backLabel="Volver al inicio"
    >
      <p>
        Estos términos regulan el uso de la plataforma de gestión empresarial <strong>Aether ERP</strong> (en
        adelante, &ldquo;la plataforma&rdquo;) por parte de las empresas que la contratan (&ldquo;empresas
        usuarias&rdquo;) y de las personas que ellas invitan a usarla. Al crear una cuenta o usar la plataforma,
        la empresa usuaria acepta estos términos y la{' '}
        <Link href="/aether/privacidad">política de privacidad de la plataforma</Link>.
      </p>

      <h2>1. El servicio</h2>
      <p>
        Aether ERP es software provisto como servicio (SaaS) a través del navegador y de un cliente de escritorio.
        Cada empresa usuaria opera en un espacio de datos aislado de las demás y accede solo a los módulos que tiene
        contratados. Los módulos disponibles, la cantidad de usuarios y de bodegas dependen del plan acordado en la
        cotización o contrato comercial vigente.
      </p>

      <h2>2. Cuentas y accesos</h2>
      <ul>
        <li>La empresa usuaria es responsable de las personas que invita y de los roles y permisos que les asigna.</li>
        <li>Cada persona debe mantener su contraseña en reserva y avisar de inmediato ante cualquier uso no autorizado.</li>
        <li>Aether puede suspender un acceso que represente un riesgo de seguridad para la plataforma o para otras empresas usuarias.</li>
      </ul>

      <h2>3. Datos de la empresa usuaria</h2>
      <p>
        Los datos que la empresa usuaria carga en la plataforma le pertenecen. Aether los trata solo para prestar el
        servicio, como encargado del tratamiento, según se describe en la política de privacidad. Cualquier persona
        con el permiso de exportación puede descargar en todo momento la información completa de su empresa en
        formato JSON, sin contraseñas ni credenciales en el archivo.
      </p>

      <h2>4. Documentos tributarios</h2>
      <p>
        La plataforma genera documentos tributarios electrónicos con folios autorizados por el SII (CAF) y su timbre
        electrónico. La firma con el certificado digital de la empresa y el envío automático al SII no están
        disponibles todavía; mientras tanto, la empresa usuaria es responsable de cumplir sus obligaciones de envío
        y declaración ante el SII. La configuración tributaria (tasas de PPM, retención de honorarios, folios) la
        define y revisa la empresa usuaria.
      </p>

      <h2>5. Uso aceptable</h2>
      <p>No está permitido usar la plataforma para:</p>
      <ul>
        <li>Intentar acceder a datos de otra empresa usuaria o eludir los controles de acceso.</li>
        <li>Cargar contenido ilícito o datos personales de terceros sin la base legal correspondiente.</li>
        <li>Realizar pruebas de carga, ataques o extracción automatizada no acordadas por escrito con Aether.</li>
      </ul>

      <h2>6. Disponibilidad y soporte</h2>
      <p>
        Aether procura mantener la plataforma disponible de forma continua y realiza mantenciones procurando afectar
        lo menos posible la operación. Los niveles de servicio y de soporte específicos son los que se acuerden en
        el contrato comercial de cada empresa usuaria.
      </p>

      <h2>7. Precio, facturación y término</h2>
      <p>
        El precio corresponde a los módulos y al plan contratados según la cotización aceptada. La empresa usuaria
        puede poner término al servicio según las condiciones de su contrato; antes del término puede exportar sus
        datos. Una vez terminada la relación, Aether elimina o anonimiza los datos según lo acordado.
      </p>

      <h2>8. Responsabilidad</h2>
      <p>
        La plataforma es una herramienta de gestión: las decisiones comerciales, contables y tributarias que se
        tomen a partir de su información son de la empresa usuaria. Aether responde por la correcta prestación del
        servicio en los términos del contrato comercial y de la legislación chilena aplicable.
      </p>

      <h2>9. Cambios a estos términos</h2>
      <p>
        Aether puede actualizar estos términos. Los cambios relevantes se informarán a las empresas usuarias con
        anticipación razonable y la fecha de &ldquo;última actualización&rdquo; de esta página indica la versión
        vigente.
      </p>

      <h2>10. Ley aplicable y contacto</h2>
      <p>
        Estos términos se rigen por las leyes de la República de Chile. Para consultas sobre ellos, escríbenos a{' '}
        <a href={`mailto:${process.env.AETHER_SALES_EMAIL ?? 'aethererp1@gmail.com'}`}>
          {process.env.AETHER_SALES_EMAIL ?? 'aethererp1@gmail.com'}
        </a>
        .
      </p>
    </LegalDocumentLayout>
  );
}
