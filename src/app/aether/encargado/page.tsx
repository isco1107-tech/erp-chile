import LegalDocumentLayout from '@/components/legal/LegalDocumentLayout';
import { REQUEST_RESPONSE_DAYS } from '@/lib/privacy/constants';

export const metadata = { title: 'Contrato de encargo de tratamiento — Aether ERP Solutions' };

/**
 * Condiciones con que Aether trata datos personales por cuenta de las empresas
 * que contratan la plataforma. La empresa es la responsable (decide para qué
 * se usan los datos); Aether es la encargada. Describe lo que el sistema hace
 * hoy; los términos comerciales (precio, vigencia, responsabilidad económica)
 * van en el contrato de servicio de cada empresa.
 */
export default function EncargadoPage() {
  return (
    <LegalDocumentLayout
      eyebrow="Aether ERP Solutions"
      title="Contrato de encargo de tratamiento de datos personales"
      lastUpdated="2 de octubre de 2026"
      backHref="/aether/privacidad"
      backLabel="Volver a la política de privacidad"
    >
      <p>
        Estas condiciones regulan cómo <strong>Aether ERP Solutions</strong> («el encargado») trata datos personales por cuenta de la empresa que
        contrata la plataforma («el responsable»), conforme a la Ley N.° 21.719 sobre Protección de Datos Personales. Forman parte del contrato de
        servicio entre ambos.
      </p>

      <h2>1. Objeto y roles</h2>
      <p>
        El responsable decide qué datos personales carga en la plataforma y para qué fines. El encargado los trata únicamente para prestar el servicio
        contratado y conforme a las instrucciones documentadas del responsable, que incluyen el uso normal de las funciones del sistema. No los usa
        para fines propios.
      </p>

      <h2>2. Datos y titulares</h2>
      <p>
        El tipo de datos y de titulares depende de los módulos que el responsable use (clientes y proveedores, trabajadores, candidatas y sus apoderados,
        compradores de entradas o de votos, entre otros). Cada empresa puede ver y descargar el detalle en Configuración → Protección de datos →
        Registro de actividades. Si el responsable carga datos sensibles o de menores, es su responsabilidad contar con el fundamento que corresponda.
      </p>

      <h2>3. Confidencialidad</h2>
      <p>El personal del encargado con acceso a los datos está sujeto a un deber de confidencialidad. El acceso de cada persona usuaria está limitado por roles y permisos, y aislado del de las demás empresas.</p>

      <h2>4. Medidas de seguridad</h2>
      <p>
        El encargado aplica medidas técnicas y organizativas adecuadas al riesgo, entre ellas: contraseñas almacenadas con hash, sesiones firmadas,
        verificación en dos pasos opcional, aislamiento de datos por empresa, cifrado en reposo de credenciales y mensajes internos, bitácora de auditoría y
        registro de accesos a archivos sensibles.
      </p>

      <h2>5. Subencargados</h2>
      <p>
        El responsable autoriza de forma general el uso de los subencargados listados en <a href="/aether/subencargados">/aether/subencargados</a>. Si
        se agrega o reemplaza alguno, el encargado actualiza esa lista; el responsable puede objetar el cambio por escrito y, si no hay alternativa
        razonable, terminar el servicio. El encargado exige a sus subencargados obligaciones equivalentes a estas.
      </p>

      <h2>6. Transferencias internacionales</h2>
      <p>
        Algunos subencargados tratan datos fuera de Chile (por ejemplo, la base de datos principal está en Estados Unidos). El responsable queda
        informado de ello y es quien debe reflejarlo en su política de privacidad hacia sus titulares.
      </p>

      <h2>7. Derechos de los titulares</h2>
      <p>
        Si un titular se dirige al encargado por datos que pertenecen al responsable, el encargado le indicará que contacte al responsable. Para que el
        responsable cumpla el plazo de {REQUEST_RESPONSE_DAYS} días corridos de la ley, el sistema ofrece un formulario público de solicitudes con plazos, la búsqueda de todo lo que se
        guarda de una persona y una copia descargable de sus datos.
      </p>

      <h2>8. Vulneraciones de seguridad</h2>
      <p>
        El encargado informa al responsable, sin dilaciones indebidas, de toda vulneración de seguridad que afecte sus datos, con la información
        disponible para que el responsable decida sus avisos a la Agencia de Protección de Datos Personales y a los titulares. El sistema incluye un
        registro de incidentes para dejar constancia de lo ocurrido y de a quién se avisó.
      </p>

      <h2>9. Devolución y eliminación</h2>
      <p>
        Mientras el servicio esté vigente, el responsable puede exportar todos los datos de su empresa en formato JSON. Al término del contrato, el
        encargado elimina o anonimiza los datos en el plazo acordado en el contrato de servicio, salvo que una ley exija conservarlos.
      </p>

      <h2>10. Auditoría</h2>
      <p>El encargado pone a disposición del responsable la información necesaria para acreditar el cumplimiento de estas condiciones y permite auditorías razonables, previamente coordinadas.</p>
    </LegalDocumentLayout>
  );
}
