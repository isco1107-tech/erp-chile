import Link from 'next/link';
import LegalDocumentLayout from '@/components/legal/LegalDocumentLayout';
import { TERMS_VERSION } from '@/lib/legal/constants';

export const metadata = {
  title: 'Términos de servicio — Aether ERP Solutions',
  description: 'Condiciones de uso de la plataforma Aether ERP para empresas clientes.',
};

/**
 * Términos de servicio de la PLATAFORMA (Aether como proveedor SaaS). Se
 * complementan con `/aether/privacidad` y con el contrato de encargo
 * `/aether/encargado`, que fija las obligaciones de protección de datos.
 *
 * Describe lo que el producto hace hoy (multiempresa, módulos contratados,
 * exportación JSON, DTE sin envío automático al SII, agentes de IA, módulo de
 * certámenes). Al cambiar el texto, sube `TERMS_VERSION` en
 * `src/lib/legal/constants.ts`: cada usuario guarda la versión que aceptó.
 *
 * La identidad del proveedor sale de `AETHER_LEGAL_NAME`, `AETHER_LEGAL_RUT` y
 * `AETHER_LEGAL_ADDRESS`. Es un texto de base: antes de firmar contratos
 * conviene que lo revise un abogado (ver `docs/legal/README.md`).
 */
export default function AetherTerminosPage() {
  const legalName = process.env.AETHER_LEGAL_NAME ?? 'Aether ERP Solutions';
  const legalRut = process.env.AETHER_LEGAL_RUT;
  const legalAddress = process.env.AETHER_LEGAL_ADDRESS;
  const contactEmail = process.env.AETHER_SALES_EMAIL ?? 'aethererp1@gmail.com';

  return (
    <LegalDocumentLayout
      eyebrow="Aether ERP Solutions"
      title="Términos de servicio"
      lastUpdated="3 de octubre de 2026"
      backHref="/"
      backLabel="Volver al inicio"
    >
      <p>
        Estos términos regulan el uso de la plataforma de gestión empresarial Aether ERP (&ldquo;la plataforma&rdquo;), provista por{' '}
        <strong>{legalName}</strong>
        {legalRut ? <>, RUT {legalRut}</> : null}
        {legalAddress ? <>, con domicilio en {legalAddress}</> : null} (&ldquo;Aether&rdquo;), a las empresas que la contratan (&ldquo;el
        cliente&rdquo;) y a las personas que el cliente invita a usarla (&ldquo;usuarios&rdquo;). Forman parte de estos términos la{' '}
        <Link href="/aether/privacidad">Política de privacidad</Link>, el <Link href="/aether/encargado">Contrato de encargo de tratamiento</Link> y
        la cotización o contrato comercial aceptado por el cliente. Si hay contradicción, prima el contrato comercial firmado, luego el contrato de
        encargo y luego estos términos.
      </p>
      <p>
        Cada usuario acepta estos términos al activar su cuenta; la plataforma registra la versión aceptada y la fecha. Versión vigente:{' '}
        <strong>{TERMS_VERSION}</strong>.
      </p>

      <h2>1. El servicio</h2>
      <p>
        Aether ERP es software provisto como servicio (SaaS) por navegador y por un cliente de escritorio. Cada cliente opera en un espacio de datos
        aislado de los demás y accede solo a los módulos contratados. Los módulos, la cantidad de usuarios, bodegas y demás límites son los del plan
        acordado. Las funciones marcadas como &ldquo;beta&rdquo; o &ldquo;en desarrollo&rdquo; se entregan tal como están, pueden cambiar o retirarse, y
        no deben usarse como único respaldo de una obligación legal.
      </p>

      <h2>2. Cuentas, accesos y seguridad</h2>
      <ul>
        <li>El cliente decide a quién invita y qué permisos le asigna, y responde por lo que hagan sus usuarios dentro de la plataforma.</li>
        <li>Cada usuario mantiene su contraseña en reserva, no comparte su cuenta y avisa de inmediato a Aether ante un uso no autorizado.</li>
        <li>Se recomienda activar la verificación en dos pasos y la lista de IP permitidas, disponibles en Configuración.</li>
        <li>
          Aether puede suspender un acceso que represente un riesgo de seguridad para la plataforma o para otros clientes, avisando al cliente lo antes
          posible.
        </li>
      </ul>

      <h2>3. Datos del cliente y protección de datos personales</h2>
      <p>
        Los datos que el cliente carga le pertenecen. Aether los trata solo para prestar el servicio, como <strong>encargado del tratamiento</strong>,
        en los términos del contrato de encargo y de la Ley N.° 19.628 y la Ley N.° 21.719. El cliente es el <strong>responsable</strong> de esos datos y
        en particular de:
      </p>
      <ul>
        <li>Contar con una base legal para cada dato que carga (consentimiento, contrato, obligación legal o interés legítimo) e informar a los titulares.</li>
        <li>
          Los datos sensibles y de menores de edad (por ejemplo, certificados médicos, medidas o datos de candidatas menores): obtener el consentimiento
          expreso que corresponda y, en el caso de menores, la autorización de su representante legal.
        </li>
        <li>Responder las solicitudes de los titulares; la plataforma le entrega las herramientas para hacerlo (Configuración → Protección de datos).</li>
        <li>Definir los plazos de conservación de sus datos y configurar las purgas disponibles.</li>
      </ul>
      <p>
        Cualquier usuario con el permiso de exportación puede descargar en todo momento los datos completos de su empresa en formato JSON. Aether no vende
        datos del cliente ni los usa para fines propios o publicidad, ni para entrenar modelos propios.
      </p>

      <h2>4. Documentos tributarios, contabilidad y remuneraciones</h2>
      <p>
        La plataforma genera documentos tributarios electrónicos con folios autorizados por el SII (CAF) y su timbre electrónico. La firma con el
        certificado digital de la empresa, el envío automático al SII y el consumo de folios <strong>no están disponibles todavía</strong>: mientras
        tanto, el cliente cumple por su cuenta el envío y la declaración ante el SII.
      </p>
      <p>
        Los cálculos (IVA, F29, PPM, retenciones, costo de inventario, liquidaciones de sueldo, depreciación) se hacen con los datos y parámetros que el
        cliente ingresa o confirma, como las tasas, la UF, la UTM y los topes previsionales. Aether no es asesor tributario, contable, laboral ni legal:
        el cliente y su contador revisan la información antes de declararla o pagarla. Aether no responde por multas, intereses o diferencias de
        impuestos que se originen en datos o parámetros ingresados por el cliente o en declaraciones que el cliente no revisó.
      </p>

      <h2>5. Asistentes de inteligencia artificial</h2>
      <p>
        Algunas funciones usan modelos de inteligencia artificial de terceros (indicados en <Link href="/aether/subencargados">subencargados</Link>).
        Sus respuestas son <strong>sugerencias que pueden contener errores</strong>, y no reemplazan la revisión de una persona ni la asesoría
        profesional. Las acciones que proponen se ejecutan solo cuando un usuario las confirma, y nunca emiten documentos tributarios, mueven stock ni
        registran pagos por sí solas. Lo que se envía a esos proveedores queda sujeto a sus propias condiciones: en sus planes gratuitos, el proveedor puede
        usarlo para mejorar sus productos. El cliente decide si activa estas funciones y evita ingresar en ellas datos sensibles que no sean
        necesarios.
      </p>

      <h2>6. Certámenes, eventos, entradas, votos y pagos en línea</h2>
      <p>
        Cuando el cliente organiza un certamen o evento con la plataforma, Aether actúa solo como proveedor tecnológico. El <strong>cliente es el
        organizador</strong> y responde ante las participantes, el público y las autoridades por:
      </p>
      <ul>
        <li>Las bases y el reglamento del certamen, la selección, el jurado y los premios.</li>
        <li>
          Las autorizaciones de las participantes y, si son menores de edad, de sus representantes legales; los contratos y autorizaciones de uso de
          imagen.
        </li>
        <li>
          La venta de entradas y de votos: precios, información al público, cambios, devoluciones y demás derechos del consumidor (Ley N.° 19.496), la
          emisión de los documentos tributarios correspondientes y los permisos que el evento requiera.
        </li>
        <li>
          Que la votación pagada sea una actividad lícita según las reglas que el propio cliente publique (por ejemplo, que no dependa del azar ni se
          ofrezca como sorteo).
        </li>
        <li>
          Los cobros en línea (por ejemplo, por Khipu): el contrato con la pasarela es del cliente, con sus propias credenciales, y el dinero llega
          directamente a sus cuentas. Aether no recibe, retiene ni administra esos fondos.
        </li>
      </ul>

      <h2>7. Uso aceptable</h2>
      <p>No está permitido usar la plataforma para:</p>
      <ul>
        <li>Intentar acceder a datos de otro cliente o eludir los controles de acceso.</li>
        <li>Cargar contenido ilícito, engañoso o que infrinja derechos de terceros, o datos personales sin base legal.</li>
        <li>Enviar comunicaciones masivas no solicitadas (spam) a través de los correos o webhooks de la plataforma.</li>
        <li>Publicar en los sitios web y micrositios contenido que suplante a otra persona u organización.</li>
        <li>Realizar pruebas de carga, ataques, ingeniería inversa o extracción automatizada no acordadas por escrito con Aether.</li>
      </ul>
      <p>Aether puede retirar contenido o suspender la cuenta que infrinja esta sección, avisando al cliente con el motivo.</p>

      <h2>8. Disponibilidad, mantenciones y respaldos</h2>
      <p>
        Aether procura mantener la plataforma disponible de forma continua, pero no garantiza un funcionamiento ininterrumpido ni libre de errores salvo
        que el contrato comercial fije un nivel de servicio. La plataforma depende de proveedores de infraestructura y de servicios externos (por
        ejemplo, hosting, base de datos, correo, el SII y las pasarelas de pago), cuya falla puede afectar el servicio. Las mantenciones programadas se
        procuran fuera del horario hábil.
      </p>
      <p>
        Aether mantiene respaldos de la base de datos con la ventana de restauración que permite su infraestructura. Se recomienda que el cliente
        descargue periódicamente la exportación completa de su empresa como respaldo propio.
      </p>

      <h2>9. Precio, facturación y suspensión por no pago</h2>
      <p>
        El precio corresponde a los módulos y al plan contratados según la cotización aceptada, más IVA cuando corresponda. Aether puede actualizar sus
        precios avisando con al menos 30 días de anticipación; el cliente que no acepte el cambio puede poner término al servicio antes de que rija. Si
        una factura queda impaga 15 días después de su vencimiento y de un aviso por correo, Aether puede suspender el acceso hasta que se regularice,
        sin borrar datos durante la suspensión.
      </p>

      <h2>10. Duración y término</h2>
      <ul>
        <li>El servicio dura lo que indique el contrato comercial y, si nada dice, se renueva mes a mes.</li>
        <li>Cualquiera de las partes puede ponerle término avisando por escrito con 30 días de anticipación.</li>
        <li>Aether puede terminarlo de inmediato ante un incumplimiento grave de la sección 7.</li>
        <li>
          Tras el término, el cliente tiene <strong>30 días</strong> para exportar sus datos. Luego Aether los elimina o anonimiza dentro de los{' '}
          <strong>90 días</strong> siguientes, incluidos sus respaldos a medida que estos expiran, salvo lo que una ley obligue a conservar.
        </li>
      </ul>

      <h2>11. Propiedad intelectual</h2>
      <p>
        El software, su código, diseño, marcas y documentación son de Aether o de sus licenciantes. El cliente recibe una licencia de uso no exclusiva,
        intransferible y vigente mientras dure el servicio. Las sugerencias que el cliente haga para mejorar la plataforma pueden incorporarse sin
        obligación de pago. El contenido que el cliente carga (logos, fotografías, textos) sigue siendo suyo; el cliente autoriza a Aether a alojarlo y
        mostrarlo solo para prestar el servicio.
      </p>

      <h2>12. Confidencialidad</h2>
      <p>
        Ambas partes mantienen en reserva la información no pública que reciban de la otra y la usan solo para este servicio, durante su vigencia y por
        tres años después de su término, salvo que una ley o autoridad competente exija revelarla.
      </p>

      <h2>13. Limitación de responsabilidad</h2>
      <p>
        Cada parte responde por los daños directos que cause por incumplir estos términos. En la medida que la ley lo permita, ninguna parte responde por
        lucro cesante, pérdida de oportunidades de negocio, daño a la imagen ni otros daños indirectos. La responsabilidad total de Aether por cualquier
        causa relacionada con el servicio no excede el monto que el cliente le haya pagado en los <strong>12 meses</strong> anteriores al hecho que la
        origina. Estas limitaciones no aplican al dolo o la culpa grave, ni a las obligaciones que la ley no permite limitar.
      </p>

      <h2>14. Indemnidad</h2>
      <p>
        El cliente mantendrá indemne a Aether frente a reclamos de terceros, incluidos titulares de datos, participantes, compradores y autoridades,
        que se originen en los datos o contenidos que el cliente carga, en la falta de una base legal o autorización que le correspondía obtener, o en la
        organización de sus eventos, certámenes y ventas.
      </p>

      <h2>15. Fuerza mayor</h2>
      <p>
        Ninguna parte responde por incumplimientos causados por hechos fuera de su control razonable, como cortes generalizados de proveedores de
        infraestructura o de internet, desastres naturales, actos de autoridad o ataques informáticos a gran escala que no se pudieron evitar con medidas
        razonables.
      </p>

      <h2>16. Comunicaciones y cambios a estos términos</h2>
      <p>
        Las comunicaciones se envían al correo del usuario dueño de la cuenta del cliente y al de Aether indicado abajo. Aether puede actualizar estos
        términos avisando los cambios relevantes con al menos 30 días de anticipación; el uso posterior implica su aceptación y el cliente que no esté
        de acuerdo puede poner término al servicio antes de que rijan.
      </p>

      <h2>17. Ley aplicable y tribunales</h2>
      <p>
        Estos términos se rigen por las leyes de la República de Chile. Las controversias se someten a los tribunales ordinarios de justicia de la
        ciudad de Santiago, sin perjuicio de los derechos irrenunciables que la Ley N.° 19.496 otorga al cliente que sea consumidor. Si una cláusula
        resulta inválida, las demás siguen vigentes. El cliente no puede ceder este contrato sin autorización de Aether.
      </p>

      <h2>18. Contacto</h2>
      <p>
        Consultas sobre estos términos: <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
      </p>
    </LegalDocumentLayout>
  );
}
